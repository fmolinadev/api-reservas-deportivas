import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EspacioEntidad } from '../venues/venue.entity.js';
import { UsuarioEntidad } from '../users/user.entity.js';
import { BloqueoEntidad } from './block.entity.js';
import { ReservaFijaEntidad } from './standing-booking.entity.js';
import { ReservaEntidad } from './reserva.entity.js';
import { TurnosControlador } from './slots.controller.js';
import { TurnosServicio } from './slots.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EspacioEntidad,
      UsuarioEntidad,
      ReservaEntidad,
      ReservaFijaEntidad,
      BloqueoEntidad,
    ]),
  ],
  controllers: [TurnosControlador],
  providers: [TurnosServicio],
  exports: [TurnosServicio],
})
export class TurnosModulo {}
