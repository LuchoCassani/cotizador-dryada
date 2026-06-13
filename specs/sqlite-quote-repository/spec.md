# SQLite Quote Repository — Specification

**Version:** 1.0
**Date:** 2026-06-13
**Status:** Draft
**PRD Reference:** None
**Constitution:** Confirmed compliant

---

## 1. Metadata

| Campo | Valor |
|---|---|
| Feature | sqlite-quote-repository |
| Autor | Lucho |
| Versión | 1.0 |
| Estado | Draft |
| Creado | 2026-06-13 |
| Última actualización | 2026-06-13 |

---

## 2. Context

El cotizador actualmente persiste cotizaciones en `InMemoryQuoteRepository` — un `Map` en memoria que se pierde en cada reinicio del servidor. Esto significa que el historial de cotizaciones generadas por Denise y el equipo de ventas desaparece cada vez que se hace un deploy o el proceso cae. En la práctica, no existe historial.

Este spec implementa `SqliteQuoteRepository`, que persiste cada cotización en la tabla `cotizaciones` del mismo archivo `.db` introducido en SPEC-A. El cambio es transparente para `QuoteService` — solo se reemplaza la implementación concreta inyectada en `app.ts`. La interfaz `IQuoteRepository` y todos sus contratos actuales se mantienen sin cambios.

La decisión de no agregar `findAll()` ni `maquinaId` es intencional: esas extensiones pertenecen a SPEC-E (admin UI) y SPEC-C (fórmula por máquina) respectivamente. Este spec hace lo mínimo necesario para tener historial duradero.

La eliminación de materiales es por baja lógica (`activo = false`), no hard delete — decisión establecida en este spec y que SPEC-E debe respetar. Esto garantiza que toda cotización histórica siempre resuelve su `materialId`.

---

## 3. Goals & Non-Goals

### Goals

1. Las cotizaciones persisten entre reinicios del servidor — al reiniciar, `findById(id)` sobre una cotización previa devuelve el mismo registro.
2. La tabla `cotizaciones` se crea automáticamente en `initDatabase`, sin pasos manuales.
3. `QuoteService` no requiere ningún cambio de código — solo cambia la implementación inyectada en `app.ts`.
4. El material referenciado en una cotización histórica siempre es recuperable, garantizado por baja lógica en materiales (no hard delete).

### Non-Goals

1. Agregar `findAll()` a `IQuoteRepository` — Why: es parte de SPEC-E (panel admin), donde se define paginación y filtros.
2. Agregar `maquinaId` a `QuoteRecord` — Why: es parte de SPEC-C (fórmula por máquina); agrégarlo ahora implicaría NULL en todas las cotizaciones actuales sin semántica clara.
3. Migrar registros históricos del `InMemoryQuoteRepository` — Why: ese historial es volátil por definición y no existe entre reinicios.
4. Implementar búsqueda por rango de fechas o filtros avanzados — Why: SPEC-E.
5. Eliminar hard-delete de `IMaterialsRepository` del código — Why: la interfaz queda como está; la restricción es de UI (SPEC-E no expone el botón).

---

## 4. User Stories

### Actor: Sistema (backend al procesar una cotización)

**Story:** Al calcular una cotización, `QuoteService` guarda el resultado vía `IQuoteRepository.save()`. El registro debe estar disponible para consulta posterior inmediatamente.

**Acceptance criteria:**
- Given que se calcula una cotización, when `quoteRepo.save(record)` es llamado, then el registro queda persistido en SQLite.
- Given que el servidor se reinicia, when `quoteRepo.findById(id)` es llamado con un ID previo al reinicio, then devuelve el mismo `QuoteRecord`.
- Given un `empleadoId`, when `quoteRepo.findByEmpleado(empleadoId)` es llamado, then devuelve todas las cotizaciones de ese empleado, ordenadas por fecha descendente.

### Actor: Sistema (generación de PDF / email)

**Story:** Al regenerar un PDF o reenviar por email, el sistema recupera la cotización guardada por su ID.

**Acceptance criteria:**
- Given un ID válido, when `findById(id)` es llamado, then devuelve el `QuoteRecord` completo con todos los campos.
- Given un ID inexistente, when `findById(id)` es llamado, then devuelve `null`.

---

## 5. Functional Requirements

- **FR-001:** La tabla `cotizaciones` se crea en `initDatabase` con `CREATE TABLE IF NOT EXISTS`. No requiere cambios en `IQuoteRepository` ni en `QuoteService`.
- **FR-002:** `SqliteQuoteRepository.save(record)` inserta una fila en `cotizaciones`. Si el `id` ya existe, lanza error (violación de PK — no debe ocurrir en operación normal).
- **FR-003:** `SqliteQuoteRepository.findById(id)` retorna el `QuoteRecord` mapeado, o `null` si no existe.
- **FR-004:** `SqliteQuoteRepository.findByEmpleado(empleadoId)` retorna todas las cotizaciones del empleado ordenadas por `fecha DESC`.
- **FR-005:** El campo `fecha` se almacena como TEXT en formato ISO 8601 y se convierte a `Date` al leer.
- **FR-006:** El campo `observaciones` es nullable — se almacena como NULL en SQLite y se mapea a `undefined` en TypeScript.
- **FR-007:** `app.ts` reemplaza `new InMemoryQuoteRepository()` por `new SqliteQuoteRepository(db)`. `InMemoryQuoteRepository` queda en disco pero sin uso.
- **FR-008:** La columna `material_id` tiene `REFERENCES materiales(id)` como FK informativa. SQLite no enforcea FKs por defecto — la integridad se garantiza por diseño (baja lógica en materiales, nunca hard delete desde la UI).

---

## 6. Non-Functional Requirements

- **NFR-001:** `save()`, `findById()`, `findByEmpleado()` completan en < 10ms para un historial de hasta 10.000 cotizaciones (tamaño realista para 1-2 años de uso).
- **NFR-002:** Los tests usan SQLite en memoria (`:memory:`) con `initDatabase` para aislamiento total.
- **NFR-003:** Cobertura de tests ≥ 80% en `SqliteQuoteRepository`.
- **NFR-004:** `tsc --noEmit` sin errores después de implementar. Sin `any` en el código del feature.

---

## 7. Technical Design

### Stack

Mismo que SPEC-A: `better-sqlite3` síncrono, wrappear en `Promise.resolve()` para mantener contratos async de la interfaz.

### Architecture

```
backend/src/
├── db/
│   └── init.ts          ← agregar CREATE TABLE cotizaciones
└── repositories/
    ├── quote.repository.ts              ← SIN CAMBIOS
    └── sqlite-quote.repository.ts       ← NUEVO
```

`app.ts`: swap de `InMemoryQuoteRepository` → `SqliteQuoteRepository(db)`.

### Decisions & Rationale

**Decision:** `fecha` como TEXT ISO 8601 en lugar de INTEGER (Unix timestamp).
**Context:** SQLite no tiene tipo DATE nativo. Las dos opciones comunes son TEXT ISO 8601 o INTEGER Unix timestamp.
**Rationale:** TEXT ISO 8601 es legible directamente en el archivo `.db` con cualquier herramienta SQLite (DB Browser, sqlite3 CLI). La legibilidad importa para una herramienta interna donde Denise o Lucho pueden inspeccionar la DB. El overhead de conversión es despreciable.
**Consequences:** Al leer, `new Date(row.fecha)` convierte el string a `Date`. Al escribir, `record.fecha.toISOString()` convierte el `Date` a string.

**Decision:** FK `REFERENCES materiales(id)` sin `PRAGMA foreign_keys = ON`.
**Context:** SQLite no enforcea FKs a menos que se active `PRAGMA foreign_keys = ON` por conexión.
**Rationale:** No activar el pragma mantiene la misma estrategia que SPEC-A. La integridad referencial se garantiza por diseño de UI (SPEC-E no expone hard delete de materiales), no por el motor. Activar el pragma en toda la conexión podría impactar otras operaciones y requiere análisis más cuidadoso.
**Consequences:** Si alguien ejecuta hard delete de un material directamente en la DB (bypass de UI), las cotizaciones históricas quedan con un `materialId` huérfano. Riesgo aceptable para una herramienta interna.

---

## 8. Data Models

### Schema SQL

```sql
CREATE TABLE IF NOT EXISTS cotizaciones (
  id                  TEXT    PRIMARY KEY,
  empleado_id         TEXT    NOT NULL,
  fecha               TEXT    NOT NULL,           -- ISO 8601
  archivo_stl         TEXT    NOT NULL,
  material_id         TEXT    NOT NULL REFERENCES materiales(id),
  cantidad            INTEGER NOT NULL,
  volumen_cm3         REAL    NOT NULL,
  area_cm2            REAL    NOT NULL,
  gramos_total        REAL    NOT NULL,
  precio_final_usd    REAL    NOT NULL,
  complejidad         TEXT    NOT NULL,           -- 'simple' | 'moderada' | 'compleja'
  observaciones       TEXT                        -- NULL si no hay
);
```

### Entity: Cotizacion

| Campo | Tipo SQLite | TypeScript | Requerido | Descripción |
|---|---|---|---|---|
| id | TEXT (UUID) | string | sí | PK, generado por `QuoteService` |
| empleado_id | TEXT | string | sí | ID del empleado que generó la cotización |
| fecha | TEXT (ISO 8601) | Date | sí | Momento de cálculo |
| archivo_stl | TEXT | string | sí | `uploadId` del archivo STL |
| material_id | TEXT | string | sí | FK a `materiales.id` |
| cantidad | INTEGER | number | sí | Unidades cotizadas |
| volumen_cm3 | REAL | number | sí | Volumen calculado del STL |
| area_cm2 | REAL | number | sí | Área superficial calculada |
| gramos_total | REAL | number | sí | Gramos de filamento estimados |
| precio_final_usd | REAL | number | sí | Precio final en USD |
| complejidad | TEXT | NivelComplejidad | sí | Detección de complejidad del STL |
| observaciones | TEXT | string \| undefined | no | Notas opcionales del empleado |

### Mapping `QuoteRecord` → row

| TypeScript (`QuoteRecord`) | SQLite (`cotizaciones`) |
|---|---|
| `id` | `id` |
| `empleadoId` | `empleado_id` |
| `fecha` (Date) | `fecha` (TEXT ISO 8601) |
| `archivoStl` | `archivo_stl` |
| `materialId` | `material_id` |
| `cantidad` | `cantidad` |
| `volumenCm3` | `volumen_cm3` |
| `areaCm2` | `area_cm2` |
| `gramosTotal` | `gramos_total` |
| `precioFinalUSD` | `precio_final_usd` |
| `complejidad` | `complejidad` |
| `observaciones?` | `observaciones` (NULL) |

### Relationships

- `cotizaciones.material_id` → `materiales.id` (FK informativa, no enforceada por pragma)
- `cotizaciones.empleado_id` → sin FK (no hay tabla de empleados en N1)

---

## 9. API Contracts

Este spec no agrega endpoints HTTP nuevos. El contrato existente de `IQuoteRepository` permanece sin cambios:

```typescript
interface IQuoteRepository {
  save(quote: QuoteRecord): Promise<void>;
  findById(id: string): Promise<QuoteRecord | null>;
  findByEmpleado(empleadoId: string): Promise<QuoteRecord[]>;
}
```

Los endpoints que consumen estas operaciones (`POST /api/quote`, `GET /api/quote/:id`) no cambian.

---

## 10. Edge Cases & Error Handling

| ID | Escenario | Comportamiento esperado |
|---|---|---|
| EC-001 | `save(record)` con `id` duplicado | `better-sqlite3` lanza `SqliteError: UNIQUE constraint failed`. El error burbujea sin transformar — no debe ocurrir en operación normal (UUID v4 garantiza unicidad). |
| EC-002 | `findById(id)` con ID inexistente | Retorna `null`. El llamador (ruta HTTP) decide si devolver 404. |
| EC-003 | `findByEmpleado(empleadoId)` sin cotizaciones para ese empleado | Retorna array vacío `[]`. Nunca lanza error. |
| EC-004 | `observaciones` no presente en `QuoteRecord` | Se inserta `NULL` en SQLite. Al leer, la fila tiene `observaciones: null` en el row, que se mapea a `undefined` en el objeto TypeScript. |
| EC-005 | Tabla `cotizaciones` no existe al llamar al repositorio | No debe ocurrir: `initDatabase` se llama antes de instanciar repositorios en `app.ts`. Si ocurre (bug de inicialización), `better-sqlite3` lanza `SqliteError: no such table`. El proceso termina — es un error de programación, no de uso. |

---

## 11. Open Questions

- [ ] **OQ-001** — ¿`findByEmpleado` necesita un límite de resultados para evitar queries sin bound? Un empleado con 2 años de historial podría tener miles de cotizaciones. — Owner: Lucho — By: antes de implementar SPEC-E (donde se consume este método con paginación en UI).

## Clarifications

<!-- Added by /sdd:clarify. Do not edit manually. -->

### C-1: Índice en empleado_id
**Type:** structural gap
**Q:** ¿Agregamos `CREATE INDEX IF NOT EXISTS` en `empleado_id` dentro de `initDatabase`?
**A:** Sí. Agregar `CREATE INDEX IF NOT EXISTS idx_cotizaciones_empleado ON cotizaciones(empleado_id)`.
**Pattern tip:** Cuando un repositorio expone un método de búsqueda por campo no-PK, agregar el índice correspondiente en la misma migración que crea la tabla — un índice olvidado en producción requiere recrear la tabla.

### C-2: Ordenamiento en findByEmpleado
**Type:** ambiguity
**Q:** ¿El orden `fecha DESC` es contrato de `IQuoteRepository` o detalle de implementación de `SqliteQuoteRepository`?
**A:** Detalle de implementación. La interfaz no garantiza orden; `SqliteQuoteRepository` ordena por `fecha DESC` internamente. `IQuoteRepository` no se toca.
**Pattern tip:** Las interfaces de repositorio deben ser agnósticas al ordenamiento — el orden es una preocupación de presentación que pertenece a la capa de servicio o UI, no al contrato de datos.
