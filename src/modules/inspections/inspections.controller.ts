import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  Inspeccion,
  RespuestaLista,
  RespuestaUno,
} from '../../../contract/api.js';
import {
  Roles,
  SesionActual,
  type UsuarioSesion,
} from '../../common/auth/decorators.js';
import { respuestaUno } from '../../common/response/response.js';
import { InspeccionesServicio } from './inspections.service.js';
import {
  CrearInspeccionDto,
  FiltrosInspeccionesDto,
} from './dto/inspection.dto.js';

@ApiTags('Inspecciones')
@ApiBearerAuth()
@Controller('inspecciones')
@Roles('encargado', 'administrador')
export class InspeccionesControlador {
  constructor(private readonly servicio: InspeccionesServicio) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar una inspección de cancha',
    description:
      'Encargado o administrador. Primero subí cada foto o video con `POST /archivos` ' +
      'y mandá las URLs devueltas. Se conserva el historial.\n\n' +
      'Errores: VALIDACION_FALLIDA (400), NO_AUTENTICADO (401), SIN_PERMISO (403), ' +
      'ESPACIO_NO_ENCONTRADO (404), ARCHIVO_NO_SUBIDO (422).',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        datos: {
          id: 'ins-k3x9qm7a2b1',
          espacioId: 'esp-02',
          usuarioId: 'usr-301',
          observacion: 'La red tiene un corte en el lateral.',
          evidencias: [
            'http://192.168.0.10:3000/archivos/imagenes/2026/09/abc12345.jpg',
          ],
          creadaEn: '2026-09-19T10:00:00-03:00',
        },
        meta: null,
      },
    },
  })
  async crear(
    @Body() dto: CrearInspeccionDto,
    @SesionActual() usuario: UsuarioSesion,
  ): Promise<RespuestaUno<Inspeccion>> {
    return respuestaUno(await this.servicio.crear(dto, usuario));
  }

  @Get()
  @ApiOperation({
    summary: 'Historial de inspecciones',
    description:
      'Encargado o administrador. Filtro opcional: `espacioId`. Más recientes primero; ' +
      'usa la paginación común.\n\nErrores: VALIDACION_FALLIDA (400), NO_AUTENTICADO (401), SIN_PERMISO (403).',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        datos: [],
        meta: { total: 0, pagina: 1, porPagina: 20 },
      },
    },
  })
  listar(
    @Query() filtros: FiltrosInspeccionesDto,
  ): Promise<RespuestaLista<Inspeccion>> {
    return this.servicio.listar(filtros);
  }
}
