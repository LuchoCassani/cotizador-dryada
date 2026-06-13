import type { ParametrosGlobales } from '../../repositories/global-params.repository';

export const PARAMETROS_SEED: Omit<ParametrosGlobales, 'actualizadaAt'> = {
  tasaEurUsd: 1.0549,
  tasaArsUsd: 1500,
  tarifaManoObraUsdHora: 6.82,
  horasPorPieza: 0.20,
  desperdicioPct: 0.10,
  costosAdicionalesUsd: 0.50,
  coeficienteGanancia: 2.0,
  piezasPorDiaEstimadas: 20,
};
