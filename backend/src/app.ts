import { z } from 'zod';
import { mkdirSync } from 'fs';
import { readdir, stat, unlink } from 'fs/promises';
import * as path from 'path';
import { SqliteQuoteRepository } from './repositories/sqlite-quote.repository';
import { QuoteService } from './services/quote.service';
import { PrusaSlicerService } from './services/prusa-slicer.service';
import { EmailService } from './services/email.service';
import { StlAnalysis } from './services/stl-processor';
import type { IPricesRepository } from './repositories/prices.repository';
import { initDatabase } from './db/init';
import { SqliteMachinesRepository } from './repositories/sqlite-machines.repository';
import { SqliteMaterialsRepository } from './repositories/sqlite-materials.repository';
import { SqliteGlobalParamsRepository } from './repositories/sqlite-global-params.repository';

// FR-010: Validación de env vars de PrusaSlicer con zod al arranque
const prusaEnvSchema = z.object({
  PRUSASLICER_BIN:    z.string().min(1).default('prusa-slicer'),
  UPLOADS_DIR:        z.string().min(1).default('/tmp/cotizador-uploads'),
  PRUSA_LAYER_HEIGHT: z.string().regex(/^\d+\.\d+$/).default('0.20'),
});
const prusaEnvResult = prusaEnvSchema.safeParse(process.env);
if (!prusaEnvResult.success) {
  console.error('[startup] Variables de entorno de PrusaSlicer inválidas:', prusaEnvResult.error.issues);
  process.exit(1);
}
const { PRUSASLICER_BIN, UPLOADS_DIR, PRUSA_LAYER_HEIGHT } = prusaEnvResult.data;

const DB_PATH = process.env.DB_PATH ?? './data/cotizador.db';

// EC-007: Crear UPLOADS_DIR al arranque; si falla, el slicer no podrá guardar STLs → fallback N1
try {
  mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.error(`[startup] No se pudo crear UPLOADS_DIR (${UPLOADS_DIR}):`, err);
}

const db = initDatabase(DB_PATH);

export const machinesRepo  = new SqliteMachinesRepository(db);
export const materialsRepo = new SqliteMaterialsRepository(db);
export const paramsRepo    = new SqliteGlobalParamsRepository(db);

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[startup] ADMIN_PASSWORD no configurada — panel de admin deshabilitado');
}

const pricesAdapter: IPricesRepository = {
  getMateriales: async () => {
    const [all, params] = await Promise.all([materialsRepo.getAll(), paramsRepo.get()]);
    return all
      .filter((m) => m.activo)
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        precioGramo: (m.precioPorCartucho750gEUR / 750) * params.tasaEurUsd,
        densidad: m.densidadGCm3,
      }));
  },
  getMaterialById: async (id: string) => {
    const [m, params] = await Promise.all([materialsRepo.getById(id), paramsRepo.get()]);
    if (!m) return null;
    return {
      id: m.id,
      nombre: m.nombre,
      precioGramo: (m.precioPorCartucho750gEUR / 750) * params.tasaEurUsd,
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
const prusaSlicerService  = new PrusaSlicerService(PRUSASLICER_BIN, PRUSA_LAYER_HEIGHT);
export const quoteService = new QuoteService(pricesAdapter, paramsRepo, machinesRepo, quoteRepo, prusaSlicerService);
export const emailService = new EmailService();

// FR-009: Job periódico que elimina STLs con más de 30 min de antigüedad (cubre server restarts)
const UPLOAD_TTL_MS    = 30 * 60 * 1000;
const SCAN_INTERVAL_MS = 10 * 60 * 1000;
setInterval(async () => {
  try {
    const files = await readdir(UPLOADS_DIR);
    const now = Date.now();
    await Promise.all(
      files
        .filter(f => f.endsWith('.stl'))
        .map(async f => {
          const p = path.join(UPLOADS_DIR, f);
          const s = await stat(p).catch(() => null);
          if (s && now - s.mtimeMs > UPLOAD_TTL_MS) await unlink(p).catch(() => {});
        })
    );
  } catch { /* UPLOADS_DIR inaccesible — skip */ }
}, SCAN_INTERVAL_MS).unref();

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
