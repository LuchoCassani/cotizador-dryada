import { SqliteQuoteRepository } from './repositories/sqlite-quote.repository';
import { QuoteService } from './services/quote.service';
import { EmailService } from './services/email.service';
import { StlAnalysis } from './services/stl-processor';
import type { IPricesRepository } from './repositories/prices.repository';
import { initDatabase } from './db/init';
import { SqliteMachinesRepository } from './repositories/sqlite-machines.repository';
import { SqliteMaterialsRepository } from './repositories/sqlite-materials.repository';
import { SqliteGlobalParamsRepository } from './repositories/sqlite-global-params.repository';

const DB_PATH = process.env.DB_PATH ?? './data/cotizador.db';
const db = initDatabase(DB_PATH);

const machinesRepo  = new SqliteMachinesRepository(db);
const materialsRepo = new SqliteMaterialsRepository(db);
const paramsRepo    = new SqliteGlobalParamsRepository(db);

// Adapter temporal hasta SPEC-C (fórmula con parámetros globales)
const pricesAdapter: IPricesRepository = {
  getMateriales: async () => {
    const all = await materialsRepo.getAll();
    return all
      .filter((m) => m.activo)
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        precioGramo: m.precioPorCartucho750gEUR / 750,
        densidad: m.densidadGCm3,
      }));
  },
  getMaterialById: async (id: string) => {
    const m = await materialsRepo.getById(id);
    if (!m) return null;
    return {
      id: m.id,
      nombre: m.nombre,
      precioGramo: m.precioPorCartucho750gEUR / 750,
      densidad: m.densidadGCm3,
    };
  },
  getCostoInicio: async () => {
    const params = await paramsRepo.get();
    return params.costosAdicionalesUsd;
  },
};

export const pricesRepo   = pricesAdapter;
export const quoteRepo    = new SqliteQuoteRepository(db);
export const quoteService = new QuoteService(pricesAdapter, quoteRepo);
export const emailService = new EmailService();

// Cache en memoria de uploads pendientes de cotizar.
// Límite de 200 entradas simultáneas para evitar consumo ilimitado de RAM.
const UPLOAD_CACHE_MAX = 200;

export const uploadCache = new class extends Map<string, StlAnalysis> {
  set(key: string, value: StlAnalysis) {
    if (this.size >= UPLOAD_CACHE_MAX) {
      // Eliminar la entrada más antigua (primer elemento del Map, que preserva orden de inserción)
      const oldest = this.keys().next().value;
      if (oldest) this.delete(oldest);
    }
    return super.set(key, value);
  }
}();
