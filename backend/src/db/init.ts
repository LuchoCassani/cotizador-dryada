import { mkdirSync, accessSync, constants } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from './database';
import { MAQUINAS_SEED } from './seed/maquinas.seed';
import { MATERIALES_SEED } from './seed/materiales.seed';
import { PARAMETROS_SEED } from './seed/parametros.seed';

export function initDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    try {
      mkdirSync(dir, { recursive: true });
      accessSync(dir, constants.W_OK);
    } catch {
      throw new Error(`Sin permisos de escritura en ${dir}.`);
    }
  }

  let db: Database.Database;
  try {
    db = openDatabase(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS maquinas (
        id                  TEXT    PRIMARY KEY,
        nombre              TEXT    NOT NULL,
        capacidad_x_mm      REAL    NOT NULL,
        capacidad_y_mm      REAL    NOT NULL,
        capacidad_z_mm      REAL    NOT NULL,
        costo_usd           REAL    NOT NULL,
        meses_amortizacion  INTEGER NOT NULL,
        activa              INTEGER NOT NULL DEFAULT 1,
        creada_at           TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS materiales (
        id                    TEXT    PRIMARY KEY,
        nombre                TEXT    NOT NULL,
        precio_cartucho_eur   REAL    NOT NULL,
        densidad_g_cm3        REAL    NOT NULL,
        activo                INTEGER NOT NULL DEFAULT 1,
        creada_at             TEXT    NOT NULL,
        actualizada_at        TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS parametros_globales (
        id                          INTEGER PRIMARY KEY DEFAULT 1
                                      CHECK (id = 1),
        tasa_eur_usd                REAL    NOT NULL,
        tasa_ars_usd                REAL    NOT NULL,
        tarifa_mano_obra_usd_hora   REAL    NOT NULL,
        horas_por_pieza             REAL    NOT NULL,
        desperdicio_pct             REAL    NOT NULL,
        costos_adicionales_usd      REAL    NOT NULL,
        coeficiente_ganancia        REAL    NOT NULL,
        piezas_por_dia_estimadas    INTEGER NOT NULL DEFAULT 20,
        actualizada_at              TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cotizaciones (
        id                  TEXT    PRIMARY KEY,
        empleado_id         TEXT    NOT NULL,
        fecha               TEXT    NOT NULL,
        archivo_stl         TEXT    NOT NULL,
        material_id         TEXT    NOT NULL REFERENCES materiales(id),
        maquina_id          TEXT    NOT NULL DEFAULT '',
        cantidad            INTEGER NOT NULL,
        volumen_cm3         REAL    NOT NULL,
        area_cm2            REAL    NOT NULL,
        gramos_total        REAL    NOT NULL,
        precio_final_usd    REAL    NOT NULL,
        complejidad         TEXT    NOT NULL,
        observaciones       TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cotizaciones_empleado ON cotizaciones(empleado_id);

      CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
    `);
  } catch {
    throw new Error(`No se pudo abrir la base de datos en ${dbPath}.`);
  }

  // Migraciones aditivas — no destruyen datos en DBs existentes
  try { db.exec('ALTER TABLE parametros_globales ADD COLUMN piezas_por_dia_estimadas INTEGER NOT NULL DEFAULT 20'); } catch { /* columna ya existe */ }
  try { db.exec("ALTER TABLE cotizaciones ADD COLUMN maquina_id TEXT NOT NULL DEFAULT ''"); } catch { /* columna ya existe */ }
  try { db.exec('CREATE TABLE IF NOT EXISTS configuracion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)'); } catch { /* ya existe */ }

  const { n } = db.prepare('SELECT COUNT(*) as n FROM maquinas').get() as { n: number };
  if (n === 0) {
    const insertMaquina = db.prepare(`
      INSERT OR IGNORE INTO maquinas
        (id, nombre, capacidad_x_mm, capacidad_y_mm, capacidad_z_mm, costo_usd, meses_amortizacion, activa, creada_at)
      VALUES
        (@id, @nombre, @capacidadXmm, @capacidadYmm, @capacidadZmm, @costoUsd, @mesesAmortizacion, @activa, @creadaAt)
    `);

    const insertMaterial = db.prepare(`
      INSERT OR IGNORE INTO materiales
        (id, nombre, precio_cartucho_eur, densidad_g_cm3, activo, creada_at, actualizada_at)
      VALUES
        (@id, @nombre, @precioPorCartucho750gEUR, @densidadGCm3, @activo, @creadaAt, @actualizadaAt)
    `);

    const insertParams = db.prepare(`
      INSERT OR IGNORE INTO parametros_globales
        (id, tasa_eur_usd, tasa_ars_usd, tarifa_mano_obra_usd_hora, horas_por_pieza, desperdicio_pct, costos_adicionales_usd, coeficiente_ganancia, piezas_por_dia_estimadas, actualizada_at)
      VALUES
        (1, @tasaEurUsd, @tasaArsUsd, @tarifaManoObraUsdHora, @horasPorPieza, @desperdicioPct, @costosAdicionalesUsd, @coeficienteGanancia, @piezasPorDiaEstimadas, @actualizadaAt)
    `);

    db.transaction(() => {
      for (const m of MAQUINAS_SEED) {
        insertMaquina.run({
          id: m.id, nombre: m.nombre,
          capacidadXmm: m.capacidadXmm, capacidadYmm: m.capacidadYmm, capacidadZmm: m.capacidadZmm,
          costoUsd: m.costoUsd, mesesAmortizacion: m.mesesAmortizacion,
          activa: m.activa ? 1 : 0, creadaAt: m.creadaAt,
        });
      }
      for (const m of MATERIALES_SEED) {
        insertMaterial.run({
          id: m.id, nombre: m.nombre,
          precioPorCartucho750gEUR: m.precioPorCartucho750gEUR, densidadGCm3: m.densidadGCm3,
          activo: m.activo ? 1 : 0, creadaAt: m.creadaAt, actualizadaAt: m.actualizadaAt,
        });
      }
      insertParams.run({ ...PARAMETROS_SEED, actualizadaAt: new Date().toISOString() });
    })();
  }

  return db;
}
