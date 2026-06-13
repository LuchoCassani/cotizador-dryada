# Modelo de Datos SQLite — Specification

**Version:** 1.0
**Date:** 2026-06-13
**Status:** Draft
**PRD Reference:** None
**Constitution:** Confirmed compliant

---

## 1. Metadata

| Campo | Valor |
|---|---|
| Feature | sqlite-data-model |
| Autor | Lucho |
| Versión | 1.0 |
| Estado | Draft |
| Creado | 2026-06-13 |
| Última actualización | 2026-06-13 |

---

## 2. Context

El cotizador actualmente usa `prices.json` como fuente de datos de materiales (estática, solo editable modificando código) e `InMemoryQuoteRepository` para trazabilidad (volátil, se pierde al reiniciar). Esto bloquea dos necesidades reales: editar precios y costos sin intervención técnica, y mantener historial de cotizaciones persistente.

La introducción de 4 máquinas con costos distintos es el catalizador inmediato: no es viable modelar diferencias por máquina como constantes en código ni como entradas en un JSON. El modelo SQLite reemplaza ambas fuentes con una base relacional local — un único archivo `.db` en la carpeta compartida del servidor interno, sin infraestructura adicional.

Este spec cubre exclusivamente la capa de datos: schema SQLite, interfaces de repositorios TypeScript, y seed data inicial. Los servicios existentes (`QuoteService`) no cambian sus contratos — solo cambia la implementación concreta que se inyecta en `app.ts`.

---

## 3. Goals & Non-Goals

### Goals

1. Definir el schema SQLite completo para `maquinas`, `materiales` y `parametros_globales`, con tipos, constraints y valores por defecto verificables.
2. Definir las interfaces TypeScript `IMachinesRepository`, `IMaterialsRepository` e `IGlobalParametersRepository` que consume la capa de servicios.
3. Proveer seed data inicial derivado del `prices.json` actual y los valores del Excel de Denise.
4. Garantizar que el archivo `.db` es portable: se puede copiar entre máquinas sin pérdida ni reconfiguración.

### Non-Goals

1. Implementar la UI de gestión de costos — Why: es SPEC-E, depende de este spec.
2. Migrar `IQuoteRepository` a SQLite — Why: es SPEC-B, que depende de este spec.
3. Definir la fórmula de cotización con parámetros por máquina — Why: es SPEC-C.
4. Autenticación en rutas de administración — Why: fuera del scope del modelo de datos.

---

## 4. User Stories

### Actor: Sistema (backend al arrancar)

**Story:** Al iniciar el servidor, el backend verifica que el archivo `.db` existe y las tablas están creadas. Si no existen, las crea y carga el seed data.

**Acceptance criteria:**
- Given que no existe el archivo `.db`, when el servidor arranca, then se crea el archivo, las 3 tablas y se inserta el seed data.
- Given que el archivo `.db` ya existe con datos, when el servidor arranca, then no se sobreescriben los datos existentes.
- Given que el directorio del `.db` no tiene permisos de escritura, when el servidor arranca, then termina con mensaje claro en stderr antes de levantar las rutas.

### Actor: QuoteService (lógica de negocio)

**Story:** Al calcular una cotización, el servicio obtiene material, máquina y parámetros globales vía sus repositorios, sin saber que el almacenamiento es SQLite.

**Acceptance criteria:**
- Given un `materialId` válido, when `IMaterialsRepository.getById(id)` es llamado, then retorna el material con `precioPorCartucho750gEUR` y `densidadGCm3`.
- Given un `maquinaId` inválido, when `IMachinesRepository.getById(id)` es llamado, then retorna `null`.
- Given que existen parámetros globales, when `IGlobalParametersRepository.get()` es llamado, then retorna un objeto tipado con todos los campos sin valores `undefined`.

---

## 5. Functional Requirements

- **FR-001:** La tabla `maquinas` almacena nombre, capacidad volumétrica (x, y, z en mm), costo de compra en USD, meses de amortización, y flag de activa/inactiva.
- **FR-002:** La tabla `materiales` almacena nombre, precio por cartucho de 750g en EUR, densidad en g/cm³, y flag de activo/inactivo. El precio en USD/gramo se deriva en tiempo de cálculo usando `tasaEurUsd` de `parametros_globales`.
- **FR-003:** La tabla `parametros_globales` tiene exactamente una fila, con columnas tipadas para cada parámetro de cálculo global.
- **FR-004:** El seed data de `materiales` proviene del Excel de Denise (Lista de Precios), expresado en EUR/cartucho 750g con densidades por material.
- **FR-005:** El seed data de `maquinas` incluye las 4 máquinas (3 con capacidad 300×300×300mm, 1 con 300×300×600mm), todas activas desde el arranque.
- **FR-006:** El seed data de `parametros_globales` refleja los valores actuales del Excel: `tasaEurUsd=1.0549`, `tarifaManoObraUsdHora=6.82`, `horasPorPieza=0.20`, `desperdicioPct=0.10`, `costosAdicionalesUsd=0.50`, `coeficienteGanancia=2.0`.
- **FR-007:** Todas las interfaces de repositorio exponen métodos async (`Promise<T>`), aunque `better-sqlite3` sea síncrono internamente.
- **FR-008:** La inicialización del `.db` (CREATE TABLE IF NOT EXISTS + seed) ocurre en `backend/src/db/init.ts`, invocado desde `app.ts` antes de registrar repositorios.
- **FR-009:** El seed data corre **solo una vez**, en el primer arranque cuando las tablas están vacías (`SELECT COUNT(*) = 0`). En arranques posteriores se omite completamente. La UI es la fuente de verdad después del primer arranque.

---

## 6. Non-Functional Requirements

- **NFR-001:** El archivo `.db` debe funcionar al copiarlo a otra máquina sin configuración adicional (zero-dependency portability).
- **NFR-002:** Cualquier lectura de repositorio (`getById`, `getAll`, `get`) completa en < 5ms en hardware de servidor convencional.
- **NFR-003:** Los tests de repositorios usan SQLite en memoria (`:memory:`) para aislamiento total; nunca el `.db` de producción.
- **NFR-004:** Cobertura de tests ≥ 80% en las implementaciones `Sqlite*Repository` (per constitution.md).

---

## 7. Technical Design

### Stack

| Tecnología | Razón |
|---|---|
| `better-sqlite3` | Driver SQLite síncrono para Node.js. 2-3× más rápido que `sqlite3` async, sin callback hell, y wrappear sync en `Promise.resolve()` es trivial |
| TypeScript estricto | Sin `any`. Interfaces tipadas garantizan que el compilador detecta campos faltantes |

### Architecture

```
backend/src/
├── db/
│   ├── database.ts               ← singleton de la conexión Database
│   ├── init.ts                   ← CREATE TABLE IF NOT EXISTS + seed
│   └── seed/
│       ├── maquinas.seed.ts
│       ├── materiales.seed.ts
│       └── parametros.seed.ts
└── repositories/
    ├── machines.repository.ts         ← interface IMachinesRepository
    ├── sqlite-machines.repository.ts  ← implementación
    ├── materials.repository.ts        ← interface IMaterialsRepository
    ├── sqlite-materials.repository.ts
    ├── global-params.repository.ts    ← interface IGlobalParametersRepository
    └── sqlite-global-params.repository.ts
```

### Decisions & Rationale

**Decision:** `better-sqlite3` (síncrono) sobre `sqlite3` (async).
**Context:** Las interfaces deben ser async para coherencia con el sistema, pero SQLite embebido no tiene latencia de red.
**Rationale:** `better-sqlite3` elimina el overhead de async/await real, es significativamente más rápido en benchmarks, y el wrapper `return Promise.resolve(stmt.get(...))` es una deuda mínima.
**Consequences:** Si en el futuro se migra a PostgreSQL, el swap es solo en las implementaciones concretas. Las interfaces y los servicios no cambian.

**Decision:** `parametros_globales` como tabla de una sola fila con columnas tipadas.
**Context:** Los parámetros son un conjunto fijo y conocido de valores numéricos.
**Rationale:** Columnas tipadas dan safety en TypeScript: el compilador detecta si falta un parámetro. Una tabla clave-valor pierde ese contrato. Los parámetros del cotizador no crecen arbitrariamente.
**Consequences:** Agregar un nuevo parámetro requiere una migración de schema (ALTER TABLE). Aceptable para este volumen de cambios.

**Decision:** Precios de materiales almacenados en EUR/cartucho 750g.
**Context:** Denise trabaja con precios de lista del proveedor en euros. Almacenar en USD/gramo requeriría conversión manual cada vez que actualiza un precio.
**Rationale:** Fidelidad al flujo de trabajo real de Denise. La conversión a USD/gramo ocurre una sola vez en el servicio de cotización.
**Consequences:** `QuoteService` necesita `tasaEurUsd` de `IGlobalParametersRepository` para calcular el precio por gramo. Esto es un input adicional al cálculo, documentado en SPEC-C.

---

## 8. Data Models

### Schema SQL

```sql
CREATE TABLE IF NOT EXISTS maquinas (
  id                  TEXT    PRIMARY KEY,
  nombre              TEXT    NOT NULL,
  capacidad_x_mm      REAL    NOT NULL,
  capacidad_y_mm      REAL    NOT NULL,
  capacidad_z_mm      REAL    NOT NULL,
  costo_usd           REAL    NOT NULL,
  meses_amortizacion  INTEGER NOT NULL,
  activa              INTEGER NOT NULL DEFAULT 1,  -- 0 | 1
  creada_at           TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS materiales (
  id                    TEXT  PRIMARY KEY,
  nombre                TEXT  NOT NULL,
  precio_cartucho_eur   REAL  NOT NULL,  -- EUR por cartucho de 750g
  densidad_g_cm3        REAL  NOT NULL,
  activo                INTEGER NOT NULL DEFAULT 1,  -- 0 | 1
  creada_at             TEXT  NOT NULL,
  actualizada_at        TEXT  NOT NULL
);

CREATE TABLE IF NOT EXISTS parametros_globales (
  id                          INTEGER PRIMARY KEY DEFAULT 1
                                CHECK (id = 1),   -- garantiza una sola fila
  tasa_eur_usd                REAL    NOT NULL,
  tasa_ars_usd                REAL    NOT NULL,
  tarifa_mano_obra_usd_hora   REAL    NOT NULL,
  horas_por_pieza             REAL    NOT NULL,
  desperdicio_pct             REAL    NOT NULL,
  costos_adicionales_usd      REAL    NOT NULL,
  coeficiente_ganancia        REAL    NOT NULL,
  actualizada_at              TEXT    NOT NULL
);
```

### Entity: Maquina

| Campo | Tipo SQLite | Requerido | Descripción |
|---|---|---|---|
| id | TEXT (UUID) | sí | PK |
| nombre | TEXT | sí | Ej: "Bambu Lab X1C #1" |
| capacidad_x_mm | REAL | sí | Capacidad eje X en mm |
| capacidad_y_mm | REAL | sí | Capacidad eje Y en mm |
| capacidad_z_mm | REAL | sí | Capacidad eje Z en mm |
| costo_usd | REAL | sí | Costo de compra en USD |
| meses_amortizacion | INTEGER | sí | Período de amortización |
| activa | INTEGER | sí | 0 = inactiva, 1 = activa |
| creada_at | TEXT | sí | ISO 8601 |

**Seed data:**

| nombre | x | y | z | costo_usd | meses_amort | activa |
|---|---|---|---|---|---|---|
| Máquina 1 | 300 | 300 | 300 | 7000 | 30 | 1 |
| Máquina 2 | 300 | 300 | 300 | 7000 | 30 | 1 |
| Máquina 3 | 300 | 300 | 300 | 7000 | 30 | 1 |
| Máquina 4 | 300 | 300 | 600 | 7000 | 30 | 1 |

### Entity: Material

| Campo | Tipo SQLite | Requerido | Descripción |
|---|---|---|---|
| id | TEXT (UUID) | sí | PK |
| nombre | TEXT | sí | Nombre del filamento |
| precio_cartucho_eur | REAL | sí | EUR por cartucho de 750g |
| densidad_g_cm3 | REAL | sí | Densidad en g/cm³ |
| activo | INTEGER | sí | 0 = inactivo, 1 = activo |
| creada_at | TEXT | sí | ISO 8601 |
| actualizada_at | TEXT | sí | ISO 8601 |

**Seed data completo (Lista de Precios Excel v14):**

| nombre | precio_cartucho_eur | densidad_g_cm3 | activo |
|---|---|---|---|
| Grillon PLA/ABS | 10.20 | 1.24 | 1 |
| Grillon PETG | 9.00 | 1.27 | 1 |
| ABS (Smartfil) | 31.20 | 1.04 | 1 |
| Antibacteriano (Smartfil) | 66.00 | 1.24 * | 1 |
| ASA (Smartfil) | 49.32 | 1.07 | 1 |
| Boun (Smartfil) | 45.99 | 1.20 * | 1 |
| Clean (Smartfil) | 25.26 | 1.23 * | 1 |
| E.P. (Smartfil) | 37.62 | 1.27 * | 1 |
| FireProof (Smartfil) | 50.79 | 1.08 * | 1 |
| Flexible (Smartfil) | 49.20 | 1.21 | 1 |
| Glace (Smartfil) | 72.72 | 1.24 * | 1 |
| HIPS (Smartfil) | 31.11 | 1.03 | 1 |
| INOVATEFIL COPOLIESTER T+ | 54.84 | 1.27 * | 1 |
| INOVATEFIL HYDROSOLUBLE | 137.31 | 1.23 * | 1 |
| INOVATEFIL PA FC | 98.25 | 1.14 * | 1 |
| INOVATEFIL PA HT | 116.61 | 1.10 * | 1 |
| INOVATEFIL PEEK | 343.14 | 1.31 * | 1 |
| INOVATEFIL PEI ULTEM | 186.90 | 1.27 * | 1 |
| INOVATEFIL PET FC | 91.71 | 1.35 * | 1 |
| INOVATEFIL POLICARBONATO | 74.61 | 1.20 * | 1 |
| INOVATEFIL TPU FC | 73.86 | 1.25 * | 1 |
| Medical (Smartfil) | 68.76 | 1.24 * | 1 |
| Nylstrong (Smartfil) | 70.68 | 1.08 * | 1 |
| P.P. (Smartfil) | 65.76 | 0.91 | 1 |
| PETG (Smartfil) | 47.22 | 1.27 | 1 |
| PETG MDT (Smartfil) | 86.28 | 1.27 * | 1 |
| PLA (Smartfil) | 35.13 | 1.24 | 1 |
| PLA 3D850 (Smartfil) | 48.69 | 1.24 * | 1 |
| PLA 3D870 (Smartfil) | 60.90 | 1.24 * | 1 |
| PLA RECYCLED (Smartfil) | 23.31 | 1.24 | 1 |
| PVA (Smartfil) | 88.95 | 1.23 | 1 |
| Support (Smartfil) | 39.03 | 1.20 * | 1 |
| WOOD (Smartfil) | 54.06 | 1.15 | 1 |

> `*` densidad estimada con valores estándar de la industria — verificar con ficha técnica del proveedor (ver OQ-002).

### Entity: ParametrosGlobales

| Campo | Tipo SQLite | Valor inicial | Descripción |
|---|---|---|---|
| id | INTEGER | 1 (fijo) | PK, siempre 1 |
| tasa_eur_usd | REAL | 1.0549 | Tipo de cambio EUR → USD |
| tasa_ars_usd | REAL | 0 ← placeholder, Denise debe configurarlo antes del primer uso | Tipo de cambio USD → ARS para mostrar precio en pesos |
| tarifa_mano_obra_usd_hora | REAL | 6.82 | Mano de obra en USD/hora |
| horas_por_pieza | REAL | 0.20 | Horas estimadas por pieza |
| desperdicio_pct | REAL | 0.10 | Factor desperdicio (0.10 = 10%) |
| costos_adicionales_usd | REAL | 0.50 | Costos fijos por pieza en USD |
| coeficiente_ganancia | REAL | 2.0 | Multiplicador de precio final |
| actualizada_at | TEXT | — | ISO 8601 de última edición |

### Interfaces TypeScript

```typescript
// repositories/machines.repository.ts
export interface Maquina {
  id: string;
  nombre: string;
  capacidadXmm: number;
  capacidadYmm: number;
  capacidadZmm: number;
  costoUsd: number;
  mesesAmortizacion: number;
  activa: boolean;
  creadaAt: string;
}

export interface IMachinesRepository {
  getAll(): Promise<Maquina[]>;
  getById(id: string): Promise<Maquina | null>;
  create(data: Omit<Maquina, 'id' | 'creadaAt'>): Promise<Maquina>;
  update(id: string, data: Partial<Omit<Maquina, 'id' | 'creadaAt'>>): Promise<Maquina | null>;
  delete(id: string): Promise<void>;   // hard delete desde la UI — la UI es fuente de verdad
}
```

```typescript
// repositories/materials.repository.ts
export interface Material {
  id: string;
  nombre: string;
  precioPorCartucho750gEUR: number;
  densidadGCm3: number;
  activo: boolean;
  creadaAt: string;
  actualizadaAt: string;
}

export interface IMaterialsRepository {
  getAll(): Promise<Material[]>;
  getById(id: string): Promise<Material | null>;
  create(data: Omit<Material, 'id' | 'creadaAt' | 'actualizadaAt'>): Promise<Material>;
  update(id: string, data: Partial<Omit<Material, 'id' | 'creadaAt'>>): Promise<Material | null>;
  delete(id: string): Promise<void>;   // hard delete desde la UI — la UI es fuente de verdad
}
```

```typescript
// repositories/global-params.repository.ts
export interface ParametrosGlobales {
  tasaEurUsd: number;
  tasaArsUsd: number;
  tarifaManoObraUsdHora: number;
  horasPorPieza: number;
  desperdicioPct: number;
  costosAdicionalesUsd: number;
  coeficienteGanancia: number;
  actualizadaAt: string;
}

export interface IGlobalParametersRepository {
  get(): Promise<ParametrosGlobales>;
  update(data: Partial<Omit<ParametrosGlobales, 'actualizadaAt'>>): Promise<ParametrosGlobales>;
}
```

### Relationships

- `cotizaciones` (SPEC-B) tendrá FK a `maquinas.id` y `materiales.id`.
- `parametros_globales` no tiene FK entrantes: sus valores se copian como snapshot en cada cotización al momento de calcular (igual que en el diseño actual de `QuoteRecord`).

---

## 9. API Contracts

Este spec define contratos de repositorio (datos → servicios), no endpoints HTTP. Los endpoints de administración se definen en SPEC-E.

El único contrato de inicialización es:

**`initDatabase(dbPath: string): Database`**

- Crea el archivo `.db` si no existe.
- Ejecuta `CREATE TABLE IF NOT EXISTS` para las 3 tablas.
- Si las tablas están vacías, inserta el seed data con `INSERT OR IGNORE`.
- Retorna la instancia `Database` de `better-sqlite3` para inyectar en los repositorios.
- Lanza `Error` con mensaje descriptivo si el path no es escribible (el proceso debe terminar antes de levantar rutas).

---

## 10. Edge Cases & Error Handling

| ID | Escenario | Comportamiento esperado |
|---|---|---|
| EC-001 | El archivo `.db` existe pero está corrupto | `better-sqlite3` lanza en el constructor. Proceso termina con mensaje en stderr: "No se pudo abrir la base de datos en [path]." |
| EC-002 | `getById` con id inexistente | Retorna `null`. El servicio decide si lanzar error de negocio. |
| EC-003 | `getMachinesRepository.getAll()` cuando todas las máquinas están inactivas | Retorna las 4 máquinas con `activa=false`. El servicio o la ruta filtra según contexto (cotización vs. admin). |
| EC-004 | `update` de `parametros_globales` con un campo en `0` | Se guarda. Validación de negocio (ej: `coeficienteGanancia !== 0`) es responsabilidad del servicio, no del repositorio. |
| EC-005 | Sin permisos de escritura en el directorio del `.db` | `initDatabase` lanza antes de que el servidor levante. Mensaje: "Sin permisos de escritura en [directorio]." |
| EC-006 | Servidor reiniciado con seed data ya existente | `INSERT OR IGNORE` en base al `id` como constraint. No duplica filas. |

---

## 11. Open Questions

- [x] **OQ-001** — ✅ RESUELTO: todas las máquinas tienen `costo_usd = 7000`, `meses_amortizacion = 30` (mismo valor que el Excel v14).
- [ ] **OQ-002** — Verificar densidades marcadas con `*` en el seed data de materiales contra fichas técnicas de Smartfil e Inovatefil. Confirmar si "INOVATEFIL PA FC (Premium)" es un producto activo o retirado. — Owner: Denise — By: antes del lanzamiento
- [x] **OQ-003** — ✅ RESUELTO: tipos de cambio se actualizan manualmente por Denise desde la UI de gestión de costos (SPEC-E).

## Clarifications

<!-- Added by /sdd:clarify. Do not edit manually. -->

### C-1: Tipo de cambio ARS/USD en seed data
**Type:** assumption
**Q:** ¿Qué tipo de cambio USD/ARS usás para mostrar el precio final en pesos al cliente?
**A:** No hay un valor fijo — es un placeholder que Denise configura desde la UI. No debe haber ningún valor por defecto con significado de negocio. Seed data: `tasa_ars_usd = 0` obliga a configurarlo antes del primer uso.
**Pattern tip:** Cuando un parámetro numérico depende de decisiones externas al sistema (tipo de cambio, precios de mercado), usar `0` o `null` en el seed data en lugar de asumir un valor. Un `0` visible fuerza la configuración; un valor asumido puede pasar desapercibido y generar errores silenciosos.

### C-4: Seed data y reinicios del servidor
**Type:** edge case
**Q:** Si Denise elimina un material desde la UI y el servidor se reinicia, ¿el material vuelve?
**A:** No. El seed corre una sola vez, solo cuando las tablas están completamente vacías (primer arranque). La UI es la fuente de verdad después del primer arranque. Las interfaces incluyen `delete(id)` para hard delete real. Se elimina `deactivate()` de los repositorios — la desactivación se hace vía `update({ activa: false })`.
**Pattern tip:** En sistemas donde la UI gestiona datos operativos, el seed data es un estado inicial, no un estado persistente. La señal "¿ya corrió el seed?" debe guardarse en la DB misma (en este caso: `COUNT(*) > 0` en la tabla), no en memoria ni en archivos externos.

### C-3: Path del archivo .db
**Type:** structural gap
**Q:** ¿Cómo se configura el path del archivo `.db`?
**A:** Variable de entorno `DB_PATH`. Default: `./data/cotizador.db` si no está seteada. El directorio se crea automáticamente si no existe. Agregar `DB_PATH` a las variables de entorno documentadas en `CLAUDE.md` y al `.env.example`.
**Pattern tip:** Los paths de archivos de datos nunca deben hardcodearse. Un `.env` con `DB_PATH=./data/cotizador.db` como default documentado es suficiente para una herramienta interna — no hace falta más complejidad.

### C-2: Comportamiento de getAll() en repositorios
**Type:** ambiguity
**Q:** ¿`getAll()` retorna solo registros activos o todos con el flag incluido?
**A:** Retorna todos los registros con el flag `activa/activo` incluido. El filtrado por activo/inactivo lo hace la capa de servicio o la ruta según el contexto (cotización muestra solo activos; panel admin muestra todos). EC-003 actualizado en consecuencia.
**Pattern tip:** En las interfaces de repositorio, es más útil que los métodos de lectura sean agnósticos al estado (retornan todo) y que el filtrado semántico viva en la capa de servicio. Así el mismo repositorio sirve tanto al flujo de cotización como al panel de admin sin necesidad de métodos duplicados como `getAllActive()`.
