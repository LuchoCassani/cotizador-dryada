export interface ParametrosGlobales {
  tasaEurUsd: number;
  tasaArsUsd: number;
  tarifaManoObraUsdHora: number;
  horasPorPieza: number;
  desperdicioPct: number;
  costosAdicionalesUsd: number;
  coeficienteGanancia: number;
  piezasPorDiaEstimadas: number;
  actualizadaAt: string;
}

export interface IGlobalParametersRepository {
  get(): Promise<ParametrosGlobales>;
  update(data: Partial<Omit<ParametrosGlobales, 'actualizadaAt'>>): Promise<ParametrosGlobales>;
}
