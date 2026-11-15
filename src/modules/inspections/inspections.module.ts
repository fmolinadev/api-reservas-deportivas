import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EspacioEntidad } from '../venues/venue.entity.js';
import { InspeccionEntidad } from './inspection.entity.js';
import { InspeccionesControlador } from './inspections.controller.js';
import { InspeccionesServicio } from './inspections.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EspacioEntidad, InspeccionEntidad])],
  controllers: [InspeccionesControlador],
  providers: [InspeccionesServicio],
})
export class InspeccionesModulo {}
