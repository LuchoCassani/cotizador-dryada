import Database from 'better-sqlite3';
import type { IQuoteRepository, QuoteRecord } from './quote.repository';
import type { NivelComplejidad } from '../services/stl-processor';

interface CotizacionRow {
  id: string;
  empleado_id: string;
  fecha: string;
  archivo_stl: string;
  material_id: string;
  maquina_id: string;
  cantidad: number;
  volumen_cm3: number;
  area_cm2: number;
  gramos_total: number;
  precio_final_usd: number;
  complejidad: string;
  observaciones: string | null;
}

function rowToRecord(row: CotizacionRow): QuoteRecord {
  return {
    id: row.id,
    empleadoId: row.empleado_id,
    fecha: new Date(row.fecha),
    archivoStl: row.archivo_stl,
    materialId: row.material_id,
    maquinaId: row.maquina_id,
    cantidad: row.cantidad,
    volumenCm3: row.volumen_cm3,
    areaCm2: row.area_cm2,
    gramosTotal: row.gramos_total,
    precioFinalUSD: row.precio_final_usd,
    complejidad: row.complejidad as NivelComplejidad,
    observaciones: row.observaciones ?? undefined,
  };
}

export class SqliteQuoteRepository implements IQuoteRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async save(record: QuoteRecord): Promise<void> {
    this.db.prepare(`
      INSERT INTO cotizaciones
        (id, empleado_id, fecha, archivo_stl, material_id, maquina_id, cantidad,
         volumen_cm3, area_cm2, gramos_total, precio_final_usd, complejidad, observaciones)
      VALUES
        (@id, @empleadoId, @fecha, @archivoStl, @materialId, @maquinaId, @cantidad,
         @volumenCm3, @areaCm2, @gramosTotal, @precioFinalUSD, @complejidad, @observaciones)
    `).run({
      id: record.id,
      empleadoId: record.empleadoId,
      fecha: record.fecha.toISOString(),
      archivoStl: record.archivoStl,
      materialId: record.materialId,
      maquinaId: record.maquinaId,
      cantidad: record.cantidad,
      volumenCm3: record.volumenCm3,
      areaCm2: record.areaCm2,
      gramosTotal: record.gramosTotal,
      precioFinalUSD: record.precioFinalUSD,
      complejidad: record.complejidad,
      observaciones: record.observaciones ?? null,
    });
  }

  async findById(id: string): Promise<QuoteRecord | null> {
    const row = this.db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(id) as CotizacionRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  async findByEmpleado(empleadoId: string): Promise<QuoteRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM cotizaciones WHERE empleado_id = ? ORDER BY fecha DESC'
    ).all(empleadoId) as CotizacionRow[];
    return rows.map(rowToRecord);
  }
}
