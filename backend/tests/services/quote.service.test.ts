import { describe, it, expect, vi } from 'vitest';
import { QuoteService } from '../../src/services/quote.service';
import type { IPricesRepository } from '../../src/repositories/prices.repository';
import type { IGlobalParametersRepository, ParametrosGlobales } from '../../src/repositories/global-params.repository';
import type { IMachinesRepository } from '../../src/repositories/machines.repository';
import type { IQuoteRepository } from '../../src/repositories/quote.repository';
import type { StlAnalysis } from '../../src/services/stl-processor';

function makeParams(overrides: Partial<ParametrosGlobales> = {}): ParametrosGlobales {
  return {
    tasaEurUsd: 1.0549,
    tasaArsUsd: 0,
    tarifaManoObraUsdHora: 6.82,
    horasPorPieza: 0.20,
    desperdicioPct: 0.10,
    costosAdicionalesUsd: 0.50,
    coeficienteGanancia: 2.0,
    piezasPorDiaEstimadas: 20,
    actualizadaAt: '2026-06-13T00:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<StlAnalysis> = {}) {
  const stlAnalysis: StlAnalysis = {
    uploadId: 'upload-test',
    volumenCm3: 10,
    areaCm2: 60,
    boundingBox: { x: 10, y: 10, z: 10 },
    complejidad: 'simple',
    advertencias: [],
    ...overrides,
  };
  return {
    stlAnalysis,
    materialId: 'mat-001',
    maquinaId: 'maq-001',
    cantidad: 1,
    empleadoId: 'emp-001',
  };
}

function makeRepos(params: ParametrosGlobales = makeParams()) {
  const pricesRepo: IPricesRepository = {
    getMateriales: vi.fn(),
    getMaterialById: vi.fn().mockResolvedValue({
      id: 'mat-001',
      nombre: 'PLA Test',
      precioGramo: 0.05,
      densidad: 1.24,
    }),
    getCostoInicio: vi.fn().mockResolvedValue(params.costosAdicionalesUsd),
  };

  const paramsRepo: IGlobalParametersRepository = {
    get: vi.fn().mockResolvedValue(params),
    update: vi.fn(),
  };

  const machinesRepo: IMachinesRepository = {
    getAll: vi.fn(),
    getById: vi.fn().mockResolvedValue({
      id: 'maq-001',
      nombre: 'Bambu A1 Mini',
      capacidadXmm: 180,
      capacidadYmm: 180,
      capacidadZmm: 180,
      costoUsd: 7000,
      mesesAmortizacion: 30,
      activa: true,
      creadaAt: '2026-01-01T00:00:00.000Z',
    }),
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

describe('QuoteService.calcularCotizacion', () => {
  it('gramosTotal incluye desperdicioPct del 10%', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const result = await service.calcularCotizacion(makeInput());
    const gramosRaw = result.gramosInfill + result.gramosParedes;
    expect(result.gramosTotal).toBeCloseTo(gramosRaw * 1.10, 5);
  });

  it('costoManoObraUSD = tarifaManoObraUsdHora * horasPorPieza', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const result = await service.calcularCotizacion(makeInput());
    expect(result.costoManoObraUSD).toBeCloseTo(6.82 * 0.20, 5);
  });

  it('precioUnitarioUSD = costoBase * (1 + coeficiente)', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const result = await service.calcularCotizacion(makeInput());
    const costoBase = result.costoMaterialUSD + result.costoManoObraUSD + result.costoAmortizacionUSD + result.costoInicioUSD;
    expect(result.precioUnitarioUSD).toBeCloseTo(costoBase * (1 + 2.0), 5);
  });

  it('precioFinalUSD = precioUnitarioUSD * cantidad', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const result = await service.calcularCotizacion({ ...makeInput(), cantidad: 3 });
    expect(result.precioFinalUSD).toBeCloseTo(result.precioUnitarioUSD * 3, 5);
  });

  it('mano de obra y costos adicionales se reparten entre unidades (modelo lote)', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const r1 = await service.calcularCotizacion(makeInput());
    const r3 = await service.calcularCotizacion({ ...makeInput(), cantidad: 3 });
    // costoManoObraUSD per unit debe ser 1/3 cuando cantidad=3
    expect(r3.costoManoObraUSD).toBeCloseTo(r1.costoManoObraUSD / 3, 5);
    // costoInicioUSD per unit debe ser 1/3 cuando cantidad=3
    expect(r3.costoInicioUSD).toBeCloseTo(r1.costoInicioUSD / 3, 5);
    // costoMaterialUSD per unit no cambia con la cantidad
    expect(r3.costoMaterialUSD).toBeCloseTo(r1.costoMaterialUSD, 5);
  });

  it('precioFinalARS = precioFinalUSD * tasaArsUsd', async () => {
    const params = makeParams({ tasaArsUsd: 1500 });
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos(params);
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const result = await service.calcularCotizacion(makeInput());
    expect(result.precioFinalARS).toBeCloseTo(result.precioFinalUSD * 1500, 3);
  });

  it('desperdicioPct = 0 → gramosTotal = gramosRaw (EC-004)', async () => {
    const params = makeParams({ desperdicioPct: 0 });
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos(params);
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const result = await service.calcularCotizacion(makeInput());
    const gramosRaw = result.gramosInfill + result.gramosParedes;
    expect(result.gramosTotal).toBeCloseTo(gramosRaw, 5);
  });

  it('horasPorPieza = 0 → costoManoObraUSD = 0 (EC-005)', async () => {
    const params = makeParams({ horasPorPieza: 0 });
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos(params);
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    const result = await service.calcularCotizacion(makeInput());
    expect(result.costoManoObraUSD).toBe(0);
  });

  it('material no encontrado lanza error', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    (pricesRepo.getMaterialById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    await expect(service.calcularCotizacion(makeInput())).rejects.toThrow("Material 'mat-001' no encontrado.");
  });

  it('paramsRepo.get() se llama exactamente una vez por cotización (NFR-004)', async () => {
    const { pricesRepo, paramsRepo, machinesRepo, quoteRepo } = makeRepos();
    const service = new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo);
    await service.calcularCotizacion(makeInput());
    expect(paramsRepo.get).toHaveBeenCalledTimes(1);
  });
});
