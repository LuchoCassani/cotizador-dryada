# Plan: Modelo de Datos SQLite

## Architecture

El feature introduce una capa de datos SQLite debajo de las interfaces existentes. El cambio es transparente para `QuoteService`: sigue recibiendo un `IPricesRepository` por inyección, pero ahora ese repositorio lee de SQLite en lugar de `prices.json`.

### Flujo de datos al arrancar el servidor

```
app.ts
  → initDatabase(DB_PATH)          // crea .db si no existe, crea tablas
  → IF tablas vacías: seed data    // solo en el primer arranque
  → return Database instance
  → new SqliteMaterialsRepository(db)
  → new SqliteMachinesRepository(db)
  → new SqliteGlobalParamsRepository(db)
  → adapter IPricesRepository      // shim inline en app.ts para QuoteService
  → new QuoteService(pricesAdapter, quoteRepo)   // QuoteService no cambia
```

### Adapter de compatibilidad en app.ts

`QuoteService` usa `IPricesRepository` (interfaz existente con `getMateriales()`, `getMaterialById()`, `getCostoInicio()`). Para no modificar `QuoteService` en este spec, `app.ts` crea un adapter inline:

```typescript
const pricesAdapter: IPricesRepository = {
  getMateriales: () => materialsRepo.getAll().then(ms => ms.filter(m => m.activo)),
  getMaterialById: (id) => materialsRepo.getById(id),
  getCostoInicio: () => globalParamsRepo.get().then(p => p.costosAdicionalesUsd),
};
```

Este adapter es temporal. SPEC-C (fórmula) actualizará `QuoteService` para consumir `IMaterialsRepository`, `IMachinesRepository` e `IGlobalParametersRepository` directamente y el adapter desaparece.

### Estructura de la capa de datos

```
backend/src/
├── db/
│   ├── database.ts               ← singleton Database (better-sqlite3)
│   ├── init.ts                   ← initDatabase(): CREATE TABLE + seed condicional
│   └── seed/
│       ├── maquinas.seed.ts      ← array con las 4 máquinas
│       ├── materiales.seed.ts    ← array con los 33 materiales
│       └── parametros.seed.ts    ← objeto con valores iniciales de parametros_globales
└── repositories/
    ├── machines.repository.ts         ← IMachinesRepository
    ├── sqlite-machines.repository.ts  ← SqliteMachinesRepository
    ├── materials.repository.ts        ← IMaterialsRepository
    ├── sqlite-materials.repository.ts ← SqliteMaterialsRepository
    ├── global-params.repository.ts    ← IGlobalParametersRepository
    └── sqlite-global-params.repository.ts
```

## Dependencies

| Paquete | Tipo | Razón |
|---|---|---|
| `better-sqlite3` | dependency | Driver SQLite síncrono |
| `@types/better-sqlite3` | devDependency | Tipos TypeScript |
| `vitest` | devDependency | Framework de tests (constitution) |
| `uuid` | dependency | Ya instalado — generación de IDs |

Agregar a `backend/package.json`. Agregar script `"test": "vitest"`.
Crear `backend/vitest.config.ts` con `root: 'src'` y `environment: 'node'`.

## Files Affected

### Nuevos archivos
```
backend/src/db/database.ts                                    [create]
backend/src/db/init.ts                                        [create]
backend/src/db/seed/maquinas.seed.ts                          [create]
backend/src/db/seed/materiales.seed.ts                        [create]
backend/src/db/seed/parametros.seed.ts                        [create]
backend/src/repositories/machines.repository.ts               [create]
backend/src/repositories/sqlite-machines.repository.ts        [create]
backend/src/repositories/materials.repository.ts              [create]
backend/src/repositories/sqlite-materials.repository.ts       [create]
backend/src/repositories/global-params.repository.ts          [create]
backend/src/repositories/sqlite-global-params.repository.ts   [create]
backend/vitest.config.ts                                      [create]
backend/tests/db/init.test.ts                                 [create]
backend/tests/repositories/sqlite-machines.test.ts            [create]
backend/tests/repositories/sqlite-materials.test.ts           [create]
backend/tests/repositories/sqlite-global-params.test.ts       [create]
data/.gitkeep                                                 [create]
```

### Archivos modificados
```
backend/src/app.ts          [modify] — inyectar repos SQLite + adapter IPricesRepository
backend/package.json        [modify] — agregar better-sqlite3, @types/better-sqlite3, vitest
backend/.env.example        [modify/create] — agregar DB_PATH=./data/cotizador.db
CLAUDE.md                   [modify] — agregar DB_PATH a Variables de entorno
```

### Archivos que NO se tocan en este spec
```
backend/src/repositories/prices.repository.ts        ← interfaz IPricesRepository intacta
backend/src/repositories/json-prices.repository.ts   ← reemplazada en app.ts, no eliminada
backend/src/repositories/in-memory-quote.repository  ← intacta hasta SPEC-B
backend/src/services/quote.service.ts                ← sin cambios
```

> `json-prices.repository.ts` queda en el repo pero deja de usarse en `app.ts`. Se elimina en SPEC-B para mantener el codebase limpio.

## Risks and Trade-offs

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| `better-sqlite3` falla en `npm install` por falta de herramientas de compilación | Baja (entornos modernos tienen node-gyp) | Documentar requisito en CLAUDE.md. Si falla: `npm install --build-from-source` |
| El adapter `IPricesRepository` inline en `app.ts` oculta la transición a los nuevos contratos | Media | El adapter tiene un comentario claro marcándolo como temporal hasta SPEC-C |
| Tests en `:memory:` no detectan problemas de path del `.db` en producción | Baja | `init.test.ts` tiene un test adicional con path en `/tmp` |
| 33 materiales en seed → archivo `materiales.seed.ts` extenso | Ninguna | Es solo datos, no lógica. Legibilidad no es un riesgo. |

## Decision

Ver `docs/adr/001-sqlite-better-sqlite3-data-layer.md`
