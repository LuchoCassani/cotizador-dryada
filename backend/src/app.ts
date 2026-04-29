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

// Cache en memoria de uploads pendientes de cotizar
export const uploadCache  = new Map<string, StlAnalysis>();
