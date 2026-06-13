import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { initDatabase } from '../../src/db/init';
import { SqliteMaterialsRepository } from '../../src/repositories/sqlite-materials.repository';
import { MATERIALES_SEED } from '../../src/db/seed/materiales.seed';

let db: Database;
let repo: SqliteMaterialsRepository;

beforeEach(() => {
  db = initDatabase(':memory:');
  repo = new SqliteMaterialsRepository(db);
});

describe('SqliteMaterialsRepository', () => {
  it('getAll() retorna los 33 materiales del seed', async () => {
    const result = await repo.getAll();
    expect(result).toHaveLength(33);
  });

  it('primer material tiene precioPorCartucho750gEUR > 0 y densidadGCm3 > 0', async () => {
    const result = await repo.getAll();
    expect(result[0].precioPorCartucho750gEUR).toBeGreaterThan(0);
    expect(result[0].densidadGCm3).toBeGreaterThan(0);
  });

  it('getById() retorna material con todos los campos incluyendo actualizadaAt', async () => {
    const id = MATERIALES_SEED[0].id;
    const mat = await repo.getById(id);
    expect(mat).not.toBeNull();
    expect(mat?.actualizadaAt).toBeTruthy();
    expect(mat?.creadaAt).toBeTruthy();
    expect(mat?.nombre).toBe(MATERIALES_SEED[0].nombre);
  });

  it('getById() retorna null para id inexistente (EC-002)', async () => {
    const result = await repo.getById('no-existe');
    expect(result).toBeNull();
  });

  it('create() retorna con creadaAt y actualizadaAt poblados', async () => {
    const nuevo = await repo.create({
      nombre: 'PLA Test', precioPorCartucho750gEUR: 15.00, densidadGCm3: 1.24, activo: true,
    });
    expect(nuevo.creadaAt).toBeTruthy();
    expect(nuevo.actualizadaAt).toBeTruthy();
    expect(nuevo.id).toBeTruthy();
  });

  it('update() con activo: false no modifica creadaAt', async () => {
    const id = MATERIALES_SEED[0].id;
    const original = await repo.getById(id);
    const updated = await repo.update(id, { activo: false });
    expect(updated?.activo).toBe(false);
    expect(updated?.creadaAt).toBe(original?.creadaAt);
  });

  it('update() con nuevo precio actualiza actualizadaAt', async () => {
    const id = MATERIALES_SEED[0].id;
    const original = await repo.getById(id);
    const updated = await repo.update(id, { precioPorCartucho750gEUR: 99.99 });
    expect(updated?.precioPorCartucho750gEUR).toBe(99.99);
    expect(updated?.actualizadaAt).not.toBe(original?.actualizadaAt);
  });

  it('delete() elimina la fila', async () => {
    const id = MATERIALES_SEED[0].id;
    await repo.delete(id);
    const result = await repo.getById(id);
    expect(result).toBeNull();
  });
});
