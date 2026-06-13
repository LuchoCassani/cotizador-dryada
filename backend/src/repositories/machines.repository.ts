export interface Maquina {
  id: string;
  nombre: string;
  capacidadXmm: number;
  capacidadYmm: number;
  capacidadZmm: number;
  costoUsd: number;
  mesesAmortizacion: number;
  activa: boolean;
  creadaAt: string;
}

export interface IMachinesRepository {
  getAll(): Promise<Maquina[]>;
  getById(id: string): Promise<Maquina | null>;
  create(data: Omit<Maquina, 'id' | 'creadaAt'>): Promise<Maquina>;
  update(id: string, data: Partial<Omit<Maquina, 'id' | 'creadaAt'>>): Promise<Maquina | null>;
  delete(id: string): Promise<void>;
}
