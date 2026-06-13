# ADR-002: SQLite Quote Repository

**Date**: 2026-06-13
**Status**: Accepted
**Feature**: sqlite-quote-repository

## Context

`InMemoryQuoteRepository` pierde todo el historial de cotizaciones en cada reinicio del servidor. SPEC-B reemplaza esta implementación por `SqliteQuoteRepository`, que persiste los registros en la misma base de datos SQLite introducida en SPEC-A.

## Alternatives Considered

No hay alternativas viables dentro de las restricciones actuales:

- **Persistencia en JSON local**: ya fue descartada al introducir SQLite en SPEC-A. Agregar un segundo mecanismo de persistencia (JSON para quotes, SQLite para materiales/máquinas) rompería la arquitectura de un único archivo `.db`.
- **Base de datos externa (PostgreSQL, etc.)**: fuera de scope para la herramienta interna de N1. La constitución del proyecto establece SQLite como mecanismo de persistencia.
- **Mantener InMemoryQuoteRepository**: no resuelve el problema — el historial se pierde en cada reinicio.

La approach descrita a continuación es la única consistente con la constitución del proyecto y los requisitos.

## Decision

Implementar `SqliteQuoteRepository` siguiendo el mismo patrón establecido en SPEC-A:

1. Extender `initDatabase` con `CREATE TABLE IF NOT EXISTS cotizaciones` + `CREATE INDEX IF NOT EXISTS idx_cotizaciones_empleado` al final del bloque `db.exec()` existente.
2. Crear `sqlite-quote.repository.ts` con `SqliteQuoteRepository` que implementa `IQuoteRepository` sin modificar la interfaz.
3. En `app.ts`, reemplazar `new InMemoryQuoteRepository()` por `new SqliteQuoteRepository(db)` usando la instancia `Database` ya existente.
4. El campo `fecha: Date` se serializa a ISO 8601 UTC al guardar y se deserializa con `new Date(row.fecha)` al leer.
5. El ordenamiento `ORDER BY fecha DESC` en `findByEmpleado` es un detalle de implementación, no un contrato de interfaz.

## Consequences

**Positivo:**
- El historial de cotizaciones sobrevive reinicios del servidor.
- Cero cambios en `QuoteService`, `IQuoteRepository`, y las rutas existentes.
- La misma instancia `Database` sirve a todos los repositorios — una sola conexión al archivo `.db`.
- `InMemoryQuoteRepository` queda disponible para tests unitarios de `QuoteService` si alguna vez se necesita aislar la capa de servicio.

**Negativo / Trade-offs:**
- FK `material_id → materiales(id)` no enforceada por el motor. La integridad depende de que la UI de SPEC-E no exponga hard delete de materiales (decisión documentada en la spec de SPEC-B).
- `findByEmpleado` sin límite de resultados. Aceptado hasta SPEC-E, donde se introduce paginación (OQ-001).
