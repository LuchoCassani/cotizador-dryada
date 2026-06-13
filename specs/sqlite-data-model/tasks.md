# Tasks: Modelo de Datos SQLite

**Feature**: sqlite-data-model
**Plan**: specs/sqlite-data-model/plan.md
**Generated**: 2026-06-13

---

## TASK-001: Agregar dependencias better-sqlite3 y vitest a package.json

**Status**: completed
**Requirements**: NFR-003, NFR-004
**Complexity**: S
**Depends on**: none
**Files**: backend/package.json

### Description
Agregar `better-sqlite3` como dependencia de producción y `@types/better-sqlite3` + `vitest` como devDependencies en `backend/package.json`. Agregar el script `"test": "vitest"` a la sección `scripts`. Verificar que `uuid` ya está instalado; si no, agregarlo también como dependency.

### Validation
`npm install` en `backend/` completa sin errores. `npm test` imprime el output de vitest (aunque no haya tests aún). `node -e "require('better-sqlite3')"` no lanza error.

---

## TASK-002: Crear vitest.config.ts

**Status**: completed
**Requirements**: NFR-003
**Complexity**: S
**Depends on**: TASK-001
**Files**: backend/vitest.config.ts

### Description
Crear `backend/vitest.config.ts` con `root: 'src'`, `environment: 'node'`, y `include: ['../tests/**/*.test.ts']` para que vitest encuentre los tests en el directorio `backend/tests/`. No agregar configuración que no sea necesaria.

### Validation
`npm test` en `backend/` corre sin error de configuración. Con al menos un test dummy en `backend/tests/`, vitest lo detecta y lo ejecuta.

---

## TASK-003: Definir interfaces TypeScript y tipos de repositorios

**Status**: completed
**Requirements**: FR-001, FR-002, FR-003, FR-007
**Complexity**: S
**Depends on**: none
**Files**: backend/src/repositories/machines.repository.ts, backend/src/repositories/materials.repository.ts, backend/src/repositories/global-params.repository.ts

### Description
Crear los tres archivos de interfaz con los tipos de dominio y contratos de repositorio exactamente como están definidos en la sección 8 (Data Models → Interfaces TypeScript) de la spec. Todos los métodos retornan `Promise<T>` aunque la implementación sea síncrona. Incluir `delete()` (hard delete) en `IMachinesRepository` e `IMaterialsRepository`; no incluir `deactivate()`.

### Validation
`tsc --noEmit` no reporta errores en estos tres archivos. Los tipos exportados son `Maquina`, `IMachinesRepository`, `Material`, `IMaterialsRepository`, `ParametrosGlobales`, `IGlobalParametersRepository`.

---

## TASK-004: Crear seed data de máquinas

**Status**: completed
**Requirements**: FR-005
**Complexity**: S
**Depends on**: TASK-003
**Files**: backend/src/db/seed/maquinas.seed.ts

### Description
Crear el array de 4 máquinas como está definido en la spec (sección 8, Entity: Maquina, tabla Seed data): 3 máquinas con capacidad 300×300×300mm y 1 con 300×300×600mm, todas con `costoUsd = 7000`, `mesesAmortizacion = 30`, `activa = true`. Generar IDs fijos con `uuid()` al momento de crear el archivo (no en runtime) para que el seed sea determinístico. El array exportado debe tipar cada elemento como `Omit<Maquina, never>` para que el compilador valide todos los campos.

### Validation
El archivo exporta un array `MAQUINAS_SEED` con exactamente 4 elementos. `tsc --noEmit` no reporta errores. Cada elemento tiene todos los campos requeridos por el tipo `Maquina`.

---

## TASK-005: Crear seed data de materiales

**Status**: completed
**Requirements**: FR-002, FR-004
**Complexity**: S
**Depends on**: TASK-003
**Files**: backend/src/db/seed/materiales.seed.ts

### Description
Crear el array de 33 materiales exactamente como aparecen en la spec (sección 8, Entity: Material, tabla Seed data). Precios en EUR/cartucho 750g, densidades en g/cm³ con los valores de la lista (los marcados con `*` son estimaciones a confirmar con Denise — OQ-002). Generar IDs fijos con `uuid()`. El array exportado se llama `MATERIALES_SEED`.

### Validation
El archivo exporta `MATERIALES_SEED` con exactamente 33 elementos. `tsc --noEmit` no reporta errores. Cada material tiene `precioPorCartucho750gEUR > 0` y `densidadGCm3 > 0`.

---

## TASK-006: Crear seed data de parámetros globales

**Status**: completed
**Requirements**: FR-003, FR-006
**Complexity**: S
**Depends on**: TASK-003
**Files**: backend/src/db/seed/parametros.seed.ts

### Description
Crear el objeto de valores iniciales para `parametros_globales` con exactamente los valores del Excel v14 (spec sección 8, Entity: ParametrosGlobales): `tasaEurUsd = 1.0549`, `tasaArsUsd = 0` (placeholder — Denise configura antes del primer uso), `tarifaManoObraUsdHora = 6.82`, `horasPorPieza = 0.20`, `desperdicioPct = 0.10`, `costosAdicionalesUsd = 0.50`, `coeficienteGanancia = 2.0`. El objeto exportado se llama `PARAMETROS_SEED`.

### Validation
El archivo exporta `PARAMETROS_SEED` con todos los campos de `ParametrosGlobales` excepto `actualizadaAt` (se genera en runtime). `tsc --noEmit` no reporta errores. `PARAMETROS_SEED.tasaArsUsd === 0` y `PARAMETROS_SEED.coeficienteGanancia === 2.0`.

---

## TASK-007: Crear database.ts con openDatabase

**Status**: completed
**Requirements**: FR-008, NFR-001
**Complexity**: S
**Depends on**: TASK-001
**Files**: backend/src/db/database.ts

### Description
Crear `backend/src/db/database.ts` que exporta la función `openDatabase(dbPath: string): Database`. Esta función instancia `new Database(dbPath)` de `better-sqlite3`, habilita WAL mode (`db.pragma('journal_mode = WAL')`) para robustez ante interrupciones, y retorna la instancia. No gestiona schema ni seed — eso es responsabilidad de `init.ts`.

### Validation
El archivo exporta `openDatabase`. `tsc --noEmit` no reporta errores. Al llamar con `':memory:'` retorna una instancia válida de `Database` de better-sqlite3.

---

## TASK-008: Implementar initDatabase() con CREATE TABLE y seed condicional

**Status**: completed
**Requirements**: FR-008, FR-009, EC-001, EC-005, EC-006
**Complexity**: M
**Depends on**: TASK-004, TASK-005, TASK-006, TASK-007
**Files**: backend/src/db/init.ts

### Description
Crear `backend/src/db/init.ts` con la función `initDatabase(dbPath: string): Database`. La función: (1) verifica que el directorio padre tiene permisos de escritura; si no, lanza `Error("Sin permisos de escritura en [dir]")` antes de abrir el archivo; (2) llama `openDatabase(dbPath)` — si `better-sqlite3` lanza por archivo corrupto, el error se propaga con mensaje enriquecido `"No se pudo abrir la base de datos en [path]"`; (3) ejecuta `CREATE TABLE IF NOT EXISTS` para las 3 tablas con el schema exacto de la spec (sección 8, Schema SQL); (4) verifica `SELECT COUNT(*) FROM maquinas` — si es `0`, inserta todo el seed data con `INSERT OR IGNORE`; (5) retorna la instancia `Database`. El seed de `parametros_globales` usa `INSERT OR IGNORE` con `id = 1` y `actualizadaAt = new Date().toISOString()`.

### Validation
Llamar `initDatabase(':memory:')` crea las 3 tablas y retorna una instancia válida. Llamar dos veces con el mismo path en disco no duplica filas. El archivo `backend/src/db/init.ts` exporta `initDatabase` y `tsc --noEmit` no reporta errores.

---

## TASK-009: Implementar SqliteMachinesRepository

**Status**: completed
**Requirements**: FR-001, FR-007, EC-002, EC-003, NFR-002
**Complexity**: M
**Depends on**: TASK-003, TASK-007
**Files**: backend/src/repositories/sqlite-machines.repository.ts

### Description
Crear `SqliteMachinesRepository` que implementa `IMachinesRepository`. El constructor recibe una instancia `Database`. Implementar los 5 métodos: `getAll()` retorna todas las filas (activas e inactivas, EC-003); `getById(id)` retorna `null` si no existe (EC-002); `create(data)` genera UUID, inserta con `db.prepare(...).run(...)` y retorna la fila creada; `update(id, data)` actualiza solo los campos presentes en `data` y retorna `null` si el id no existe; `delete(id)` borra la fila (hard delete). Todos los métodos retornan `Promise.resolve(...)`. Mapear columnas snake_case de SQLite a camelCase TypeScript (`activa INTEGER` → `boolean`, etc.).

### Validation
`tsc --noEmit` no reporta errores. La clase implementa `IMachinesRepository` completamente. Los tipos de retorno coinciden con la interfaz.

---

## TASK-010: Implementar SqliteMaterialsRepository

**Status**: completed
**Requirements**: FR-002, FR-007, EC-002, NFR-002
**Complexity**: M
**Depends on**: TASK-003, TASK-007
**Files**: backend/src/repositories/sqlite-materials.repository.ts

### Description
Crear `SqliteMaterialsRepository` que implementa `IMaterialsRepository`. Igual estructura que TASK-009. El campo `precio_cartucho_eur` en SQLite mapea a `precioPorCartucho750gEUR` en TypeScript. `update()` actualiza también `actualizada_at` automáticamente con `new Date().toISOString()`. `getById()` retorna `null` si no existe (EC-002). `delete()` es hard delete.

### Validation
`tsc --noEmit` no reporta errores. La clase implementa `IMaterialsRepository` completamente. `update()` siempre actualiza `actualizadaAt` aunque no venga en el payload.

---

## TASK-011: Implementar SqliteGlobalParamsRepository

**Status**: completed
**Requirements**: FR-003, FR-007, EC-004, NFR-002
**Complexity**: M
**Depends on**: TASK-003, TASK-007
**Files**: backend/src/repositories/sqlite-global-params.repository.ts

### Description
Crear `SqliteGlobalParamsRepository` que implementa `IGlobalParametersRepository`. Solo 2 métodos: `get()` lee la fila con `id = 1` y retorna un `ParametrosGlobales` completo (lanzar `Error` interno si la fila no existe — no debería ocurrir post-seed pero es un invariante); `update(data)` actualiza solo los campos presentes en `data`, siempre sobreescribe `actualizada_at`, y retorna el registro actualizado. EC-004: un campo con valor `0` se guarda normalmente — no hay validación de negocio en el repositorio.

### Validation
`tsc --noEmit` no reporta errores. La clase implementa `IGlobalParametersRepository`. `update({ tasaArsUsd: 0 })` no lanza error y guarda el valor.

---

## TASK-012: Crear data/.gitkeep y configurar DB_PATH en entorno

**Status**: completed
**Requirements**: FR-008, NFR-001
**Complexity**: S
**Depends on**: none
**Files**: data/.gitkeep, backend/.env.example, CLAUDE.md, .gitignore (si existe)

### Description
Crear el directorio `data/` con un archivo `.gitkeep` para que exista en git pero los archivos `.db` no se comitan. Agregar `data/*.db` al `.gitignore` raíz (crear si no existe). Agregar `DB_PATH=./data/cotizador.db` a `backend/.env.example`. Agregar `DB_PATH` a la sección "Variables de entorno" de `CLAUDE.md` con su descripción.

### Validation
`git status` muestra `data/.gitkeep` como archivo trackeado. `data/cotizador.db` aparece en `.gitignore` (verificar con `git check-ignore data/cotizador.db`). `backend/.env.example` contiene `DB_PATH`.

---

## TASK-013: Tests para initDatabase

**Status**: completed
**Requirements**: FR-008, FR-009, EC-001, EC-005, EC-006, NFR-003
**Complexity**: M
**Depends on**: TASK-001, TASK-002, TASK-008
**Files**: backend/tests/db/init.test.ts

### Description
Crear `backend/tests/db/init.test.ts` con vitest. Tests usando `:memory:` (a menos que se indique): (1) `initDatabase(':memory:')` crea las 3 tablas; (2) las tablas tienen las columnas correctas (pragma `table_info`); (3) seed inserta 4 máquinas, 33 materiales, y 1 fila en `parametros_globales`; (4) llamar `initDatabase` dos veces con el mismo path en disco (`/tmp/test-cotizador.db`) no duplica filas (EC-006); (5) EC-005: path en directorio sin permisos lanza Error con mensaje descriptivo. Limpiar archivos temporales en `afterEach`.

### Validation
`npm test` en `backend/` pasa todos los tests de este archivo. Cobertura de `init.ts` ≥ 80%.

---

## TASK-014: Tests para SqliteMachinesRepository

**Status**: completed
**Requirements**: FR-001, FR-005, FR-007, FR-009, EC-002, EC-003, NFR-003, NFR-004
**Complexity**: M
**Depends on**: TASK-001, TASK-002, TASK-008, TASK-009
**Files**: backend/tests/repositories/sqlite-machines.test.ts

### Description
Crear `backend/tests/repositories/sqlite-machines.test.ts`. En `beforeEach`: llamar `initDatabase(':memory:')` para obtener una DB fresca con schema + seed. Tests: (1) `getAll()` retorna 4 máquinas del seed; (2) `getAll()` incluye máquinas con `activa = false` (EC-003); (3) `getById(id)` retorna la máquina con ese id; (4) `getById('inexistente')` retorna `null` (EC-002); (5) `create(data)` inserta y retorna con id asignado; (6) `update(id, { activa: false })` actualiza solo ese campo; (7) `update('inexistente', ...)` retorna `null`; (8) `delete(id)` elimina la fila y `getById` retorna `null` después.

### Validation
`npm test` pasa todos los tests de este archivo. Cobertura de `sqlite-machines.repository.ts` ≥ 80%.

---

## TASK-015: Tests para SqliteMaterialsRepository

**Status**: completed
**Requirements**: FR-002, FR-004, FR-007, EC-002, NFR-003, NFR-004
**Complexity**: M
**Depends on**: TASK-001, TASK-002, TASK-008, TASK-010
**Files**: backend/tests/repositories/sqlite-materials.test.ts

### Description
Crear `backend/tests/repositories/sqlite-materials.test.ts`. Misma estructura que TASK-014. Tests específicos: (1) `getAll()` retorna 33 materiales del seed; (2) verificar que el primer material retornado tiene `precioPorCartucho750gEUR > 0` y `densidadGCm3 > 0`; (3) `getById` con id existente retorna material con todos los campos incluyendo `actualizadaAt`; (4) `getById('inexistente')` retorna `null`; (5) `create(data)` retorna con `creadaAt` y `actualizadaAt` poblados; (6) `update(id, { activo: false })` no modifica `creadaAt`; (7) `update(id, { precioPorCartucho750gEUR: 99.99 })` actualiza `actualizadaAt`; (8) `delete(id)` elimina la fila.

### Validation
`npm test` pasa todos los tests de este archivo. Cobertura de `sqlite-materials.repository.ts` ≥ 80%.

---

## TASK-016: Tests para SqliteGlobalParamsRepository

**Status**: completed
**Requirements**: FR-003, FR-006, FR-007, EC-004, NFR-003, NFR-004
**Complexity**: M
**Depends on**: TASK-001, TASK-002, TASK-008, TASK-011
**Files**: backend/tests/repositories/sqlite-global-params.test.ts

### Description
Crear `backend/tests/repositories/sqlite-global-params.test.ts`. Tests: (1) `get()` retorna los valores exactos del seed (`tasaEurUsd = 1.0549`, `tasaArsUsd = 0`, etc.); (2) `update({ tasaEurUsd: 1.10 })` retorna el objeto actualizado con el nuevo valor y `actualizadaAt` renovado; (3) `update({ tasaArsUsd: 0 })` guarda `0` sin error (EC-004); (4) `update()` con campo parcial no sobreescribe campos no incluidos; (5) `get()` después de `update()` refleja los cambios.

### Validation
`npm test` pasa todos los tests de este archivo. Cobertura de `sqlite-global-params.repository.ts` ≥ 80%.

---

## TASK-017: Actualizar app.ts con repos SQLite y adapter IPricesRepository

**Status**: completed
**Requirements**: FR-007, FR-008, NFR-001
**Complexity**: M
**Depends on**: TASK-008, TASK-009, TASK-010, TASK-011, TASK-012
**Files**: backend/src/app.ts

### Description
Modificar `backend/src/app.ts` para: (1) leer `DB_PATH` de `process.env.DB_PATH ?? './data/cotizador.db'`; (2) llamar `initDatabase(DB_PATH)` antes de registrar repositorios; (3) instanciar `SqliteMachinesRepository(db)`, `SqliteMaterialsRepository(db)`, `SqliteGlobalParamsRepository(db)`; (4) crear el adapter inline `pricesAdapter: IPricesRepository` con los tres métodos (`getMateriales`, `getMaterialById`, `getCostoInicio`) usando los nuevos repos, filtrando solo activos para `getMateriales()`; (5) pasar `pricesAdapter` a `QuoteService` como antes. El adapter tiene un comentario de una línea marcándolo como temporal hasta SPEC-C. `JsonPricesRepository` queda en disco pero deja de usarse en `app.ts`.

### Validation
El servidor arranca sin errores (`npm run dev` o equivalente en `backend/`). `tsc --noEmit` no reporta errores en `app.ts`. Al arrancar por primera vez con un path de DB nuevo, las 3 tablas se crean y el seed corre. Al reiniciar, el seed no vuelve a correr.
