# Plan: SQLite Quote Repository

## Architecture

Este feature extiende la capa de datos de SPEC-A aplicando exactamente el mismo patrón:
`initDatabase` crea la tabla → `SqliteQuoteRepository` implementa la interfaz → `app.ts` inyecta la implementación concreta.

**Flujo de datos:**
```
POST /api/quote
  → QuoteService.calcularCotizacion()
  → quoteRepo.save(record)           ← ahora: SqliteQuoteRepository
  → INSERT INTO cotizaciones

GET /api/quote/:id
  → quoteRepo.findById(id)
  → SELECT FROM cotizaciones WHERE id = ?

GET /api/quotes/empleado/:empleadoId
  → quoteRepo.findByEmpleado(empleadoId)
  → SELECT FROM cotizaciones WHERE empleado_id = ? ORDER BY fecha DESC
```

**Integración con SPEC-A:**
- `initDatabase` recibe un bloque `CREATE TABLE IF NOT EXISTS cotizaciones` + `CREATE INDEX` al final del `db.exec()` existente.
- La instancia `Database` creada en `app.ts` (SPEC-A) se reutiliza — no se abre una segunda conexión.
- `SqliteQuoteRepository(db)` recibe la misma instancia que los otros repositorios.

**`IQuoteRepository` sin cambios.** `InMemoryQuoteRepository` queda en disco pero deja de usarse.

## Dependencies

- `better-sqlite3` — ya instalado (SPEC-A)
- `uuid` — no necesario: `QuoteService` genera el UUID antes de llamar a `save()`
- `vitest` — ya configurado (SPEC-A)
- Tabla `materiales` — debe existir antes de crear `cotizaciones` (FK informativa). `initDatabase` ya la crea; el orden en `db.exec()` garantiza esto.

## Files Affected

**Modificar:**
- `backend/src/db/init.ts` — agregar `CREATE TABLE IF NOT EXISTS cotizaciones` + `CREATE INDEX` al bloque `db.exec()`
- `backend/src/app.ts` — reemplazar `new InMemoryQuoteRepository()` por `new SqliteQuoteRepository(db)`

**Crear:**
- `backend/src/repositories/sqlite-quote.repository.ts` — implementación de `IQuoteRepository`
- `backend/tests/repositories/sqlite-quote.test.ts` — tests con `:memory:`

**Sin cambios:**
- `backend/src/repositories/quote.repository.ts` — interfaz intacta
- `backend/src/repositories/in-memory-quote.repository.ts` — queda en disco
- `backend/src/services/quote.service.ts` — no se toca
- Rutas existentes

## Risks and Trade-offs

**Riesgo bajo: `fecha: Date` → TEXT → `Date` round-trip.** `new Date(isoString)` es correcto en todos los motores JS modernos para strings ISO 8601 UTC. No hay riesgo real, pero hay que asegurarse de que el test verifique la conversión.

**Riesgo bajo: orden del `db.exec()` en `initDatabase`.** `cotizaciones` tiene FK a `materiales`, así que la tabla `materiales` debe crearse primero. Ya es así — solo hay que asegurarse de agregar `cotizaciones` al final del `db.exec()` existente, no intercalado.

**Trade-off: FK sin `PRAGMA foreign_keys = ON`.** La integridad referencial es por diseño de UI, no por motor. Aceptado en SPEC-A, confirmado en SPEC-B.

**Sin riesgos de migración.** La tabla `cotizaciones` se crea con `IF NOT EXISTS` en la misma `initDatabase` que ya corre al arrancar. No hay datos históricos a migrar (el `InMemoryQuoteRepository` era volátil).

## Decision

Ver `docs/adr/002-sqlite-quote-repository.md`
