import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Configuracion } from '../../config/environment.js';
import { DispositivoEntidad } from './device.entity.js';
import { EnviadorExpo } from './expo-sender.js';
import { AlmacenTokensExpo } from './expo-token-store.js';
import { Avisos } from './notices.service.js';
import { DispositivosControlador } from './devices.controller.js';
import { EnviadorRegistro } from './registry-sender.js';
import { AlmacenTokensPush, EnviadorPush } from './ports.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DispositivoEntidad])],
  controllers: [DispositivosControlador],
  providers: [
    { provide: AlmacenTokensPush, useClass: AlmacenTokensExpo },
    {
      provide: EnviadorPush,
      inject: [Configuracion],
      useFactory: (config: Configuracion): EnviadorPush =>
        config.notificaciones === 'expo'
          ? new EnviadorExpo(config.expoPushUrl)
          : new EnviadorRegistro(),
    },
    Avisos,
  ],
  exports: [Avisos],
})
export class NotificacionesModulo {}
