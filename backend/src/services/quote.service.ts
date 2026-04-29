import { randomUUID } from 'crypto';
import { IPricesRepository } from '../repositories/prices.repository';
import { IQuoteRepository, QuoteRecord } from '../repositories/quote.repository';
import { StlAnalysis } from './stl-processor';

const FILL_RATIO = 0.10;
const N_PERIMETROS = 2;
const ANCHO_LINEA_CM = 0.04; // nozzle 0.4 mm

export interface CotizacionInput {
  stlAnalysis: StlAnalysis;
  materialId: string;
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
  costoInicioUSD: number;
  precioUnitarioUSD: number;
  precioFinalUSD: number;
  material: { id: string; nombre: string; precioGramo: number };
  cantidad: number;
  volumenCm3: number;
  areaCm2: number;
  complejidad: string;
  advertencias: string[];
}

export class QuoteService {
  constructor(
    private readonly pricesRepo: IPricesRepository,
    private readonly quoteRepo: IQuoteRepository,
  ) {}

  async calcularCotizacion(input: CotizacionInput): Promise<CotizacionResult> {
    const material = await this.pricesRepo.getMaterialById(input.materialId);
    if (!material) throw new Error(`Material '${input.materialId}' no encontrado.`);

    const costoInicio = await this.pricesRepo.getCostoInicio();
    const { volumenCm3, areaCm2, complejidad, advertencias } = input.stlAnalysis;

    const gramosInfill = volumenCm3 * FILL_RATIO * material.densidad;
    const gramosParedes = areaCm2 * (N_PERIMETROS * ANCHO_LINEA_CM) * material.densidad;
    const gramosTotal = gramosInfill + gramosParedes;

    const costoMaterialUSD = gramosTotal * material.precioGramo;
    const precioUnitarioUSD = costoMaterialUSD + costoInicio;
    const precioFinalUSD = precioUnitarioUSD * input.cantidad;

    const id = randomUUID();

    const record: QuoteRecord = {
      id,
      empleadoId: input.empleadoId,
      fecha: new Date(),
      archivoStl: input.stlAnalysis.uploadId,
      materialId: input.materialId,
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
      costoInicioUSD: costoInicio,
      precioUnitarioUSD,
      precioFinalUSD,
      material: { id: material.id, nombre: material.nombre, precioGramo: material.precioGramo },
      cantidad: input.cantidad,
      volumenCm3,
      areaCm2,
      complejidad,
      advertencias,
    };
  }
}
