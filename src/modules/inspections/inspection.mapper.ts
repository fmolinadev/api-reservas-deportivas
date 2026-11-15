import type { Inspeccion } from '../../../contract/api.js';
import { aIsoConZona } from '../../common/dates/dates.js';
import { urlDeArchivo } from '../../common/files/keys.js';
import type { InspeccionEntidad } from './inspection.entity.js';

export function aContrato(inspeccion: InspeccionEntidad): Inspeccion {
  return {
    id: inspeccion.id,
    espacioId: inspeccion.espacioId,
    usuarioId: inspeccion.usuarioId,
    observacion: inspeccion.observacion,
    evidencias: inspeccion.evidencias.map(urlDeArchivo),
    creadaEn: aIsoConZona(inspeccion.creadaEn),
  };
}
