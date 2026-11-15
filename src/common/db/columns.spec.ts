import { getMetadataArgsStorage } from 'typeorm';
import { ColumnaInstante } from './columns.js';

describe('ColumnaInstante y el motor efectivo', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['supabase', '', 'timestamptz'],
    ['supabase', 'mysql', 'timestamptz'],
    ['neon', '', 'timestamptz'],
    ['aiven-postgres', '', 'timestamptz'],
    ['aiven-mysql', 'postgres', 'datetime'],
    ['', 'postgres', 'timestamptz'],
    ['', 'better-sqlite3', 'datetime'],
    ['', 'mariadb', 'datetime'],
  ])('proveedor %s y motor %s producen %s', (proveedor, motor, tipo) => {
    vi.stubEnv('DB_PROVEEDOR', proveedor);
    vi.stubEnv('DB_MOTOR', motor);
    class EntidadDePrueba {}
    ColumnaInstante()(EntidadDePrueba.prototype, 'instante');
    const columna = getMetadataArgsStorage().columns.find(
      (c) => c.target === EntidadDePrueba && c.propertyName === 'instante',
    );
    expect(columna?.options.type).toBe(tipo);
  });
});
