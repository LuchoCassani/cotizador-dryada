import { IQuoteRepository, QuoteRecord } from './quote.repository';

export class InMemoryQuoteRepository implements IQuoteRepository {
  private readonly store = new Map<string, QuoteRecord>();

  async save(quote: QuoteRecord): Promise<void> {
    this.store.set(quote.id, quote);
  }

  async findById(id: string): Promise<QuoteRecord | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmpleado(empleadoId: string): Promise<QuoteRecord[]> {
    return Array.from(this.store.values()).filter((q) => q.empleadoId === empleadoId);
  }
}
