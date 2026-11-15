// Verificación M9: registro de dispositivos y avisos reales contra Expo falso.
import { type AppDePrueba, crearApp } from '../utilities/create-app.js';
import { esperarContrato, esperarError } from '../utilities/contract.js';
import { crearDeporte, crearEspacio } from '../utilities/venues.js';
import { crearReserva } from '../utilities/slots.js';
import {
  crearUsuario,
  registrarJugador,
  type UsuarioDePrueba,
} from '../utilities/users.js';
import { ServidorExpoFalso } from '../notifications/fake-expo-server.js';

const con = (u: UsuarioDePrueba) => ({ Authorization: `Bearer ${u.token}` });
const registrar = (a: AppDePrueba, u: UsuarioDePrueba, tokenExpo: string) =>
  a
    .http()
    .post('/dispositivos')
    .set(con(u))
    .send({ tokenExpo, plataforma: 'android' });

describe('M9 — Notificaciones push', () => {
  const expo = new ServidorExpoFalso();
  let a: AppDePrueba;

  beforeAll(async () => {
    await expo.iniciar();
    a = await crearApp({
      notificacionesReales: true,
      entorno: { NOTIFICACIONES: 'expo', EXPO_PUSH_URL: expo.url },
    });
  });
  afterAll(async () => {
    await a.cerrar();
    await expo.detener();
  });
  beforeEach(() => {
    expo.vaciar();
    expo.noRegistrados = new Set();
  });

  it.each([['jugador'], ['encargado'], ['administrador']] as const)(
    'el rol %s puede registrar su dispositivo y recibir la prueba',
    async (rol) => {
      const usuario =
        rol === 'jugador'
          ? await registrarJugador(a)
          : await crearUsuario(a, rol);
      const tokenExpo = `ExponentPushToken[${rol}]`;

      await registrar(a, usuario, tokenExpo).expect(201);
      const prueba = await a
        .http()
        .post('/dispositivos/prueba')
        .set(con(usuario))
        .expect(200);
      await a.avisos.esperarEnvios();

      expect(prueba.body.datos.dispositivos).toBe(1);
      expect(expo.mensajes.map((mensaje) => mensaje.to)).toEqual([tokenExpo]);
    },
  );

  it('mantiene la validación del token y del cuerpo', async () => {
    const usuario = await registrarJugador(a);
    esperarError(
      await registrar(a, usuario, 'token-invalido'),
      400,
      'VALIDACION_FALLIDA',
    );
    esperarError(
      await a.http().delete('/dispositivos/cualquier-cosa').set(con(usuario)),
      400,
      'VALIDACION_FALLIDA',
    );
  });

  it('los endpoints siguen requiriendo sesión y Swagger los publica', async () => {
    const usuario = await registrarJugador(a);
    esperarError(
      await a.http().post('/dispositivos/prueba'),
      401,
      'NO_AUTENTICADO',
    );
    esperarError(
      await a.http().delete('/dispositivos/ExponentPushToken%5Bfoo%5D'),
      401,
      'NO_AUTENTICADO',
    );
    await registrar(a, usuario, 'ExponentPushToken[swagger]').expect(201);

    const res = await a.http().get('/docs-json').expect(200);
    const rutas = res.body.paths as Record<string, Record<string, unknown>>;
    expect(rutas['/dispositivos']?.post).toBeDefined();
    expect(rutas['/dispositivos/prueba']?.post).toBeDefined();
    const borrar = Object.entries(rutas).find(([ruta]) =>
      ruta.startsWith('/dispositivos/{'),
    );
    expect(borrar?.[1].delete).toBeDefined();
  });

  describe('avisos disparados por acciones de negocio', () => {
    let deporteId: string;
    let espacioId: string;
    let encargado: UsuarioDePrueba;

    beforeAll(async () => {
      deporteId = (await crearDeporte(a)).id;
      encargado = await crearUsuario(a, 'encargado');
    });
    beforeEach(async () => {
      espacioId = (await crearEspacio(a, { deporteId })).id;
    });

    it('al bloquear un turno avisa al dueño con el motivo', async () => {
      const jugador = await registrarJugador(a);
      const tokenExpo = 'ExponentPushToken[bloqueo]';
      await registrar(a, jugador, tokenExpo).expect(201);
      const reserva = await crearReserva(a, {
        espacioId,
        usuarioId: jugador.usuario.id,
        fecha: '2026-09-20',
        inicio: '19:00',
      });

      const bloqueo = await a
        .http()
        .post('/bloqueos')
        .set(con(encargado))
        .send({
          espacioIds: [espacioId],
          fecha: '2026-09-20',
          motivo: 'Cancha anegada',
        });
      expect(bloqueo.status).toBe(201);
      esperarContrato(bloqueo.body, 'Bloqueo');
      await a.avisos.esperarEnvios();

      const consulta = await a
        .http()
        .get(`/reservas/${reserva.id}`)
        .set(con(jugador));
      expect(consulta.body.datos.estado).toBe('cancelada');
      expect(expo.mensajes).toEqual([
        expect.objectContaining({
          to: tokenExpo,
          title: 'Reserva cancelada',
          body: expect.stringContaining('Cancha anegada'),
          data: { reservaId: reserva.id },
        }),
      ]);
    });

    it('al cancelar avisa a favoritos, pero no a quien canceló', async () => {
      const dueno = await registrarJugador(a);
      const fan = await registrarJugador(a);
      const tokenDueno = 'ExponentPushToken[dueno]';
      const tokenFan = 'ExponentPushToken[fan]';
      await registrar(a, dueno, tokenDueno).expect(201);
      await registrar(a, fan, tokenFan).expect(201);
      await a
        .http()
        .put(`/yo/espacios-favoritos/${espacioId}`)
        .set(con(fan))
        .expect(200);
      const reserva = await crearReserva(a, {
        espacioId,
        usuarioId: dueno.usuario.id,
        fecha: '2026-09-21',
        inicio: '20:00',
      });

      const cancelacion = await a
        .http()
        .post(`/reservas/${reserva.id}/cancelacion`)
        .set(con(dueno))
        .send({});
      expect(cancelacion.status).toBe(200);
      esperarContrato(cancelacion.body, 'Reserva');
      await a.avisos.esperarEnvios();

      expect(expo.mensajes).toHaveLength(1);
      expect(expo.mensajes[0].to).toBe(tokenFan);
      expect(expo.mensajes[0].data).toEqual({
        espacioId,
        turnoId: reserva.turnoId,
      });
    });
  });
});
