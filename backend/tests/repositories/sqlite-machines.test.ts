import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { initDatabase } from '../../src/db/init';
import { SqliteMachinesRepository } from '../../src/repositories/sqlite-machines.repository';
import { MAQUINAS_SEED } from '../../src/db/seed/maquinas.seed';

let db: Database;
let repo: SqliteMachinesRepository;

beforeEach(() => {
  db = initDatabase(':memory:');
  repo = new SqliteMachinesRepository(db);
});

describe('SqliteMachinesRepository', () => {
  it('getAll() retorna las 4 máquinas del seed', async () => {
    const result = await repo.getAll();
    expect(result).toHaveLength(4);
  });

  it('getAll() incluye máquinas con activa = false (EC-003)', async () => {
    db.prepare("UPDATE maquinas SET activa = 0 WHERE id = ?").run(MAQUINAS_SEED[0].id);
    const result = await repo.getAll();
    expect(result).toHaveLength(4);
    const inactiva = result.find((m) => m.id === MAQUINAS_SEED[0].id);
    expect(inactiva?.activa).toBe(false);
  });

  it('getById() retorna la máquina por id', async () => {
    const maquina = await repo.getById(MAQUINAS_SEED[0].id);
    expect(maquina).not.toBeNull();
    expect(maquina?.nombre).toBe('Máquina 1');
    expect(maquina?.activa).toBe(true);
  });

  it('getById() retorna null para id inexistente (EC-002)', async () => {
    const result = await repo.getById('no-existe');
    expect(result).toBeNull();
  });

  it('create() inserta y retorna con id asignado', async () => {
    const nueva = await repo.create({
      nombre: 'Máquina X',
      capacidadXmm: 200, capacidadYmm: 200, capacidadZmm: 200,
      costoUsd: 5000, mesesAmortizacion: 24, activa: true,
    });
    expect(nueva.id).toBeTruthy();
    expect(nueva.nombre).toBe('Máquina X');
    const fromDb = await repo.getById(nueva.id);
    expect(fromDb?.nombre).toBe('Máquina X');
  });

  it('update() actualiza solo el campo indicado', async () => {
    const id = MAQUINAS_SEED[0].id;
    const updated = await repo.update(id, { activa: false });
    expect(updated?.activa).toBe(false);
    expect(updated?.nombre).toBe('Máquina 1');
  });

  it('update() retorna null para id inexistente', async () => {
    const result = await repo.update('no-existe', { activa: false });
    expect(result).toBeNull();
  });

  it('delete() elimina la fila y getById retorna null', async () => {
    const id = MAQUINAS_SEED[0].id;
    await repo.delete(id);
    const result = await repo.getById(id);
    expect(result).toBeNull();
  });
});
