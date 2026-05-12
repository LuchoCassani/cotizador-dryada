import { JsonPricesRepository } from './repositories/json-prices.repository';
import { InMemoryQuoteRepository } from './repositories/in-memory-quote.repository';
import { QuoteService } from './services/quote.service';
import { EmailService } from './services/email.service';
import { StlAnalysis } from './services/stl-processor';

// Único punto de inyección de dependencias (ver rules.md R1, R3)
export const pricesRepo   = new JsonPricesRepository();
export const quoteRepo    = new InMemoryQuoteRepository();
export const quoteService = new QuoteService(pricesRepo, quoteRepo);
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
