import { Entity, Index } from 'typeorm';
import type { Plataforma } from './ports.js';
import { ColumnaEnum, ColumnaRef, ColumnaTexto } from '../db/columns.js';

@Entity('dispositivos')
@Index('IDX_dispositivos_usuarioId', ['usuarioId'])
export class DispositivoEntidad {
  @ColumnaTexto(220, { primary: true })
  tokenExpo: string;

  @ColumnaRef()
  usuarioId: string;

  @ColumnaEnum()
  plataforma: Plataforma;
}
