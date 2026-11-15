import { Logger } from '@nestjs/common';
import { EnviadorPush, type MensajePush } from './ports.js';

const MENSAJES_POR_PEDIDO = 100;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

export class EnviadorExpo extends EnviadorPush {
  private readonly logger = new Logger('ExpoPush');

  constructor(readonly url: string) {
    super();
  }

  async enviar(
    mensajes: MensajePush[],
  ): Promise<{ tokensInvalidos: string[] }> {
    const destinos = mensajes.flatMap((mensaje) =>
      mensaje.tokens.map((to) => ({
        to,
        title: mensaje.titulo,
        body: mensaje.cuerpo,
        data: mensaje.datos,
        sound: 'default',
        channelId: 'reservas',
      })),
    );
    const tokensInvalidos = new Set<string>();

    for (let desde = 0; desde < destinos.length; desde += MENSAJES_POR_PEDIDO) {
      const tanda = destinos.slice(desde, desde + MENSAJES_POR_PEDIDO);
      const respuesta = await fetch(this.url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tanda),
      });

      if (!respuesta.ok)
        throw new Error(`Expo respondió con HTTP ${respuesta.status}.`);

      const cuerpo: unknown = await respuesta.json();
      if (
        !esObjeto(cuerpo) ||
        !Array.isArray(cuerpo.data) ||
        cuerpo.data.length !== tanda.length
      )
        throw new Error('Expo devolvió una respuesta de push inválida.');

      for (const [indice, ticket] of cuerpo.data.entries()) {
        if (!esObjeto(ticket))
          throw new Error(
            `Expo devolvió un ticket inválido en la posición ${indice}.`,
          );
        if (ticket.status === 'error') {
          const codigo =
            esObjeto(ticket.details) && typeof ticket.details.error === 'string'
              ? ticket.details.error
              : 'Error desconocido';
          if (codigo === 'DeviceNotRegistered') {
            tokensInvalidos.add(tanda[indice].to);
          } else {
            this.logger.error(`Expo rechazó una push: ${codigo}.`);
          }
        } else if (ticket.status !== 'ok') {
          throw new Error(
            `Expo devolvió un estado de ticket inválido en la posición ${indice}.`,
          );
        }
      }
    }

    return { tokensInvalidos: [...tokensInvalidos] };
  }
}
