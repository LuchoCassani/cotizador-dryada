# Tasks: SQLite Quote Repository

**Feature**: sqlite-quote-repository
**Plan**: specs/sqlite-quote-repository/plan.md
**Generated**: 2026-06-13

---

## TASK-001: Extender initDatabase con tabla cotizaciones e índice

**Status**: completed
**Requirements**: FR-001, FR-008, C-1
**Complexity**: S
**Depends on**: none
**Files**: backend/src/db/init.ts

### Description
Agregar al bloque `db.exec()` existente en `initDatabase`, después de las 3 tablas actuales, el `CREATE TABLE IF NOT EXISTS cotizaciones` con sus 12 columnas (ver spec §8) y a continuación `CREATE INDEX IF NOT EXISTS idx_cotizaciones_empleado ON cotizaciones(empleado_id)`. El schema debe respetar el orden: `materiales` antes que `cotizaciones` (FK informativa). No modificar nada más del archivo.

### Validation
`tsc --noEmit` sin errores. `initDatabase(':memory:').prepare("SELECT name FROM sqlite_master WHERE type='table'").all()` incluye `cotizaciones`. `initDatabase(':memory:').prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cotizaciones_empleado'").get()` devuelve un resultado no-null.

---

## TASK-002: Implementar SqliteQuoteRepository

**Status**: completed
**Requirements**: FR-002, FR-003, FR-004, FR-005, FR-006, NFR-001, NFR-004, EC-001, EC-002, EC-003, EC-004, EC-005, C-2
**Complexity**: M
**Depends on**: TASK-001
**Files**: backend/src/repositories/sqlite-quote.repository.ts

### Description
Crear `SqliteQuoteRepository` que implementa `IQuoteRepository`. Constructor recibe `Database.Database`. Implementar los 3 métodos:
- `save(record)`: INSERT con todos los campos; `record.fecha.toISOString()` para la columna `fecha`; `record.observaciones ?? null` para la columna `observaciones`. Retorna `Promise<void>`.
- `findById(id)`: SELECT por PK; si no existe retorna `Promise.resolve(null)` (EC-002). Mapear row a `QuoteRecord`: `new Date(row.fecha)` para el campo `fecha`; `row.observaciones ?? undefined` para `observaciones`.
- `findByEmpleado(empleadoId)`: SELECT WHERE empleado_id con `ORDER BY fecha DESC`; si no hay resultados retorna `[]` (EC-003). El ordenamiento es detalle de implementación, no contrato de interfaz (C-2).
Definir interfaz `CotizacionRow` con columnas snake_case y función `rowToRecord(row)` para el mapeo. Sin `any`.

### Validation
`tsc --noEmit` sin errores. La clase implementa `IQuoteRepository` completamente. Tipos de retorno coinciden con la interfaz. No hay `any` en el archivo.

---

## TASK-003: Tests para SqliteQuoteRepository

**Status**: completed
**Requirements**: FR-002, FR-003, FR-004, FR-005, FR-006, NFR-002, NFR-003, EC-001, EC-002, EC-003, EC-004
**Complexity**: M
**Depends on**: TASK-001, TASK-002
**Files**: backend/tests/repositories/sqlite-quote.test.ts

### Description
Crear `backend/tests/repositories/sqlite-quote.test.ts`. En `beforeEach`: `db = initDatabase(':memory:')`, `repo = new SqliteQuoteRepository(db)`. Helper `makeRecord(overrides?)` que genera un `QuoteRecord` válido con UUID fijo y `fecha: new Date('2026-06-13T10:00:00.000Z')`.
Tests: (1) `save()` persiste y `findById()` recupera el mismo registro; (2) `findById('no-existe')` retorna `null` (EC-002); (3) `findByEmpleado()` retorna array vacío si no hay registros (EC-003); (4) `findByEmpleado()` retorna todas las cotizaciones del empleado ordenadas por `fecha DESC`; (5) `save()` con `observaciones: undefined` → `findById` retorna `observaciones: undefined` (EC-004 / FR-006); (6) el campo `fecha` sobrevive el round-trip como `Date` (FR-005); (7) `save()` con id duplicado lanza error (EC-001).

### Validation
`npm test -- --run` pasa todos los tests de este archivo. Cobertura de `sqlite-quote.repository.ts` ≥ 80%.

---

## TASK-004: Actualizar app.ts con SqliteQuoteRepository

**Status**: completed
**Requirements**: FR-007, NFR-004
**Complexity**: S
**Depends on**: TASK-001, TASK-002
**Files**: backend/src/app.ts

### Description
En `backend/src/app.ts`: (1) agregar `import { SqliteQuoteRepository } from './repositories/sqlite-quote.repository'`; (2) reemplazar `new InMemoryQuoteRepository()` por `new SqliteQuoteRepository(db)` usando la instancia `db` ya existente. Eliminar el import de `InMemoryQuoteRepository` si queda sin uso. `InMemoryQuoteRepository` permanece en disco pero sin importarse desde `app.ts`.

### Validation
`tsc --noEmit` sin errores. `npm test -- --run` sigue pasando los 29 tests existentes (regresión).
