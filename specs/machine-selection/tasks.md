# Tasks: Machine Selection

**Feature**: machine-selection
**Plan**: specs/machine-selection/plan.md
**Generated**: 2026-06-13

---

## TASK-001: Definir IMachinesRepository, Maquina y MaquinaPublica

**Status**: completed
**Requirements**: FR-001, FR-004
**Complexity**: S
**Depends on**: none
**Files**: `backend/src/repositories/machines.repository.ts`

### Description
Agregar al archivo existente la interfaz `IMachinesRepository` con dos métodos: `getById(id: string): Promise<Maquina | null>` y `getActivas(): Promise<MaquinaPublica[]>`. Definir también los tipos `Maquina` (campos completos incluyendo `costoUsd` y `mesesAmortizacion`) y `MaquinaPublica` (solo campos públicos: `id`, `nombre`, `capacidadXmm`, `capacidadYmm`, `capacidadZmm`). `getById` devuelve `null` si no existe o `activa = false`.

### Validation
`tsc --noEmit` en backend sin errores. El archivo exporta `IMachinesRepository`, `Maquina` y `MaquinaPublica`.

---

## TASK-002: Agregar piezasPorDiaEstimadas a ParametrosGlobales

**Status**: completed
**Requirements**: FR-005, NFR-001
**Complexity**: S
**Depends on**: none
**Files**: `backend/src/repositories/global-params.repository.ts`

### Description
Agregar el campo `piezasPorDiaEstimadas: number` a la interfaz `ParametrosGlobales`. Es un número entero positivo que representa la producción diaria estimada para distribuir la amortización; valor de referencia: 20 (coincide con el Excel).

### Validation
`tsc --noEmit` en backend sin errores. La interfaz `ParametrosGlobales` incluye `piezasPorDiaEstimadas: number`.

---

## TASK-003: Agregar maquinaId a QuoteRecord

**Status**: completed
**Requirements**: FR-008
**Complexity**: S
**Depends on**: none
**Files**: `backend/src/repositories/quote.repository.ts`

### Description
Agregar el campo `maquinaId: string` a la interfaz `QuoteRecord`. Este campo se persiste en la columna `maquina_id` de la tabla `cotizaciones`.

### Validation
`tsc --noEmit` en backend sin errores. La interfaz `QuoteRecord` incluye `maquinaId: string`.

---

## TASK-004: Actualizar tipos frontend (Maquina, CotizacionResult)

**Status**: completed
**Requirements**: FR-007, FR-009
**Complexity**: S
**Depends on**: none
**Files**: `frontend/src/types/index.ts`

### Description
Agregar la interfaz `Maquina { id: string; nombre: string; capacidadXmm: number; capacidadYmm: number; capacidadZmm: number }`. Agregar `costoAmortizacionUSD: number` y `maquina: { id: string; nombre: string }` a `CotizacionResult`. No modificar otros campos existentes.

### Validation
`tsc -b` en frontend sin errores. El tipo `CotizacionResult` incluye `costoAmortizacionUSD` y `maquina`.

---

## TASK-005: Implementar getActivas() en SqliteMachinesRepository

**Status**: completed
**Requirements**: FR-001, EC-003
**Complexity**: S
**Depends on**: TASK-001
**Files**: `backend/src/repositories/sqlite-machines.repository.ts`

### Description
Agregar el método `getActivas()` que ejecuta `SELECT id, nombre, capacidad_x_mm, capacidad_y_mm, capacidad_z_mm FROM maquinas WHERE activa = 1` y devuelve `MaquinaPublica[]`. No expone `costo_usd` ni `meses_amortizacion`. Si no hay máquinas activas devuelve `[]`. Verificar que `getById()` retorne `null` si `activa = 0`.

### Validation
`tsc --noEmit` sin errores. `npm test -- --run` pasa todos los tests existentes.

---

## TASK-006: Actualizar SqliteGlobalParamsRepository para piezasPorDiaEstimadas

**Status**: completed
**Requirements**: FR-005, NFR-001
**Complexity**: S
**Depends on**: TASK-002
**Files**: `backend/src/repositories/sqlite-global-params.repository.ts`

### Description
Actualizar el método `get()` para leer la columna `piezas_por_dia_estimadas` y mapearla a `piezasPorDiaEstimadas` en el objeto retornado. Actualizar `update()` para escribir el campo si se pasa. Seguir el mismo patrón de mapeo que los campos existentes.

### Validation
`tsc --noEmit` sin errores. `npm test -- --run` pasa todos los tests existentes.

---

## TASK-007: Actualizar SqliteQuoteRepository para maquina_id

**Status**: completed
**Requirements**: FR-008
**Complexity**: S
**Depends on**: TASK-003
**Files**: `backend/src/repositories/sqlite-quote.repository.ts`

### Description
Actualizar el método `save()` para incluir `maquina_id` en el INSERT. Actualizar `findById()` y `findByEmpleado()` para mapear `maquina_id` → `maquinaId` en los resultados. Seguir el mismo patrón snake_case → camelCase que los demás campos.

### Validation
`tsc --noEmit` sin errores. `npm test -- --run` pasa todos los tests existentes.

---

## TASK-008: Migrations DB y seed de piezasPorDiaEstimadas

**Status**: completed
**Requirements**: FR-008, NFR-005
**Complexity**: S
**Depends on**: TASK-002, TASK-003
**Files**: `backend/src/db/init.ts`, `backend/src/db/seed/parametros.seed.ts`

### Description
En `init.ts`, agregar dos migraciones aditivas al final del bloque de init, usando `IF NOT EXISTS` / `TRY` para no romper DBs existentes:
1. `ALTER TABLE parametros_globales ADD COLUMN piezas_por_dia_estimadas INTEGER NOT NULL DEFAULT 20` (si la columna no existe).
2. `ALTER TABLE cotizaciones ADD COLUMN maquina_id TEXT NOT NULL DEFAULT ''` (si la columna no existe).

En `parametros.seed.ts`, agregar `piezasPorDiaEstimadas: 20` al objeto seed.

En SQLite, `ADD COLUMN NOT NULL` sin DEFAULT falla — usar DEFAULT explícito. Para `piezas_por_dia_estimadas` el DEFAULT 20 es correcto. Para `maquina_id` el DEFAULT `''` es un placeholder para rows históricas (documentado en spec).

### Validation
`tsc --noEmit` sin errores. Al borrar el `.db` y reiniciar el backend, `parametros_globales` tiene la columna `piezas_por_dia_estimadas` y `cotizaciones` tiene `maquina_id`.

---

## TASK-009: Actualizar QuoteService y makeRepos en tests existentes

**Status**: completed
**Requirements**: FR-003, FR-004, FR-005, FR-006, FR-007, NFR-004, EC-001, EC-002, EC-004
**Complexity**: M
**Depends on**: TASK-001, TASK-002, TASK-003
**Files**: `backend/src/services/quote.service.ts`, `backend/tests/services/quote.service.test.ts`

### Description
En `quote.service.ts`:
1. Agregar `machinesRepo: IMachinesRepository` como 3er parámetro del constructor (antes de `quoteRepo`).
2. En `calcularCotizacion()`, expandir el `Promise.all` para incluir `machinesRepo.getById(input.maquinaId)` junto a `getMaterialById` y `paramsRepo.get()`.
3. Agregar guard: si `params.piezasPorDiaEstimadas <= 0` → `throw new Error("piezasPorDiaEstimadas debe ser mayor que 0.")` (EC-004).
4. Agregar guard: si `machine === null` → `throw new Error("Máquina '${input.maquinaId}' no encontrada.")` (EC-001/002).
5. Calcular `costoAmortizacionUSD = (machine.costoUsd / machine.mesesAmortizacion / 30 / params.piezasPorDiaEstimadas) * (gramosTotal / GRAMOS_REFERENCIA)` donde `GRAMOS_REFERENCIA = 10` es constante de módulo.
6. Actualizar `costoBase` para incluir `costoAmortizacionUSD`.
7. Actualizar el objeto retornado y `QuoteRecord` para incluir `costoAmortizacionUSD`, `maquina: { id, nombre }`, y `maquinaId`.

En `quote.service.test.ts`:
- Agregar `machinesRepo: IMachinesRepository` al mock en `makeRepos()`, con `getById` devolviendo una máquina de prueba válida (`costoUsd: 7000`, `mesesAmortizacion: 30`, `activa: true`) y `getActivas` como `vi.fn()`.

### Validation
`tsc --noEmit` sin errores. `npm test -- --run` pasa todos los tests existentes (47). El test `precioUnitarioUSD = costoBase * (1 + coeficiente)` sigue pasando con el nuevo `costoBase` que incluye `costoAmortizacionUSD`.

---

## TASK-010: Crear machines.route.ts y actualizar app.ts

**Status**: completed
**Requirements**: FR-001, FR-003, FR-004, NFR-003, EC-005
**Complexity**: M
**Depends on**: TASK-001, TASK-005, TASK-008, TASK-009
**Files**: `backend/src/routes/machines.route.ts`, `backend/src/app.ts`

### Description
Crear `machines.route.ts`: handler para `GET /api/machines` que llama `machinesRepo.getActivas()` y devuelve el array. Incluir JSON Schema de respuesta (`type: 'array'` con items definidos). Seguir el patrón de `materials.route.ts`.

En `app.ts`:
1. Instanciar `SqliteMachinesRepository` (ya existe, solo agregar si no está).
2. Inyectar como 3er argumento en `new QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo)`.
3. Registrar el route de máquinas con `fastify.register(machinesRoute, { machinesRepo })`.
4. Actualizar el JSON Schema de `POST /api/quote` para incluir `maquinaId: { type: 'string' }` como campo requerido (`additionalProperties: false` debe seguir presente).

### Validation
`tsc --noEmit` sin errores. `GET /api/machines` responde 200 con array de máquinas. `POST /api/quote` sin `maquinaId` devuelve 400.

---

## TASK-011: Tests de lógica de máquina (quote.service.machine.test.ts)

**Status**: completed
**Requirements**: FR-005, NFR-002, NFR-004, EC-001, EC-002, EC-004
**Complexity**: M
**Depends on**: TASK-009
**Files**: `backend/tests/services/quote.service.machine.test.ts`

### Description
Crear el archivo de tests con al menos estos casos:
1. `costoAmortizacionUSD` se calcula correctamente con la fórmula del Excel (usando `costoUsd=7000`, `meses=30`, `piezasPorDia=20`, pieza de ~10g → resultado ≈ 0.0389 USD).
2. EC-001/002: `machinesRepo.getById` retorna `null` → `calcularCotizacion` lanza error con mensaje "Máquina '...' no encontrada.".
3. EC-004: `piezasPorDiaEstimadas = 0` → lanza error "piezasPorDiaEstimadas debe ser mayor que 0.".
4. NFR-004: `machinesRepo.getById` se llama exactamente 1 vez por cotización.
5. Con `cantidad=3`, `costoAmortizacionUSD` por unidad NO escala con cantidad (es costo por pieza, no por lote).

### Validation
`npm test -- --run` pasa con los tests nuevos. Total de tests ≥ 52.

---

## TASK-012: Agregar getMachines() a frontend api.ts

**Status**: completed
**Requirements**: FR-001, FR-009
**Complexity**: S
**Depends on**: TASK-004
**Files**: `frontend/src/services/api.ts`

### Description
Agregar la función `getMachines(): Promise<Maquina[]>` que hace `GET /api/machines` y retorna el array de máquinas. Seguir el mismo patrón de `getMateriales()` si existe, o el patrón de fetch con manejo de error ya establecido en el archivo.

### Validation
`tsc -b` en frontend sin errores. La función `getMachines` existe y está tipada correctamente.

---

## TASK-013: Agregar fila amortización en PasoResultado

**Status**: completed
**Requirements**: FR-007
**Complexity**: S
**Depends on**: TASK-004
**Files**: `frontend/src/components/screens/PasoResultado.tsx`

### Description
Agregar la fila `['Amortización máquina', fmtUSD(result.costoAmortizacionUSD)]` en el array de la tabla de desglose, entre "Mano de obra" y "Costo inicio de impresión". Seguir el mismo patrón de las filas existentes.

### Validation
`tsc -b` en frontend sin errores. La fila aparece en la tabla de desglose con el valor tipado.

---

## TASK-014: Agregar fila amortización en CotizacionPDF

**Status**: completed
**Requirements**: FR-010
**Complexity**: S
**Depends on**: TASK-004
**Files**: `frontend/src/components/pdf/CotizacionPDF.tsx`

### Description
Agregar una fila `<View style={s.tr}>` con label "Amortización máquina" y valor `{fmtUSD(costoAmortizacionUSD)}` entre la fila de "Mano de obra" y la de "Costo inicio de impresión". Extraer `costoAmortizacionUSD` del destructuring de `quoteResult` al inicio del componente. Seguir el patrón de las filas existentes.

### Validation
`tsc -b` en frontend sin errores. El componente `CotizacionPDF` destructura y renderiza `costoAmortizacionUSD`.

---

## TASK-015: Selector de máquina en PasoCotizar

**Status**: completed
**Requirements**: FR-002, FR-003, FR-009, EC-003
**Complexity**: M
**Depends on**: TASK-010, TASK-012
**Files**: `frontend/src/components/screens/PasoCotizar.tsx`

### Description
1. Agregar `useState<Maquina[]>([])` para la lista de máquinas y `useState<string>('')` para `maquinaId` seleccionada.
2. Agregar `useEffect` que llama `getMachines()` al montar el componente y carga las opciones.
3. Agregar un `<select>` para elegir la máquina, usando el mismo estilo visual que el selector de material existente.
4. Si la lista está vacía, mostrar el selector deshabilitado con texto "No hay máquinas disponibles." (EC-003).
5. El botón "Cotizar" debe estar deshabilitado si `maquinaId === ''`.
6. Incluir `maquinaId` en el body del `POST /api/quote`.

### Validation
`tsc -b` en frontend sin errores. El flujo completo funciona: seleccionar máquina → cotizar → resultado incluye `costoAmortizacionUSD` y la fila aparece en el desglose.
