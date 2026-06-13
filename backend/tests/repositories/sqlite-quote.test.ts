import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase } from '../../src/db/init';
import { SqliteQuoteRepository } from '../../src/repositories/sqlite-quote.repository';
import type { QuoteRecord } from '../../src/repositories/quote.repository';

let db: Database.Database;
let repo: SqliteQuoteRepository;

function makeRecord(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'test-uuid-1234',
    empleadoId: 'emp-001',
    fecha: new Date('2026-06-13T10:00:00.000Z'),
    archivoStl: 'upload-abc123',
    materialId: 'mat-pla-blanco',
    maquinaId: 'maq-001',
    cantidad: 2,
    volumenCm3: 45.5,
    areaCm2: 120.3,
    gramosTotal: 52.8,
    precioFinalUSD: 18.50,
    complejidad: 'simple',
    ...overrides,
  };
}

beforeEach(() => {
  db = initDatabase(':memory:');
  // Insertar un material de prueba para satisfacer la FK informativa
  db.prepare(`
    INSERT INTO materiales (id, nombre, precio_cartucho_eur, densidad_g_cm3, activo, creada_at, actualizada_at)
    VALUES ('mat-pla-blanco', 'PLA Blanco', 25.00, 1.24, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run();
  repo = new SqliteQuoteRepository(db);
});

describe('SqliteQuoteRepository', () => {
  it('save() persiste y findById() recupera el mismo registro', async () => {
    const record = makeRecord();
    await repo.save(record);
    const found = await repo.findById(record.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(record.id);
    expect(found!.empleadoId).toBe(record.empleadoId);
    expect(found!.archivoStl).toBe(record.archivoStl);
    expect(found!.materialId).toBe(record.materialId);
    expect(found!.cantidad).toBe(record.cantidad);
    expect(found!.volumenCm3).toBe(record.volumenCm3);
    expect(found!.areaCm2).toBe(record.areaCm2);
    expect(found!.gramosTotal).toBe(record.gramosTotal);
    expect(found!.precioFinalUSD).toBe(record.precioFinalUSD);
    expect(found!.complejidad).toBe(record.complejidad);
  });

  it('findById() retorna null para un ID inexistente (EC-002)', async () => {
    const result = await repo.findById('no-existe');
    expect(result).toBeNull();
  });

  it('findByEmpleado() retorna array vacío si no hay registros (EC-003)', async () => {
    const results = await repo.findByEmpleado('emp-sin-cotizaciones');
    expect(results).toEqual([]);
  });

  it('findByEmpleado() retorna todas las cotizaciones del empleado ordenadas por fecha DESC', async () => {
    await repo.save(makeRecord({ id: 'id-1', fecha: new Date('2026-06-10T10:00:00.000Z') }));
    await repo.save(makeRecord({ id: 'id-2', fecha: new Date('2026-06-13T10:00:00.000Z') }));
    await repo.save(makeRecord({ id: 'id-3', fecha: new Date('2026-06-11T10:00:00.000Z'), empleadoId: 'emp-otro' }));

    const results = await repo.findByEmpleado('emp-001');
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('id-2');
    expect(results[1].id).toBe('id-1');
  });

  it('save() con observaciones undefined → findById retorna observaciones undefined (EC-004)', async () => {
    const record = makeRecord({ id: 'sin-obs' });
    delete record.observaciones;
    await repo.save(record);
    const found = await repo.findById('sin-obs');
    expect(found!.observaciones).toBeUndefined();
  });

  it('el campo fecha sobrevive el round-trip como Date (FR-005)', async () => {
    const record = makeRecord({ id: 'fecha-test' });
    await repo.save(record);
    const found = await repo.findById('fecha-test');
    expect(found!.fecha).toBeInstanceOf(Date);
    expect(found!.fecha.toISOString()).toBe('2026-06-13T10:00:00.000Z');
  });

  it('save() con observaciones presente → findById las retorna correctamente', async () => {
    const record = makeRecord({ id: 'con-obs', observaciones: 'Pieza con soporte adicional' });
    await repo.save(record);
    const found = await repo.findById('con-obs');
    expect(found!.observaciones).toBe('Pieza con soporte adicional');
  });

  it('save() con id duplicado lanza error (EC-001)', async () => {
    const record = makeRecord();
    await repo.save(record);
    await expect(repo.save(record)).rejects.toThrow();
  });
});
