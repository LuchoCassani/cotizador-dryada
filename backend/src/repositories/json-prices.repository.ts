import pricesData from '../data/prices.json';
import { IPricesRepository, Material } from './prices.repository';

export class JsonPricesRepository implements IPricesRepository {
  async getMateriales(): Promise<Material[]> {
    return pricesData.materiales;
  }

  async getMaterialById(id: string): Promise<Material | null> {
    return pricesData.materiales.find((m) => m.id === id) ?? null;
  }

  async getCostoInicio(): Promise<number> {
    return pricesData.costoInicio;
  }
}
