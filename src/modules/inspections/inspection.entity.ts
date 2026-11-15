import { Entity } from 'typeorm';
import {
  ColumnaId,
  ColumnaInstante,
  ColumnaJson,
  ColumnaRef,
  ColumnaTextoLargo,
} from '../../common/db/columns.js';

@Entity('inspecciones')
export class InspeccionEntidad {
  @ColumnaId()
  id: string;

  @ColumnaRef()
  espacioId: string;

  @ColumnaRef()
  usuarioId: string;

  @ColumnaTextoLargo()
  observacion: string;

  @ColumnaJson()
  evidencias: string[];

  @ColumnaInstante()
  creadaEn: Date;
}
