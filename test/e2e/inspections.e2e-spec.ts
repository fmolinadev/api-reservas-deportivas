import type { ArchivoSubido, Inspeccion } from '../../contract/api.js';
import { type AppDePrueba, crearApp } from '../utilities/create-app.js';
import { esperarContrato, esperarError } from '../utilities/contract.js';
import { jpeg, m4a } from '../utilities/files.js';
import { crearDeporte, crearEspacio } from '../utilities/venues.js';
import {
  crearUsuario,
  registrarJugador,
  type UsuarioDePrueba,
} from '../utilities/users.js';

describe('Reportes de inspección', () => {
  let a: AppDePrueba;
  let espacioId: string;
  let encargado: UsuarioDePrueba;
  let admin: UsuarioDePrueba;
  let jugador: UsuarioDePrueba;

  beforeAll(async () => {
    a = await crearApp();
    const deporteId = (await crearDeporte(a)).id;
    espacioId = (await crearEspacio(a, { deporteId })).id;
    encargado = await crearUsuario(a, 'encargado');
    admin = await crearUsuario(a, 'administrador');
    jugador = await registrarJugador(a);
  });
  afterAll(() => a.cerrar());

  const cabecera = (usuario: UsuarioDePrueba) => ({
    Authorization: `Bearer ${usuario.token}`,
  });

  async function subirEvidencia(
    usuario: UsuarioDePrueba,
  ): Promise<ArchivoSubido> {
    const respuesta = await a
      .http()
      .post('/archivos')
      .set(cabecera(usuario))
      .set('Host', 'api.prueba:3000')
      .attach('archivo', jpeg(), 'inspeccion.jpg')
      .expect(201);
    return esperarContrato<ArchivoSubido>(respuesta.body, 'ArchivoSubido');
  }

  function crearReporte(usuario: UsuarioDePrueba | null, cuerpo: unknown) {
    const pedido = a.http().post('/inspecciones');
    pedido.set('Host', 'api.prueba:3000');
    return (usuario ? pedido.set(cabecera(usuario)) : pedido).send(
      cuerpo as object,
    );
  }

  it('el encargado crea un reporte y puede consultar su historial', async () => {
    const evidencia = await subirEvidencia(encargado);
    const res = await crearReporte(encargado, {
      espacioId,
      observacion: 'La red tiene un corte en el lateral.',
      evidencias: [evidencia.url],
    });
    expect(
      res.status,
      JSON.stringify({ body: res.body, url: evidencia.url }),
    ).toBe(201);
    const reporte = esperarContrato<Inspeccion>(res.body, 'Inspeccion');
    expect(reporte).toMatchObject({
      espacioId,
      usuarioId: encargado.usuario.id,
      observacion: 'La red tiene un corte en el lateral.',
      evidencias: [evidencia.url],
      creadaEn: '2026-09-19T10:00:00-03:00',
    });
    expect(reporte.id).toMatch(/^ins-[a-z0-9]{12}$/);

    const lista = await a
      .http()
      .get(`/inspecciones?espacioId=${espacioId}`)
      .set(cabecera(encargado))
      .set('Host', 'api.prueba:3000')
      .expect(200);
    expect(esperarContrato<Inspeccion[]>(lista.body, 'Inspeccion')).toEqual([
      reporte,
    ]);
  });

  it('el administrador también puede registrar reportes', async () => {
    const evidencia = await subirEvidencia(admin);
    await crearReporte(admin, {
      espacioId,
      observacion: 'Iluminación funcionando.',
      evidencias: [evidencia.url],
    }).expect(201);
  });

  it('GET devuelve una lista vacía con metadatos cuando no hay reportes', async () => {
    const lista = await a
      .http()
      .get('/inspecciones?espacioId=esp-vacio')
      .set(cabecera(encargado))
      .set('Host', 'api.prueba:3000')
      .expect(200);
    expect(lista.body).toMatchObject({
      datos: [],
      meta: { total: 0, pagina: 1, porPagina: 20 },
    });
  });

  it('exige sesión y rechaza el rol jugador', async () => {
    esperarError(await crearReporte(null, {}), 401, 'NO_AUTENTICADO');
    esperarError(await crearReporte(jugador, {}), 403, 'SIN_PERMISO');
    esperarError(await a.http().get('/inspecciones'), 401, 'NO_AUTENTICADO');
    esperarError(
      await a.http().get('/inspecciones').set(cabecera(jugador)),
      403,
      'SIN_PERMISO',
    );
  });

  it.each([
    [
      'falta el espacio',
      () => ({ observacion: 'Revisión', evidencias: ['url'] }),
    ],
    [
      'observación vacía',
      () => ({ espacioId, observacion: ' ', evidencias: ['url'] }),
    ],
    [
      'falta evidencia',
      () => ({ espacioId, observacion: 'Revisión', evidencias: [] }),
    ],
    [
      'campo adicional',
      () => ({
        espacioId,
        observacion: 'Revisión',
        evidencias: ['url'],
        usuarioId: 'usr-falso',
      }),
    ],
  ])('VALIDACION_FALLIDA (400): %s', async (_caso, cuerpo) => {
    esperarError(
      await crearReporte(encargado, cuerpo()),
      400,
      'VALIDACION_FALLIDA',
    );
  });

  it('404 ESPACIO_NO_ENCONTRADO para un espacio inexistente', async () => {
    const evidencia = await subirEvidencia(encargado);
    esperarError(
      await crearReporte(encargado, {
        espacioId: 'esp-inexistente',
        observacion: 'Revisión',
        evidencias: [evidencia.url],
      }),
      404,
      'ESPACIO_NO_ENCONTRADO',
    );
  });

  it('ARCHIVO_NO_SUBIDO (422) para URLs externas o archivos que no existen', async () => {
    esperarError(
      await crearReporte(encargado, {
        espacioId,
        observacion: 'Revisión',
        evidencias: ['https://ejemplo.invalid/imagen.jpg'],
      }),
      422,
      'ARCHIVO_NO_SUBIDO',
    );
    esperarError(
      await crearReporte(encargado, {
        espacioId,
        observacion: 'Revisión',
        evidencias: [
          'http://127.0.0.1:3000/archivos/imagenes/2026/09/noexistearchivo.jpg',
        ],
      }),
      422,
      'ARCHIVO_NO_SUBIDO',
    );
  });

  it('no permite adjuntar audio como evidencia de una inspección', async () => {
    const subida = await a
      .http()
      .post('/archivos')
      .set(cabecera(encargado))
      .set('Host', 'api.prueba:3000')
      .attach('archivo', m4a(), 'audio.m4a')
      .expect(201);
    const audio = esperarContrato<ArchivoSubido>(subida.body, 'ArchivoSubido');
    esperarError(
      await crearReporte(encargado, {
        espacioId,
        observacion: 'Revisión',
        evidencias: [audio.url],
      }),
      422,
      'ARCHIVO_NO_SUBIDO',
    );
  });
});
