import { type AppDePrueba, crearApp } from '../utilities/create-app.js';
import { esperarError } from '../utilities/contract.js';
import { registrarJugador } from '../utilities/users.js';
import { ServidorExpoFalso } from '../notifications/fake-expo-server.js';

const TOKEN = 'ExponentPushToken[push-e2e]';

describe('Notificaciones push', () => {
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

  it('registra el dispositivo y envía la prueba por el puerto Expo', async () => {
    const jugador = await registrarJugador(a);
    const con = { Authorization: `Bearer ${jugador.token}` };

    await a
      .http()
      .post('/dispositivos')
      .set(con)
      .send({ tokenExpo: TOKEN, plataforma: 'android' })
      .expect(201);
    await a.http().post('/dispositivos/prueba').set(con).expect(200);
    await a.avisos.esperarEnvios();

    expect(expo.mensajes).toEqual([
      expect.objectContaining({
        to: TOKEN,
        title: 'Notificación de prueba',
      }),
    ]);
  });

  it('los endpoints siguen requiriendo sesión', async () => {
    esperarError(
      await a.http().post('/dispositivos/prueba'),
      401,
      'NO_AUTENTICADO',
    );
  });
});
