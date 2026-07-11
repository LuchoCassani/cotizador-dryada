import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IPricesRepository } from '../repositories/prices.repository';
import { IGlobalParametersRepository } from '../repositories/global-params.repository';
import { IMachinesRepository } from '../repositories/machines.repository';
import { IQuoteRepository, QuoteRecord } from '../repositories/quote.repository';
import { IPrusaSlicerService, ProgressCallback, BuildVolume } from './prusa-slicer.service';
import { StlAnalysis } from './stl-processor';

const FILL_RATIO = 0.10;
const N_PERIMETROS = 2;
const ANCHO_LINEA_CM = 0.04;
const GRAMOS_REFERENCIA = 10;

// Cotizar no es validar si la pieza entra en la máquina elegida (esa decisión es de
// producción, y una pieza grande siempre se puede imprimir por partes) — el volumen
// de build se fija bien grande para que PrusaSlicer nunca lo use como motivo de
// rechazo al calcular el peso/precio. 1000mm funciona de forma confiable; valores
// mayores (probado con 1500) exceden el rango que acepta --max-print-height.
const COTIZACION_BUILD_VOLUME: BuildVolume = { xMm: 1000, yMm: 1000, zMm: 1000 };

export interface CotizacionInput {
  stlAnalysis: StlAnalysis;
  materialId: string;
  maquinaId: string;
  cantidad: number;
  empleadoId: string;
  observaciones?: string;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

export interface CotizacionResult {
  id: string;
  gramosInfill: number;
  gramosParedes: number;
  gramosTotal: number;
  costoMaterialUSD: number;
  costoManoObraUSD: number;
  costoAmortizacionUSD: number;
  costoInicioUSD: number;
  precioUnitarioUSD: number;
  precioFinalUSD: number;
  precioFinalARS: number;
  material: { id: string; nombre: string; precioGramo: number };
  maquina: { id: string; nombre: string };
  cantidad: number;
  volumenCm3: number;
  areaCm2: number;
  complejidad: string;
  advertencias: string[];
  weightSource: 'prusaslicer' | 'n1';
}

export class QuoteService {
  constructor(
    private readonly pricesRepo: IPricesRepository,
    private readonly paramsRepo: IGlobalParametersRepository,
    private readonly machinesRepo: IMachinesRepository,
    private readonly quoteRepo: IQuoteRepository,
    private readonly prusaSlicerService: IPrusaSlicerService,
  ) {}

  async calcularCotizacion(input: CotizacionInput): Promise<CotizacionResult> {
    const [material, params, machine] = await Promise.all([
      this.pricesRepo.getMaterialById(input.materialId),
      this.paramsRepo.get(),
      this.machinesRepo.getById(input.maquinaId),
    ]);

    if (!material) throw new Error(`Material '${input.materialId}' no encontrado.`);
    if (params.piezasPorDiaEstimadas <= 0) throw new Error('piezasPorDiaEstimadas debe ser mayor que 0.');
    if (machine === null) throw new Error(`Máquina '${input.maquinaId}' no encontrada.`);

    const { volumenCm3, areaCm2, complejidad, advertencias, uploadId } = input.stlAnalysis;

    const stlPath = path.join(process.env.UPLOADS_DIR ?? '/tmp/cotizador-uploads', `${uploadId}.stl`);
    let gramosInfill = 0;
    let gramosParedes = 0;
    let gramosTotal = 0;
    let weightSource: 'prusaslicer' | 'n1' = 'n1';

    let stlExists = false;
    try { await fs.access(stlPath); stlExists = true; } catch {}

    if (stlExists) {
      try {
        const sliced = await this.prusaSlicerService.slice(stlPath, material.densidad, COTIZACION_BUILD_VOLUME, input.signal, input.onProgress);
        gramosTotal = sliced.gramosTotal * (1 + params.desperdicioPct);
        weightSource = 'prusaslicer';
      } catch (err) {
        console.warn('[quote] PrusaSlicer falló, usando fallback N1:', err instanceof Error ? err.message : err);
      }
    } else {
      console.warn('[quote] STL no encontrado en disco, usando fallback N1. Path:', stlPath);
    }

    if (weightSource === 'n1') {
      gramosInfill  = volumenCm3 * FILL_RATIO * material.densidad;
      gramosParedes = areaCm2 * (N_PERIMETROS * ANCHO_LINEA_CM) * material.densidad;
      gramosTotal   = (gramosInfill + gramosParedes) * (1 + params.desperdicioPct);
    }

    const costoMaterialUSD     = gramosTotal * material.precioGramo;
    const costoManoObraUSD     = (params.tarifaManoObraUsdHora * params.horasPorPieza) / input.cantidad;
    const costoInicioUSD       = params.costosAdicionalesUsd / input.cantidad;
    const costoAmortizacionUSD = (machine.costoUsd / machine.mesesAmortizacion / 30 / params.piezasPorDiaEstimadas) * (gramosTotal / GRAMOS_REFERENCIA);
    const costoBase            = costoMaterialUSD + costoManoObraUSD + costoAmortizacionUSD + costoInicioUSD;
    const precioUnitarioUSD    = costoBase * (1 + params.coeficienteGanancia);
    const precioFinalUSD       = precioUnitarioUSD * input.cantidad;
    const precioFinalARS       = precioFinalUSD * params.tasaArsUsd;

    const id = randomUUID();

    const record: QuoteRecord = {
      id,
      empleadoId: input.empleadoId,
      fecha: new Date(),
      archivoStl: input.stlAnalysis.uploadId,
      materialId: input.materialId,
      maquinaId: input.maquinaId,
      cantidad: input.cantidad,
      volumenCm3,
      areaCm2,
      gramosTotal,
      precioFinalUSD,
      complejidad,
      observaciones: input.observaciones,
    };

    await this.quoteRepo.save(record);

    if (stlExists) fs.unlink(stlPath).catch(() => {});

    return {
      id,
      gramosInfill,
      gramosParedes,
      gramosTotal,
      costoMaterialUSD,
      costoManoObraUSD,
      costoAmortizacionUSD,
      costoInicioUSD,
      precioUnitarioUSD,
      precioFinalUSD,
      precioFinalARS,
      material: { id: material.id, nombre: material.nombre, precioGramo: material.precioGramo },
      maquina: { id: machine.id, nombre: machine.nombre },
      cantidad: input.cantidad,
      volumenCm3,
      areaCm2,
      complejidad,
      advertencias,
      weightSource,
    };
  }
}
