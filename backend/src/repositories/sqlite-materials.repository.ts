import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { Material, IMaterialsRepository } from './materials.repository';

interface MaterialRow {
  id: string;
  nombre: string;
  precio_cartucho_eur: number;
  densidad_g_cm3: number;
  activo: number;
  creada_at: string;
  actualizada_at: string;
}

function rowToMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    nombre: row.nombre,
    precioPorCartucho750gEUR: row.precio_cartucho_eur,
    densidadGCm3: row.densidad_g_cm3,
    activo: row.activo === 1,
    creadaAt: row.creada_at,
    actualizadaAt: row.actualizada_at,
  };
}

export class SqliteMaterialsRepository implements IMaterialsRepository {
  constructor(private readonly db: Database.Database) {}

  getAll(): Promise<Material[]> {
    const rows = this.db.prepare('SELECT * FROM materiales').all() as MaterialRow[];
    return Promise.resolve(rows.map(rowToMaterial));
  }

  getById(id: string): Promise<Material | null> {
    const row = this.db.prepare('SELECT * FROM materiales WHERE id = ?').get(id) as MaterialRow | undefined;
    return Promise.resolve(row ? rowToMaterial(row) : null);
  }

  create(data: Omit<Material, 'id' | 'creadaAt' | 'actualizadaAt'>): Promise<Material> {
    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO materiales (id, nombre, precio_cartucho_eur, densidad_g_cm3, activo, creada_at, actualizada_at)
      VALUES (@id, @nombre, @precioPorCartucho750gEUR, @densidadGCm3, @activo, @creadaAt, @actualizadaAt)
    `).run({
      id, nombre: data.nombre,
      precioPorCartucho750gEUR: data.precioPorCartucho750gEUR,
      densidadGCm3: data.densidadGCm3,
      activo: data.activo ? 1 : 0,
      creadaAt: now, actualizadaAt: now,
    });
    return Promise.resolve({ id, creadaAt: now, actualizadaAt: now, ...data });
  }

  update(id: string, data: Partial<Omit<Material, 'id' | 'creadaAt'>>): Promise<Material | null> {
    const existing = this.db.prepare('SELECT * FROM materiales WHERE id = ?').get(id) as MaterialRow | undefined;
    if (!existing) return Promise.resolve(null);

    const actualizadaAt = new Date().toISOString();
    const setClauses: string[] = ['actualizada_at = @actualizadaAt'];
    const params: Record<string, string | number> = { id, actualizadaAt };

    if (data.nombre !== undefined) { setClauses.push('nombre = @nombre'); params['nombre'] = data.nombre; }
    if (data.precioPorCartucho750gEUR !== undefined) { setClauses.push('precio_cartucho_eur = @precioPorCartucho750gEUR'); params['precioPorCartucho750gEUR'] = data.precioPorCartucho750gEUR; }
    if (data.densidadGCm3 !== undefined) { setClauses.push('densidad_g_cm3 = @densidadGCm3'); params['densidadGCm3'] = data.densidadGCm3; }
    if (data.activo !== undefined) { setClauses.push('activo = @activo'); params['activo'] = data.activo ? 1 : 0; }

    this.db.prepare(`UPDATE materiales SET ${setClauses.join(', ')} WHERE id = @id`).run(params);

    const updated = this.db.prepare('SELECT * FROM materiales WHERE id = ?').get(id) as MaterialRow;
    return Promise.resolve(rowToMaterial(updated));
  }

  delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM materiales WHERE id = ?').run(id);
    return Promise.resolve();
  }
}
