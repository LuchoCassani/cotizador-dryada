import { describe, it, expect, afterEach } from 'vitest';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { initDatabase } from '../../src/db/init';

const TMP_DB = '/tmp/test-cotizador.db';
const CORRUPT_DB = '/tmp/test-cotizador-corrupt.db';

afterEach(() => {
  for (const p of [TMP_DB, CORRUPT_DB]) {
    if (existsSync(p)) rmSync(p, { recursive: true });
  }
});

describe('initDatabase', () => {
  it('crea las 3 tablas en :memory:', () => {
    const db = initDatabase(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const nombres = tables.map((t) => t.name);
    expect(nombres).toContain('maquinas');
    expect(nombres).toContain('materiales');
    expect(nombres).toContain('parametros_globales');
  });

  it('maquinas tiene las columnas correctas', () => {
    const db = initDatabase(':memory:');
    const cols = db.prepare('PRAGMA table_info(maquinas)').all() as { name: string }[];
    const nombres = cols.map((c) => c.name);
    expect(nombres).toEqual(expect.arrayContaining([
      'id', 'nombre', 'capacidad_x_mm', 'capacidad_y_mm', 'capacidad_z_mm',
      'costo_usd', 'meses_amortizacion', 'activa', 'creada_at',
    ]));
  });

  it('seed inserta 4 máquinas', () => {
    const db = initDatabase(':memory:');
    const { n } = db.prepare('SELECT COUNT(*) as n FROM maquinas').get() as { n: number };
    expect(n).toBe(4);
  });

  it('seed inserta 33 materiales', () => {
    const db = initDatabase(':memory:');
    const { n } = db.prepare('SELECT COUNT(*) as n FROM materiales').get() as { n: number };
    expect(n).toBe(33);
  });

  it('seed inserta 1 fila en parametros_globales', () => {
    const db = initDatabase(':memory:');
    const { n } = db.prepare('SELECT COUNT(*) as n FROM parametros_globales').get() as { n: number };
    expect(n).toBe(1);
  });

  it('segunda llamada con el mismo path en disco no duplica filas (EC-006)', () => {
    initDatabase(TMP_DB).close();
    const db2 = initDatabase(TMP_DB);
    const { n } = db2.prepare('SELECT COUNT(*) as n FROM maquinas').get() as { n: number };
    expect(n).toBe(4);
  });

  it('path en directorio sin permisos lanza Error descriptivo (EC-005)', () => {
    expect(() => initDatabase('/root/no-access/cotizador.db')).toThrow(
      /Sin permisos de escritura/,
    );
  });

  it('path que no se puede abrir como DB lanza Error descriptivo (EC-001)', () => {
    // SQLite reinicializa archivos de texto plano; un directorio en el path sí fuerza el error
    mkdirSync(CORRUPT_DB);
    expect(() => initDatabase(CORRUPT_DB)).toThrow(/No se pudo abrir la base de datos/);
  });
});
