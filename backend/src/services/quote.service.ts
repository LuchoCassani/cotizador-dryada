import { randomUUID } from 'crypto';
import { IPricesRepository } from '../repositories/prices.repository';
import { IGlobalParametersRepository } from '../repositories/global-params.repository';
import { IMachinesRepository } from '../repositories/machines.repository';
import { IQuoteRepository, QuoteRecord } from '../repositories/quote.repository';
import { StlAnalysis } from './stl-processor';

const FILL_RATIO = 0.10;
const N_PERIMETROS = 2;
const ANCHO_LINEA_CM = 0.04;
const GRAMOS_REFERENCIA = 10;

export interface CotizacionInput {
  stlAnalysis: StlAnalysis;
  materialId: string;
  maquinaId: string;
  cantidad: number;
  empleadoId: string;
  observaciones?: string;
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
}

export class QuoteService {
  constructor(
    private readonly pricesRepo: IPricesRepository,
    private readonly paramsRepo: IGlobalParametersRepository,
    private readonly machinesRepo: IMachinesRepository,
    private readonly quoteRepo: IQuoteRepository,
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

    const { volumenCm3, areaCm2, complejidad, advertencias } = input.stlAnalysis;

    const gramosInfill  = volumenCm3 * FILL_RATIO * material.densidad;
    const gramosParedes = areaCm2 * (N_PERIMETROS * ANCHO_LINEA_CM) * material.densidad;
    const gramosTotal   = (gramosInfill + gramosParedes) * (1 + params.desperdicioPct);

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
    };
  }
}
