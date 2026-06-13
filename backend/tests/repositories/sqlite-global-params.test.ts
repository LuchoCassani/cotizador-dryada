import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { initDatabase } from '../../src/db/init';
import { SqliteGlobalParamsRepository } from '../../src/repositories/sqlite-global-params.repository';
import { PARAMETROS_SEED } from '../../src/db/seed/parametros.seed';

let db: Database;
let repo: SqliteGlobalParamsRepository;

beforeEach(() => {
  db = initDatabase(':memory:');
  repo = new SqliteGlobalParamsRepository(db);
});

describe('SqliteGlobalParamsRepository', () => {
  it('get() retorna los valores exactos del seed', async () => {
    const params = await repo.get();
    expect(params.tasaEurUsd).toBe(PARAMETROS_SEED.tasaEurUsd);
    expect(params.tasaArsUsd).toBe(PARAMETROS_SEED.tasaArsUsd);
    expect(params.tarifaManoObraUsdHora).toBe(PARAMETROS_SEED.tarifaManoObraUsdHora);
    expect(params.horasPorPieza).toBe(PARAMETROS_SEED.horasPorPieza);
    expect(params.desperdicioPct).toBe(PARAMETROS_SEED.desperdicioPct);
    expect(params.costosAdicionalesUsd).toBe(PARAMETROS_SEED.costosAdicionalesUsd);
    expect(params.coeficienteGanancia).toBe(PARAMETROS_SEED.coeficienteGanancia);
    expect(params.actualizadaAt).toBeTruthy();
  });

  it('update() retorna el objeto actualizado con el nuevo valor y actualizadaAt renovado', async () => {
    db.prepare("UPDATE parametros_globales SET actualizada_at = '2020-01-01T00:00:00.000Z' WHERE id = 1").run();
    const updated = await repo.update({ tasaEurUsd: 1.10 });
    expect(updated.tasaEurUsd).toBe(1.10);
    expect(updated.actualizadaAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('update({ tasaArsUsd: 0 }) guarda 0 sin error (EC-004)', async () => {
    const updated = await repo.update({ tasaArsUsd: 0 });
    expect(updated.tasaArsUsd).toBe(0);
  });

  it('update() con campo parcial no sobreescribe campos no incluidos', async () => {
    await repo.update({ tasaEurUsd: 1.20 });
    const params = await repo.get();
    expect(params.coeficienteGanancia).toBe(PARAMETROS_SEED.coeficienteGanancia);
    expect(params.tarifaManoObraUsdHora).toBe(PARAMETROS_SEED.tarifaManoObraUsdHora);
  });

  it('get() después de update() refleja los cambios', async () => {
    await repo.update({ coeficienteGanancia: 3.5 });
    const params = await repo.get();
    expect(params.coeficienteGanancia).toBe(3.5);
  });
});
