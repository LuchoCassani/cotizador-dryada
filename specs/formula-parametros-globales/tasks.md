# Tasks: Fórmula con Parámetros Globales

**Feature**: formula-parametros-globales
**Plan**: specs/formula-parametros-globales/plan.md
**Generated**: 2026-06-13

---

## TASK-001: Actualizar QuoteService con nueva fórmula y nueva dependencia

**Status**: completed
**Requirements**: FR-001, FR-002, FR-003, FR-004, FR-006, FR-008, EC-001, EC-002, EC-003, EC-004, EC-005, NFR-001
**Complexity**: M
**Depends on**: none
**Files**: backend/src/services/quote.service.ts

### Description
Agregar `IGlobalParametersRepository` como segunda dependencia del constructor (antes de `IQuoteRepository`). Llamar `paramsRepo.get()` una sola vez al inicio de `calcularCotizacion()`. Actualizar la fórmula: `gramosTotal = gramosRaw * (1 + params.desperdicioPct)`, `costoManoObraUSD = params.tarifaManoObraUsdHora * params.horasPorPieza`, `costoBase = costoMaterialUSD + costoManoObraUSD + costoInicioUSD`, `precioUnitarioUSD = costoBase * params.coeficienteGanancia`. Agregar `costoManoObraUSD: number` a la interfaz `CotizacionResult` y al objeto retornado.

### Validation
`tsc --noEmit` sin errores. La clase compila con el nuevo constructor. `CotizacionResult` tiene el campo `costoManoObraUSD`. Sin `any`.

---

## TASK-002: Corregir EUR→USD en adapter e inyectar paramsRepo en app.ts

**Status**: completed
**Requirements**: FR-005, FR-007, NFR-001
**Complexity**: S
**Depends on**: TASK-001
**Files**: backend/src/app.ts

### Description
En el adapter de `pricesRepo`: cambiar `precioGramo: m.precioPorCartucho750gEUR / 750` por `(m.precioPorCartucho750gEUR / 750) * params.tasaEurUsd`. Llamar `paramsRepo.get()` con `Promise.all` junto a la consulta del material (una sola llamada por petición). En la línea que instancia `QuoteService`: agregar `paramsRepo` como segundo argumento antes de `quoteRepo`.

### Validation
`tsc --noEmit` sin errores. `npm test -- --run` pasa los 37 tests existentes sin regresiones.

---

## TASK-003: Agregar costoManoObraUSD al tipo CotizacionResult del frontend

**Status**: completed
**Requirements**: FR-006, FR-009, NFR-001
**Complexity**: S
**Depends on**: none
**Files**: frontend/src/types/index.ts

### Description
En la interfaz `CotizacionResult` de `frontend/src/types/index.ts`, agregar el campo `costoManoObraUSD: number` después de `costoMaterialUSD`. Sin otros cambios en el archivo.

### Validation
`tsc -b` en el frontend sin errores. El campo existe en el tipo exportado.

---

## TASK-004: Agregar fila "Mano de obra" en CotizacionPDF

**Status**: completed
**Requirements**: FR-009
**Complexity**: S
**Depends on**: TASK-003
**Files**: frontend/src/components/pdf/CotizacionPDF.tsx

### Description
En la destructuración de `quoteResult` (línea 145), agregar `costoManoObraUSD`. Agregar una `<View style={s.tr}>` con label "Mano de obra" y valor `{fmtUSD(costoManoObraUSD)}` entre las filas de "Costo material" y "Costo inicio de impresión". Sin otros cambios en el componente.

### Validation
`tsc -b` en el frontend sin errores. El componente renderiza el nuevo campo sin errores de tipo.

---

## TASK-005: Tests unitarios para QuoteService

**Status**: completed
**Requirements**: FR-002, FR-003, FR-004, NFR-002, NFR-003, NFR-004, EC-004, EC-005
**Complexity**: M
**Depends on**: TASK-001, TASK-002
**Files**: backend/tests/services/quote.service.test.ts

### Description
Crear `backend/tests/services/quote.service.test.ts`. Definir mocks inline para las 3 interfaces (`IPricesRepository`, `IGlobalParametersRepository`, `IQuoteRepository`). Helper `makeParams()` con valores del seed (tasaEurUsd: 1.0549, tarifaManoObraUsdHora: 6.82, horasPorPieza: 0.20, desperdicioPct: 0.10, coeficienteGanancia: 2.0, costosAdicionalesUsd: 0.50). Helper `makeInput()` con STL analysis de prueba.
Tests: (1) `gramosTotal` incluye desperdicio del 10%; (2) `costoManoObraUSD = tarifaHora * horasPorPieza`; (3) `precioUnitarioUSD = costoBase * coeficiente`; (4) `precioFinalUSD = precioUnitario * cantidad`; (5) `desperdicioPct = 0` → `gramosTotal = gramosRaw`; (6) `horasPorPieza = 0` → `costoManoObraUSD = 0`; (7) material no encontrado lanza error; (8) `paramsRepo.get()` se llama exactamente una vez por cotización.

### Validation
`npm test -- --run` pasa todos los tests incluyendo los 8 nuevos. Cobertura de `quote.service.ts` ≥ 80%.
