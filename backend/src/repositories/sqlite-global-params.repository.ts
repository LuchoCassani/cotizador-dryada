import Database from 'better-sqlite3';
import type { ParametrosGlobales, IGlobalParametersRepository } from './global-params.repository';

interface ParametrosRow {
  id: number;
  tasa_eur_usd: number;
  tasa_ars_usd: number;
  tarifa_mano_obra_usd_hora: number;
  horas_por_pieza: number;
  desperdicio_pct: number;
  costos_adicionales_usd: number;
  coeficiente_ganancia: number;
  piezas_por_dia_estimadas: number;
  actualizada_at: string;
}

function rowToParams(row: ParametrosRow): ParametrosGlobales {
  return {
    tasaEurUsd: row.tasa_eur_usd,
    tasaArsUsd: row.tasa_ars_usd,
    tarifaManoObraUsdHora: row.tarifa_mano_obra_usd_hora,
    horasPorPieza: row.horas_por_pieza,
    desperdicioPct: row.desperdicio_pct,
    costosAdicionalesUsd: row.costos_adicionales_usd,
    coeficienteGanancia: row.coeficiente_ganancia,
    piezasPorDiaEstimadas: row.piezas_por_dia_estimadas,
    actualizadaAt: row.actualizada_at,
  };
}

export class SqliteGlobalParamsRepository implements IGlobalParametersRepository {
  constructor(private readonly db: Database.Database) {}

  get(): Promise<ParametrosGlobales> {
    const row = this.db.prepare('SELECT * FROM parametros_globales WHERE id = 1').get() as ParametrosRow | undefined;
    if (!row) throw new Error('parametros_globales no inicializados. Ejecutar initDatabase primero.');
    return Promise.resolve(rowToParams(row));
  }

  update(data: Partial<Omit<ParametrosGlobales, 'actualizadaAt'>>): Promise<ParametrosGlobales> {
    const actualizadaAt = new Date().toISOString();
    const setClauses: string[] = ['actualizada_at = @actualizadaAt'];
    const params: Record<string, string | number> = { actualizadaAt };

    if (data.tasaEurUsd !== undefined) { setClauses.push('tasa_eur_usd = @tasaEurUsd'); params['tasaEurUsd'] = data.tasaEurUsd; }
    if (data.tasaArsUsd !== undefined) { setClauses.push('tasa_ars_usd = @tasaArsUsd'); params['tasaArsUsd'] = data.tasaArsUsd; }
    if (data.tarifaManoObraUsdHora !== undefined) { setClauses.push('tarifa_mano_obra_usd_hora = @tarifaManoObraUsdHora'); params['tarifaManoObraUsdHora'] = data.tarifaManoObraUsdHora; }
    if (data.horasPorPieza !== undefined) { setClauses.push('horas_por_pieza = @horasPorPieza'); params['horasPorPieza'] = data.horasPorPieza; }
    if (data.desperdicioPct !== undefined) { setClauses.push('desperdicio_pct = @desperdicioPct'); params['desperdicioPct'] = data.desperdicioPct; }
    if (data.costosAdicionalesUsd !== undefined) { setClauses.push('costos_adicionales_usd = @costosAdicionalesUsd'); params['costosAdicionalesUsd'] = data.costosAdicionalesUsd; }
    if (data.coeficienteGanancia !== undefined) { setClauses.push('coeficiente_ganancia = @coeficienteGanancia'); params['coeficienteGanancia'] = data.coeficienteGanancia; }
    if (data.piezasPorDiaEstimadas !== undefined) { setClauses.push('piezas_por_dia_estimadas = @piezasPorDiaEstimadas'); params['piezasPorDiaEstimadas'] = data.piezasPorDiaEstimadas; }

    this.db.prepare(`UPDATE parametros_globales SET ${setClauses.join(', ')} WHERE id = 1`).run(params);

    const updated = this.db.prepare('SELECT * FROM parametros_globales WHERE id = 1').get() as ParametrosRow;
    return Promise.resolve(rowToParams(updated));
  }
}
