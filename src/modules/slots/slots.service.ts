import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import type { RespuestaLista } from '../../../contract/api.js';
import type { Turno } from '../../../contract/types.js';
import { ErrorApi } from '../../common/errors/error-api.js';
import {
  diaEnZona,
  diaDeSemana,
  esDiaValido,
} from '../../common/dates/dates.js';
import { esIdDe } from '../../common/ids/ids.js';
import { Reloj } from '../../common/clock/clock.js';
import { meta, type PaginacionDto } from '../../common/response/pagination.js';
import { respuestaLista } from '../../common/response/response.js';
import { EspacioEntidad } from '../venues/venue.entity.js';
import { UsuarioEntidad } from '../users/user.entity.js';
import { BloqueoEntidad } from './block.entity.js';
import { ReservaFijaEntidad } from './standing-booking.entity.js';
import { ReservaEntidad } from './reserva.entity.js';
import { armarGrilla } from './rules/grid.js';
import { fechaEnRango } from './rules/date-range.js';

@Injectable()
export class TurnosServicio {
  constructor(
    private readonly reloj: Reloj,
    @InjectRepository(EspacioEntidad)
    private readonly espacios: Repository<EspacioEntidad>,
    @InjectRepository(UsuarioEntidad)
    private readonly usuarios: Repository<UsuarioEntidad>,
    @InjectRepository(ReservaEntidad)
    private readonly reservas: Repository<ReservaEntidad>,
    @InjectRepository(ReservaFijaEntidad)
    private readonly fijas: Repository<ReservaFijaEntidad>,
    @InjectRepository(BloqueoEntidad)
    private readonly bloqueos: Repository<BloqueoEntidad>,
  ) {}

  async grilla(
    espacioId: string,
    p: PaginacionDto & { fecha?: string },
  ): Promise<RespuestaLista<Turno>> {
    const hoy = diaEnZona(this.reloj.ahora());
    const fecha = p.fecha ?? hoy;
    if (!esDiaValido(fecha))
      throw new ErrorApi(
        'VALIDACION_FALLIDA',
        'La fecha tiene que ser un día con la forma AAAA-MM-DD.',
      );
    const espacio = esIdDe('esp', espacioId)
      ? await this.espacios.findOneBy({ id: espacioId, activo: true })
      : null;
    if (!espacio) throw new ErrorApi('ESPACIO_NO_ENCONTRADO');
    if (!fechaEnRango(fecha, hoy)) throw new ErrorApi('FECHA_FUERA_DE_RANGO');

    const turnos = await this.turnosDelDia(espacio, fecha);
    const desde = (p.pagina - 1) * p.porPagina;
    return respuestaLista(
      turnos.slice(desde, desde + p.porPagina),
      meta(turnos.length, p),
    );
  }

  /**
   * R2 para todos los espacios activos, por espacio (id) e `inicio`. Sin límite de
   * rango: el personal también mira días pasados.
   */
  async agenda(
    p: PaginacionDto & { fecha?: string },
  ): Promise<RespuestaLista<Turno>> {
    const fecha = p.fecha ?? diaEnZona(this.reloj.ahora());
    if (!esDiaValido(fecha))
      throw new ErrorApi(
        'VALIDACION_FALLIDA',
        'La fecha tiene que ser un día con la forma AAAA-MM-DD.',
      );
    const espacios = await this.espacios.find({
      where: { activo: true },
      order: { id: 'ASC' },
    });
    const turnos: Turno[] = [];
    if (espacios.length > 0) {
      const ids = espacios.map((e) => e.id);
      const [reservas, fijas, bloqueos] = await Promise.all([
        this.reservas.find({
          where: {
            espacioId: In(ids),
            fecha,
            estado: In(['confirmada', 'cumplida', 'ausente']),
          },
          order: { id: 'ASC' },
        }),
        this.fijas.find({
          where: { espacioId: In(ids), activa: true },
          order: { id: 'ASC' },
        }),
        this.bloqueos.find({
          where: { espacioId: In(ids), fecha },
          order: { id: 'ASC' },
        }),
      ]);
      const usuarios = reservas.length
        ? await this.usuarios.find({
            where: { id: In([...new Set(reservas.map((r) => r.usuarioId))]) },
          })
        : [];
      const usuariosPorId = new Map(usuarios.map((u) => [u.id, u]));
      const reservasPorId = new Map(reservas.map((r) => [r.id, r]));
      const dia = diaDeSemana(fecha);

      for (const e of espacios) {
        const grilla = armarGrilla(
          e,
          fecha,
          reservas.filter((r) => r.espacioId === e.id),
          fijas.filter((f) => f.espacioId === e.id),
          bloqueos.filter((b) => b.espacioId === e.id),
        );
        for (const turno of grilla) {
          const reserva = turno.reservaId
            ? reservasPorId.get(turno.reservaId)
            : undefined;
          const fija =
            turno.estado === 'fijo'
              ? fijas.find(
                  (item) =>
                    item.espacioId === e.id &&
                    item.dia === dia &&
                    item.desde <= fecha &&
                    (item.hasta === null || fecha <= item.hasta) &&
                    item.inicio <= turno.inicio &&
                    turno.inicio < item.fin,
                )
              : undefined;
          const usuario = reserva
            ? usuariosPorId.get(reserva.usuarioId)
            : undefined;

          turnos.push({
            ...turno,
            espacioNombre: e.nombre,
            titular: reserva
              ? usuario
                ? {
                    usuarioId: usuario.id,
                    nombre: usuario.nombre,
                    telefono: usuario.telefono,
                    cantidadPersonas: reserva.cantidadPersonas,
                  }
                : null
              : fija
                ? {
                    usuarioId: null,
                    nombre: fija.titular,
                    telefono: null,
                    cantidadPersonas: null,
                  }
                : null,
            reservaEstado: reserva?.estado ?? null,
            ingresoEn: reserva?.ingresoEn?.toISOString() ?? null,
          });
        }
      }
    }
    const desde = (p.pagina - 1) * p.porPagina;
    return respuestaLista(
      turnos.slice(desde, desde + p.porPagina),
      meta(turnos.length, p),
    );
  }

  /** Los 16 turnos de un espacio en un día: el cruce de reservas, fijas y bloqueos (R2). */
  async turnosDelDia(
    espacio: Pick<EspacioEntidad, 'id' | 'precioPorHora'>,
    fecha: string,
  ): Promise<Turno[]> {
    const espacioId = espacio.id;
    const [reservas, fijas, bloqueos] = await Promise.all([
      this.reservas.find({
        where: {
          espacioId,
          fecha,
          estado: In(['confirmada', 'cumplida', 'ausente']),
        },
        order: { id: 'ASC' },
      }),
      this.fijas.find({
        where: { espacioId, activa: true },
        order: { id: 'ASC' },
      }),
      this.bloqueos.find({ where: { espacioId, fecha }, order: { id: 'ASC' } }),
    ]);
    return armarGrilla(espacio, fecha, reservas, fijas, bloqueos);
  }
}
