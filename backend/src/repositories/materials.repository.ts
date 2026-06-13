export interface Material {
  id: string;
  nombre: string;
  precioPorCartucho750gEUR: number;
  densidadGCm3: number;
  activo: boolean;
  creadaAt: string;
  actualizadaAt: string;
}

export interface IMaterialsRepository {
  getAll(): Promise<Material[]>;
  getById(id: string): Promise<Material | null>;
  create(data: Omit<Material, 'id' | 'creadaAt' | 'actualizadaAt'>): Promise<Material>;
  update(id: string, data: Partial<Omit<Material, 'id' | 'creadaAt'>>): Promise<Material | null>;
  delete(id: string): Promise<void>;
}
