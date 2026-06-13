import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { Maquina, IMachinesRepository } from './machines.repository';

interface MaquinaRow {
  id: string;
  nombre: string;
  capacidad_x_mm: number;
  capacidad_y_mm: number;
  capacidad_z_mm: number;
  costo_usd: number;
  meses_amortizacion: number;
  activa: number;
  creada_at: string;
}

function rowToMaquina(row: MaquinaRow): Maquina {
  return {
    id: row.id,
    nombre: row.nombre,
    capacidadXmm: row.capacidad_x_mm,
    capacidadYmm: row.capacidad_y_mm,
    capacidadZmm: row.capacidad_z_mm,
    costoUsd: row.costo_usd,
    mesesAmortizacion: row.meses_amortizacion,
    activa: row.activa === 1,
    creadaAt: row.creada_at,
  };
}

export class SqliteMachinesRepository implements IMachinesRepository {
  constructor(private readonly db: Database.Database) {}

  getAll(): Promise<Maquina[]> {
    const rows = this.db.prepare('SELECT * FROM maquinas').all() as MaquinaRow[];
    return Promise.resolve(rows.map(rowToMaquina));
  }

  getById(id: string): Promise<Maquina | null> {
    const row = this.db.prepare('SELECT * FROM maquinas WHERE id = ?').get(id) as MaquinaRow | undefined;
    return Promise.resolve(row ? rowToMaquina(row) : null);
  }

  create(data: Omit<Maquina, 'id' | 'creadaAt'>): Promise<Maquina> {
    const id = uuid();
    const creadaAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO maquinas (id, nombre, capacidad_x_mm, capacidad_y_mm, capacidad_z_mm, costo_usd, meses_amortizacion, activa, creada_at)
      VALUES (@id, @nombre, @capacidadXmm, @capacidadYmm, @capacidadZmm, @costoUsd, @mesesAmortizacion, @activa, @creadaAt)
    `).run({
      id, creadaAt, nombre: data.nombre,
      capacidadXmm: data.capacidadXmm, capacidadYmm: data.capacidadYmm, capacidadZmm: data.capacidadZmm,
      costoUsd: data.costoUsd, mesesAmortizacion: data.mesesAmortizacion,
      activa: data.activa ? 1 : 0,
    });
    return Promise.resolve({ id, creadaAt, ...data });
  }

  update(id: string, data: Partial<Omit<Maquina, 'id' | 'creadaAt'>>): Promise<Maquina | null> {
    const existing = this.db.prepare('SELECT * FROM maquinas WHERE id = ?').get(id) as MaquinaRow | undefined;
    if (!existing) return Promise.resolve(null);

    const setClauses: string[] = [];
    const params: Record<string, string | number> = { id };

    if (data.nombre !== undefined) { setClauses.push('nombre = @nombre'); params['nombre'] = data.nombre; }
    if (data.capacidadXmm !== undefined) { setClauses.push('capacidad_x_mm = @capacidadXmm'); params['capacidadXmm'] = data.capacidadXmm; }
    if (data.capacidadYmm !== undefined) { setClauses.push('capacidad_y_mm = @capacidadYmm'); params['capacidadYmm'] = data.capacidadYmm; }
    if (data.capacidadZmm !== undefined) { setClauses.push('capacidad_z_mm = @capacidadZmm'); params['capacidadZmm'] = data.capacidadZmm; }
    if (data.costoUsd !== undefined) { setClauses.push('costo_usd = @costoUsd'); params['costoUsd'] = data.costoUsd; }
    if (data.mesesAmortizacion !== undefined) { setClauses.push('meses_amortizacion = @mesesAmortizacion'); params['mesesAmortizacion'] = data.mesesAmortizacion; }
    if (data.activa !== undefined) { setClauses.push('activa = @activa'); params['activa'] = data.activa ? 1 : 0; }

    if (setClauses.length > 0) {
      this.db.prepare(`UPDATE maquinas SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
    }

    const updated = this.db.prepare('SELECT * FROM maquinas WHERE id = ?').get(id) as MaquinaRow;
    return Promise.resolve(rowToMaquina(updated));
  }

  delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM maquinas WHERE id = ?').run(id);
    return Promise.resolve();
  }
}
