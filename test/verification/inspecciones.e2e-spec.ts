import type { ArchivoSubido, Inspeccion } from '../../contract/api.js';
import { type AppDePrueba, crearApp } from '../utilities/create-app.js';
import { esperarContrato, esperarError } from '../utilities/contract.js';
import { jpeg, mp4 } from '../utilities/files.js';
import { crearDeporte, crearEspacio } from '../utilities/venues.js';
import { crearUsuario, type UsuarioDePrueba } from '../utilities/users.js';

describe('M10 — Inspecciones (SPECIFICATION §4, DECISIONS I1)', () => {
  let a: AppDePrueba;
  let espacioId: string;
  let otroEspacioId: string;
  let deporteId: string;
  let encargado: UsuarioDePrueba;
  let admin: UsuarioDePrueba;

  beforeAll(async () => {
    a = await crearApp();
    deporteId = (await crearDeporte(a)).id;
    espacioId = (await crearEspacio(a, { deporteId })).id;
    otroEspacioId = (await crearEspacio(a, { deporteId })).id;
    encargado = await crearUsuario(a, 'encargado');
    admin = await crearUsuario(a, 'administrador');
  });

  afterAll(() => a.cerrar());
  afterEach(() => a.reloj.fijar('2026-09-19T10:00:00-03:00'));

  const cabecera = (usuario: UsuarioDePrueba) => ({
    Authorization: `Bearer ${usuario.token}`,
  });

  async function subir(
    usuario: UsuarioDePrueba,
    tipo: 'imagen' | 'video' = 'imagen',
  ): Promise<ArchivoSubido> {
    const pedido = a
      .http()
      .post('/archivos')
      .set(cabecera(usuario))
      .set('Host', 'api.prueba:3000');
    const res =
      tipo === 'imagen'
        ? await pedido.attach('archivo', jpeg(), 'evidencia.jpg').expect(201)
        : await pedido.attach('archivo', mp4(), 'evidencia.mp4').expect(201);
    return esperarContrato<ArchivoSubido>(res.body, 'ArchivoSubido');
  }

  function crearReporte(
    usuario: UsuarioDePrueba,
    cuerpo: Record<string, unknown>,
  ) {
    return a
      .http()
      .post('/inspecciones')
      .set(cabecera(usuario))
      .set('Host', 'api.prueba:3000')
      .send(cuerpo);
  }

  async function registrar(
    usuario: UsuarioDePrueba,
    espacio: string,
    observacion: string,
    evidencias: string[],
  ): Promise<Inspeccion> {
    const res = await crearReporte(usuario, {
      espacioId: espacio,
      observacion,
      evidencias,
    }).expect(201);
    return esperarContrato<Inspeccion>(res.body, 'Inspeccion');
  }

  describe('SPECIFICATION §4 — reportes con entre una y cinco fotos o videos subidos', () => {
    it('acepta los límites 1 y 5, guarda videos y devuelve sólo los campos del contrato', async () => {
      const imagen = await subir(encargado);
      const una = await crearReporte(encargado, {
        espacioId,
        observacion: 'Una evidencia válida.',
        evidencias: [imagen.url],
      }).expect(201);
      const reporteUna = esperarContrato<Inspeccion>(
        una.body,
        'Inspeccion',
      );
      expect(reporteUna.evidencias).toEqual([imagen.url]);
      expect(reporteUna).toMatchObject({
        espacioId,
        usuarioId: encargado.usuario.id,
        observacion: 'Una evidencia válida.',
      });

      const archivos = await Promise.all([
        subir(encargado, 'imagen'),
        subir(encargado, 'video'),
        subir(encargado, 'imagen'),
        subir(encargado, 'video'),
        subir(encargado, 'imagen'),
      ]);
      const cinco = await crearReporte(admin, {
        espacioId,
        observacion: 'Cinco evidencias válidas.',
        evidencias: archivos.map((archivo) => archivo.url),
      }).expect(201);
      const reporteCinco = esperarContrato<Inspeccion>(
        cinco.body,
        'Inspeccion',
      );
      expect(reporteCinco.evidencias).toEqual(
        archivos.map((archivo) => archivo.url),
      );
      expect(reporteCinco.usuarioId).toBe(admin.usuario.id);
    });

    it('rechaza cero o seis evidencias y no acepta campos o tipos ajenos al contrato', async () => {
      const archivo = await subir(encargado);
      const base = {
        espacioId,
        observacion: 'Observación válida.',
      };
      const casos: Array<[string, Record<string, unknown>]> = [
        ['cero evidencias', { ...base, evidencias: [] }],
        [
          'seis evidencias',
          { ...base, evidencias: Array.from({ length: 6 }, () => archivo.url) },
        ],
        [
          'observación vacía',
          { ...base, observacion: '', evidencias: [archivo.url] },
        ],
        [
          'observación de tipo incorrecto',
          { ...base, observacion: 12, evidencias: [archivo.url] },
        ],
        ['evidencias de tipo incorrecto', { ...base, evidencias: archivo.url }],
        [
          'propiedad no contratada',
          {
            ...base,
            evidencias: [archivo.url],
            creadaEn: '2026-09-19T10:00:00-03:00',
          },
        ],
        [
          'id de espacio con prefijo incorrecto',
          { ...base, espacioId: 'usr-no-es-espacio', evidencias: [archivo.url] },
        ],
      ];

      for (const [caso, cuerpo] of casos) {
        const res = await crearReporte(encargado, cuerpo);
        expect(res.status, caso).toBe(400);
        esperarError(res, 400, 'VALIDACION_FALLIDA');
      }
    });

    it('ARCHIVO_NO_SUBIDO (422) conserva exactamente el sobre y el mensaje del catálogo', async () => {
      const res = await crearReporte(encargado, {
        espacioId,
        observacion: 'URL que no corresponde a un archivo subido.',
        evidencias: ['https://ejemplo.invalid/evidencia.jpg'],
      });
      esperarError(res, 422, 'ARCHIVO_NO_SUBIDO');
      expect(res.body).toEqual({
        error: {
          codigo: 'ARCHIVO_NO_SUBIDO',
          mensaje: 'Subí las fotos o el video desde la aplicación.',
        },
      });
    });
  });

  describe('SPECIFICATION §4 — historial más reciente primero, filtro por espacio y paginación común', () => {
    it('filtra antes de paginar, ordena por fecha descendente y reporta total filtrado', async () => {
      const archivo = await subir(encargado);
      const espacioHistorialId = (await crearEspacio(a, { deporteId })).id;
      const primer = await registrar(
        encargado,
        espacioHistorialId,
        'Primero.',
        [archivo.url],
      );
      a.reloj.fijar('2026-09-19T10:01:00-03:00');
      await registrar(encargado, otroEspacioId, 'Segundo.', [archivo.url]);
      a.reloj.fijar('2026-09-19T10:02:00-03:00');
      const tercero = await registrar(
        encargado,
        espacioHistorialId,
        'Tercero.',
        [archivo.url],
      );
      a.reloj.fijar('2026-09-19T10:03:00-03:00');
      const cuarto = await registrar(
        encargado,
        espacioHistorialId,
        'Cuarto.',
        [archivo.url],
      );

      const paginaUno = await a
        .http()
        .get(`/inspecciones?espacioId=${espacioHistorialId}&porPagina=2`)
        .set(cabecera(encargado))
        .expect(200);
      const datosUno = esperarContrato<Inspeccion[]>(
        paginaUno.body,
        'Inspeccion',
      );
      expect(paginaUno.body.meta).toEqual({
        total: 3,
        pagina: 1,
        porPagina: 2,
      });
      expect(datosUno.map((reporte) => reporte.id)).toEqual([
        cuarto.id,
        tercero.id,
      ]);

      const paginaDos = await a
        .http()
        .get(`/inspecciones?espacioId=${espacioHistorialId}&porPagina=2&pagina=2`)
        .set(cabecera(encargado))
        .expect(200);
      expect(
        esperarContrato<Inspeccion[]>(paginaDos.body, 'Inspeccion').map(
          (reporte) => reporte.id,
        ),
      ).toEqual([primer.id]);
      expect(paginaDos.body.meta).toEqual({
        total: 3,
        pagina: 2,
        porPagina: 2,
      });

      const filtrada = await a
        .http()
        .get(`/inspecciones?espacioId=${espacioHistorialId}&porPagina=1`)
        .set(cabecera(encargado))
        .expect(200);
      expect(
        esperarContrato<Inspeccion[]>(filtrada.body, 'Inspeccion').map(
          (reporte) => reporte.id,
        ),
      ).toEqual([cuarto.id]);
      expect(filtrada.body.meta).toEqual({
        total: 3,
        pagina: 1,
        porPagina: 1,
      });

      const fueraDeRango = await a
        .http()
        .get(`/inspecciones?espacioId=${espacioHistorialId}&pagina=9`)
        .set(cabecera(encargado))
        .expect(200);
      expect(
        esperarContrato<Inspeccion[]>(fueraDeRango.body, 'Inspeccion'),
      ).toEqual([]);
      expect(fueraDeRango.body.meta).toEqual({
        total: 3,
        pagina: 9,
        porPagina: 20,
      });
    });
  });

  describe('AGENTS §6 — creadaEn usa el reloj y el formato horario del contrato', () => {
    it('preserva el instante alrededor de medianoche, el fin de año y el inicio de año', async () => {
      a.reloj.fijar('2026-12-31T23:59:00-03:00');
      const encargadoFinDeAnio = await crearUsuario(a, 'encargado');
      const archivo = await subir(encargadoFinDeAnio);
      const finDeAnio = await registrar(
        encargadoFinDeAnio,
        espacioId,
        'Último minuto del año.',
        [archivo.url],
      );
      expect(finDeAnio.creadaEn).toBe('2026-12-31T23:59:00-03:00');

      a.reloj.fijar('2027-01-01T00:00:00-03:00');
      const inicioDeAnio = await registrar(
        encargadoFinDeAnio,
        espacioId,
        'Primer minuto del año.',
        [archivo.url],
      );
      expect(inicioDeAnio.creadaEn).toBe('2027-01-01T00:00:00-03:00');
    });
  });
});
