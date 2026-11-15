import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import type { Inspeccion, RespuestaLista } from '../../../contract/api.js';
import { ErrorApi } from '../../common/errors/error-api.js';
import { ArchivosServicio } from '../../common/files/files.service.js';
import { esClaveValida } from '../../common/files/keys.js';
import { origenDelPedido } from '../../common/context/request-context.js';
import { nuevoId, esIdDe } from '../../common/ids/ids.js';
import { Reloj } from '../../common/clock/clock.js';
import { desplazamiento, meta } from '../../common/response/pagination.js';
import { respuestaLista } from '../../common/response/response.js';
import { EspacioEntidad } from '../venues/venue.entity.js';
import type { UsuarioSesion } from '../../common/auth/decorators.js';
import type {
  CrearInspeccionDto,
  FiltrosInspeccionesDto,
} from './dto/inspection.dto.js';
import { InspeccionEntidad } from './inspection.entity.js';
import { aContrato } from './inspection.mapper.js';

@Injectable()
export class InspeccionesServicio {
  constructor(
    private readonly reloj: Reloj,
    private readonly archivos: ArchivosServicio,
    @InjectRepository(EspacioEntidad)
    private readonly espacios: Repository<EspacioEntidad>,
    @InjectRepository(InspeccionEntidad)
    private readonly inspecciones: Repository<InspeccionEntidad>,
  ) {}

  async crear(
    dto: CrearInspeccionDto,
    usuario: UsuarioSesion,
  ): Promise<Inspeccion> {
    const espacio = esIdDe('esp', dto.espacioId)
      ? await this.espacios.findOneBy({ id: dto.espacioId })
      : null;
    if (!espacio) throw new ErrorApi('ESPACIO_NO_ENCONTRADO');

    const evidencias = await Promise.all(
      dto.evidencias.map((url) => this.claveDeEvidencia(url)),
    );
    const inspeccion = this.inspecciones.create({
      id: nuevoId('ins'),
      espacioId: espacio.id,
      usuarioId: usuario.id,
      observacion: dto.observacion.trim(),
      evidencias,
      creadaEn: this.reloj.ahora(),
    });
    await this.inspecciones.insert(inspeccion);
    return aContrato(inspeccion);
  }

  async listar(
    filtros: FiltrosInspeccionesDto,
  ): Promise<RespuestaLista<Inspeccion>> {
    const where: FindOptionsWhere<InspeccionEntidad> = {};
    if (filtros.espacioId !== undefined) where.espacioId = filtros.espacioId;
    const [filas, total] = await this.inspecciones.findAndCount({
      where,
      order: { creadaEn: 'DESC', id: 'DESC' },
      ...desplazamiento(filtros),
    });
    return respuestaLista(filas.map(aContrato), meta(total, filtros));
  }

  private async claveDeEvidencia(urlTexto: string): Promise<string> {
    const origen = origenDelPedido();
    if (origen === null) throw new Error('Falta el contexto del pedido.');

    let url: URL;
    try {
      url = new URL(urlTexto);
    } catch {
      throw new ErrorApi('ARCHIVO_NO_SUBIDO');
    }

    if (
      url.origin !== origen ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== '' ||
      !url.pathname.startsWith('/archivos/')
    ) {
      throw new ErrorApi('ARCHIVO_NO_SUBIDO');
    }

    let clave: string;
    try {
      clave = decodeURIComponent(url.pathname.slice('/archivos/'.length));
    } catch {
      throw new ErrorApi('ARCHIVO_NO_SUBIDO');
    }

    if (
      !esClaveValida(clave) ||
      !(clave.startsWith('imagenes/') || clave.startsWith('videos/')) ||
      !(await this.archivos.existe(clave))
    )
      throw new ErrorApi('ARCHIVO_NO_SUBIDO');
    return clave;
  }
}
