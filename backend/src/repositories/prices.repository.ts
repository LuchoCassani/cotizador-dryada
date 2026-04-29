export interface Material {
  id: string;
  nombre: string;
  precioGramo: number; // USD
  densidad: number;    // g/cm³
}

export interface IPricesRepository {
  getMateriales(): Promise<Material[]>;
  getMaterialById(id: string): Promise<Material | null>;
  getCostoInicio(): Promise<number>; // USD
}
