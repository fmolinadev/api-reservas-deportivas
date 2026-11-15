import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { DispositivoEntidad } from './device.entity.js';
import { AlmacenTokensPush, type Plataforma } from './ports.js';

@Injectable()
export class AlmacenTokensExpo extends AlmacenTokensPush {
  constructor(
    @InjectRepository(DispositivoEntidad)
    private readonly dispositivos: Repository<DispositivoEntidad>,
  ) {
    super();
  }

  guardar(
    usuarioId: string,
    tokenExpo: string,
    plataforma: Plataforma,
  ): Promise<void> {
    return this.dispositivos
      .upsert({ tokenExpo, usuarioId, plataforma }, ['tokenExpo'])
      .then(() => undefined);
  }

  async borrar(tokenExpo: string): Promise<void> {
    await this.dispositivos.delete({ tokenExpo });
  }

  async tokensDe(usuarioIds: string[]): Promise<string[]> {
    if (usuarioIds.length === 0) return [];
    const dispositivos = await this.dispositivos.findBy({
      usuarioId: In(usuarioIds),
    });
    return dispositivos.map((dispositivo) => dispositivo.tokenExpo);
  }

  async descartar(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.dispositivos.delete({ tokenExpo: In(tokens) });
  }
}
