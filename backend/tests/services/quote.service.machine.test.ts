import { describe, it, expect, vi } from 'vitest';
import { QuoteService } from '../../src/services/quote.service';
import type { CotizacionInput } from '../../src/services/quote.service';
import type { IPricesRepository } from '../../src/repositories/prices.repository';
import type { IGlobalParametersRepository, ParametrosGlobales } from '../../src/repositories/global-params.repository';
import type { IMachinesRepository, Maquina } from '../../src/repositories/machines.repository';
import type { IQuoteRepository } from '../../src/repositories/quote.repository';

const TEST_MACHINE: Maquina = {
  id: 'maq-001',
  nombre: 'Bambu A1 Mini',
  capacidadXmm: 180,
  capacidadYmm: 180,
  capacidadZmm: 180,
  costoUsd: 7000,
  mesesAmortizacion: 30,
  activa: true,
  creadaAt: '2026-01-01T00:00:00.000Z',
};

// Params con costos en cero para aislar costoAmortizacionUSD
const PARAMS_AISLADOS: ParametrosGlobales = {
  tasaEurUsd: 1.0,
  tasaArsUsd: 1500,
  tarifaManoObraUsdHora: 0,
  horasPorPieza: 0,
  desperdicioPct: 0,
  costosAdicionalesUsd: 0,
  coeficienteGanancia: 0,
  piezasPorDiaEstimadas: 20,
  actualizadaAt: '2026-06-13T00:00:00.000Z',
};

function makeRepos(params: ParametrosGlobales = PARAMS_AISLADOS, machine: Maquina | null = TEST_MACHINE) {
  const pricesRepo: IPricesRepository = {
    getMateriales: vi.fn(),
    getMaterialById: vi.fn().mockResolvedValue({ id: 'mat-001', nombre: 'PLA', precioGramo: 0, densidad: 1.24 }),
    getCostoInicio: vi.fn(),
  };
  const paramsRepo: IGlobalParametersRepository = {
    get: vi.fn().mockResolvedValue(params),
    update: vi.fn(),
  };
  const machinesRepo: IMachinesRepository = {
    getAll: vi.fn(),
    getById: vi.fn().mockResolvedValue(machine),
    getActivas: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const quoteRepo: IQuoteRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findByEmpleado: vi.fn(),
  };
  return { pricesRepo, paramsRepo, machinesRepo, quoteRepo };
}

const BASE_INPUT: CotizacionInput = {
  stlAnalysis: {
    uploadId: 'u',
    volumenCm3: 10,
    areaCm2: 60,
    boundingBox: { x: 10, y: 10, z: 10 },
    complejidad: 'simple',
    advertencias: [],
  },
  materialId: 'mat-001',
  maquinaId: 'maq-001',
  cantidad: 1,
  empleadoId: 'emp-001',
};

describe('QuoteService — lógica de máquina', () => {
  it('costoAmortizacionUSD sigue la fórmula del Excel (FR-005)', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const result = await service.calcularCotizacion(BASE_INPUT);
    // gramosTotal = (10*0.10*1.24 + 60*0.08*1.24) * 1 = 7.192  (desperdicioPct=0)
    // costoAmortizacion = (7000/30/30/20) * (7.192/10)
    const GRAMOS_TOTAL = 7.192;
    const expected = (7000 / 30 / 30 / 20) * (GRAMOS_TOTAL / 10);
    expect(result.costoAmortizacionUSD).toBeCloseTo(expected, 4);
  });

  it('EC-001/002: máquina no encontrada lanza error con el ID en el mensaje', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos(PARAMS_AISLADOS, null);
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    await expect(service.calcularCotizacion(BASE_INPUT))
      .rejects.toThrow("Máquina 'maq-001' no encontrada.");
  });

  it('EC-004: piezasPorDiaEstimadas = 0 lanza error (no Infinity silencioso)', async () => {
    const params = { ...PARAMS_AISLADOS, piezasPorDiaEstimadas: 0 };
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos(params);
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    await expect(service.calcularCotizacion(BASE_INPUT))
      .rejects.toThrow('piezasPorDiaEstimadas debe ser mayor que 0.');
  });

  it('NFR-004: machinesRepo.getById se llama exactamente 1 vez por cotización', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    await service.calcularCotizacion(BASE_INPUT);
    expect(machinesRepo.getById).toHaveBeenCalledTimes(1);
    expect(machinesRepo.getById).toHaveBeenCalledWith('maq-001');
  });

  it('costoAmortizacionUSD no escala con cantidad (es costo por pieza, no por lote)', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const r1 = await service.calcularCotizacion({ ...BASE_INPUT, cantidad: 1 });
    const r3 = await service.calcularCotizacion({ ...BASE_INPUT, cantidad: 3 });
    expect(r3.costoAmortizacionUSD).toBeCloseTo(r1.costoAmortizacionUSD, 6);
  });
});
