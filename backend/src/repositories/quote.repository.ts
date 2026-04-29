import { NivelComplejidad } from '../services/stl-processor';

export interface QuoteRecord {
  id: string;
  empleadoId: string;
  fecha: Date;
  archivoStl: string;
  materialId: string;
  cantidad: number;
  volumenCm3: number;
  areaCm2: number;
  gramosTotal: number;
  precioFinalUSD: number;
  complejidad: NivelComplejidad;
  observaciones?: string;
}

export interface IQuoteRepository {
  save(quote: QuoteRecord): Promise<void>;
  findById(id: string): Promise<QuoteRecord | null>;
  findByEmpleado(empleadoId: string): Promise<QuoteRecord[]>;
}
