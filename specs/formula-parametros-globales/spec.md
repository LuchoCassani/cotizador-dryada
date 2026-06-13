# Fórmula con Parámetros Globales — Specification

**Version:** 1.0
**Date:** 2026-06-13
**Status:** Draft
**PRD Reference:** None
**Constitution:** Confirmed compliant

---

## 1. Metadata

| Campo | Valor |
|---|---|
| Feature | formula-parametros-globales |
| Autor | Lucho |
| Versión | 1.0 |
| Estado | Draft |
| Creado | 2026-06-13 |
| Última actualización | 2026-06-13 |

---

## 2. Context

`QuoteService` calcula cotizaciones usando valores hardcodeados en N1: `FILL_RATIO = 0.10`, `N_PERIMETROS = 2`, `ANCHO_LINEA_CM = 0.04`. Además ignora cuatro parámetros que ya existen en `parametros_globales`: `tarifaManoObraUsdHora`, `horasPorPieza`, `desperdicioPct` y `coeficienteGanancia`. Tampoco convierte el precio del cartucho de EUR a USD usando `tasaEurUsd`.

El resultado es que los precios generados no reflejan los costos reales de Dryada: falta el costo de mano de obra, no se descuenta el desperdicio de filamento, y el precio final no aplica el coeficiente de ganancia. Los números actuales son aproximaciones de N1 que subestiman el precio real.

Este spec conecta `QuoteService` con `IGlobalParametersRepository` para usar todos los parámetros configurados en la DB. Es un cambio de backend puro — los endpoints HTTP, `IQuoteRepository`, `IQuoteService` y la UI no cambian.

---

## 3. Goals & Non-Goals

### Goals

1. La fórmula usa `desperdicioPct` de la DB para calcular el peso real consumido de filamento.
2. La fórmula usa `tarifaManoObraUsdHora` y `horasPorPieza` de la DB para calcular el costo de mano de obra por pieza.
3. La fórmula aplica `coeficienteGanancia` de la DB al costo base para obtener el precio unitario.
4. El precio del material se convierte de EUR a USD usando `tasaEurUsd` de la DB.
5. `CotizacionResult` expone `costoManoObraUSD` como campo nuevo para que el PDF pueda mostrarlo en el desglose.
6. Los constantes físicos de impresión (`FILL_RATIO`, `N_PERIMETROS`, `ANCHO_LINEA_CM`) permanecen en código — son propiedades del proceso, no parámetros de negocio.

### Non-Goals

1. Agregar selección de máquina al flujo — SPEC-D.
2. UI para editar parámetros globales — SPEC-E. Decisión explícita: el panel de edición de `desperdicioPct`, `tarifaManoObraUsdHora`, `horasPorPieza`, `coeficienteGanancia` y `costosAdicionalesUsd` va en SPEC-E junto con el panel de materiales, máquinas e historial.
3. Amortización de impresora — SPEC-D. El costo de amortización por pieza depende de la máquina seleccionada. Sin selección de máquina (estado actual), ese costo no existe en la fórmula.
4. Rediseño completo del PDF — SPEC-E. Solo se agrega una fila al desglose existente (ver FR-009).
5. Modificar `IQuoteRepository`, `IQuoteService`, o cualquier endpoint HTTP.
6. Agregar `tasaArsUsd` a la fórmula — por ahora los precios solo se expresan en USD.

---

## 4. User Stories

### Actor: Sistema (QuoteService al calcular una cotización)

**Story:** Al procesar `calcularCotizacion()`, el servicio obtiene los parámetros globales de la DB y aplica la fórmula completa.

**Acceptance criteria:**
- Given que `desperdicioPct = 0.10`, when se calcula una cotización, then `gramosTotal = gramosRaw * 1.10`.
- Given que `tarifaManoObraUsdHora = 6.82` y `horasPorPieza = 0.20`, when se calcula una cotización, then `costoManoObraUSD = 6.82 * 0.20 = 1.364`.
- Given que `coeficienteGanancia = 2.0`, when se calcula una cotización, then `precioUnitarioUSD = costoBase * (1 + 2.0) = costoBase * 3.0`.
- Given que `tasaEurUsd = 1.0549` y `precioPorCartucho750gEUR = 35.13` (PLA Smartfil), when se obtiene el precio por gramo, then `precioGramoUSD = (35.13 / 750) * 1.0549 ≈ 0.04944 USD/g`.

---

## 5. Functional Requirements

- **FR-001:** `QuoteService` recibe `IGlobalParametersRepository` como segunda dependencia en el constructor.
- **FR-002:** La fórmula de peso aplica desperdicio: `gramosTotal = gramosRaw * (1 + params.desperdicioPct)`, donde `gramosRaw = gramosInfill + gramosParedes`.
- **FR-003:** La fórmula incluye costo de mano de obra: `costoManoObraUSD = params.tarifaManoObraUsdHora * params.horasPorPieza`.
- **FR-004:** El precio unitario aplica coeficiente de ganancia: `precioUnitarioUSD = costoBase * (1 + params.coeficienteGanancia)`. El `coeficienteGanancia` representa el margen sobre el costo (Excel: `(C16 * (C17 + 1)) / C5`). Con coeficiente=2, el multiplicador efectivo es 3.
- **FR-005:** El precio por gramo del material se expresa en USD: el adapter en `app.ts` convierte `precioPorCartucho750gEUR / 750 * params.tasaEurUsd`.
- **FR-006:** `CotizacionResult` agrega el campo `costoManoObraUSD: number`.
- **FR-007:** `app.ts` inyecta `paramsRepo` en `QuoteService` junto a `pricesRepo`.
- **FR-008:** Los campos `gramosInfill` y `gramosParedes` en `CotizacionResult` reflejan el peso pre-desperdicio (útiles para desglose). `gramosTotal` refleja el peso post-desperdicio (lo que realmente se consume).
- **FR-009:** `frontend/src/types/index.ts` agrega `costoManoObraUSD: number` a `CotizacionResult`. `CotizacionPDF.tsx` agrega una fila "Mano de obra" con ese valor en el desglose, entre "Costo material" y "Costo inicio de impresión". El `coeficienteGanancia` no se muestra al cliente.

---

## 6. Non-Functional Requirements

- **NFR-001:** `tsc --noEmit` sin errores. Sin `any`.
- **NFR-002:** `npm test -- --run` pasa todos los tests existentes (37) más los nuevos de `QuoteService`.
- **NFR-003:** Cobertura de tests ≥ 80% en `quote.service.ts`.
- **NFR-004:** `QuoteService` llama a `paramsRepo.get()` exactamente una vez directamente por cotización y reutiliza el resultado (`params.costosAdicionalesUsd`) en lugar de delegar a `pricesRepo.getCostoInicio()`. El adapter de `pricesRepo` puede hacer una llamada adicional a `paramsRepo` internamente para la conversión EUR→USD — ese es un detalle del adapter, no de `QuoteService`.

---

## 7. Technical Design

### Fórmula completa (SPEC-C)

```
// Peso (físico, constantes de proceso)
gramosInfill  = volumenCm3 * FILL_RATIO * material.densidad
gramosParedes = areaCm2 * (N_PERIMETROS * ANCHO_LINEA_CM) * material.densidad
gramosRaw     = gramosInfill + gramosParedes
gramosTotal   = gramosRaw * (1 + params.desperdicioPct)          ← NEW

// Costos
precioGramoUSD   = precioPorCartucho750gEUR / 750 * params.tasaEurUsd  ← NEW (adapter)
costoMaterialUSD = gramosTotal * material.precioGramo             (precioGramo ahora en USD)
costoManoObraUSD = params.tarifaManoObraUsdHora * params.horasPorPieza ← NEW
costosAdicionales = costosAdicionalesUsd                          (sin cambio)

costoBase        = costoMaterialUSD + costoManoObraUSD + costosAdicionales
precioUnitarioUSD = costoBase * (1 + params.coeficienteGanancia)   ← NEW (Excel: costoBase*(coef+1))
precioFinalUSD    = precioUnitarioUSD * cantidad
```

### Inyección de dependencias

`QuoteService` pasa de 2 a 3 dependencias:

```typescript
constructor(
  private readonly pricesRepo: IPricesRepository,
  private readonly paramsRepo: IGlobalParametersRepository,
  private readonly quoteRepo: IQuoteRepository,
) {}
```

El orden pone `paramsRepo` antes de `quoteRepo` para agrupar las dependencias de lectura juntas.

### Adapter EUR→USD (app.ts)

El adapter existente cambia `getCostoInicio` y `getMateriales`/`getMaterialById` para incluir la conversión:

```typescript
// antes
precioGramo: m.precioPorCartucho750gEUR / 750,

// después
const params = await paramsRepo.get();
precioGramo: (m.precioPorCartucho750gEUR / 750) * params.tasaEurUsd,
```

El adapter llama a `paramsRepo.get()` una sola vez y reutiliza el resultado en todas las funciones que lo necesiten dentro de la misma llamada.

### Archivos afectados

**Modificar:**
- `backend/src/services/quote.service.ts` — nueva firma de constructor, nueva fórmula, nuevo campo en `CotizacionResult`
- `backend/src/app.ts` — inyectar `paramsRepo` en `QuoteService`, corregir EUR→USD en adapter
- `frontend/src/types/index.ts` — agregar `costoManoObraUSD: number` a `CotizacionResult`
- `frontend/src/components/pdf/CotizacionPDF.tsx` — agregar fila "Mano de obra" en desglose

**Crear:**
- `backend/tests/services/quote.service.test.ts` — tests unitarios del servicio con mocks de las 3 interfaces

**Sin cambios:**
- `backend/src/repositories/prices.repository.ts` — interfaz intacta
- `backend/src/repositories/global-params.repository.ts` — interfaz intacta
- Rutas HTTP, `IQuoteRepository`

---

## 8. Data Models

Sin cambios en esquema SQLite. `CotizacionResult` (tipo de retorno de `QuoteService`) agrega un campo:

| Campo | Tipo | Descripción |
|---|---|---|
| `costoManoObraUSD` | number | **NUEVO** — costo de mano de obra por pieza |

Los demás campos de `CotizacionResult` conservan sus nombres. Los valores cambian por la nueva fórmula.

---

## 9. API Contracts

Sin cambios en endpoints HTTP. La respuesta de `POST /api/quote` agrega el campo `costoManoObraUSD` (adición no breaking — el frontend lo ignora si no lo usa).

---

## 10. Edge Cases & Error Handling

| ID | Escenario | Comportamiento esperado |
|---|---|---|
| EC-001 | `paramsRepo.get()` falla (DB corrupta o tabla vacía) | El error burbujea desde `better-sqlite3`. La ruta HTTP devuelve 500. No hay fallback a valores hardcodeados. |
| EC-002 | `tasaEurUsd = 0` (configurado incorrectamente) | `precioGramoUSD = 0`, precio final = 0. No lanza error — es responsabilidad del admin configurar un valor válido. |
| EC-003 | `coeficienteGanancia = 0` | `precioUnitarioUSD = 0`. Mismo criterio: no lanza error. |
| EC-004 | `desperdicioPct = 0` | `gramosTotal = gramosRaw * 1.0` — comportamiento correcto, sin desperdicio. |
| EC-005 | `horasPorPieza = 0` | `costoManoObraUSD = 0` — correcto para piezas simples sin mano de obra. |

---

## 11. Open Questions

_(ninguna)_

## Clarifications

### C-1: PDF roto sin actualización
**Type:** structural gap
**Q:** ¿El PDF se actualiza en SPEC-C o en SPEC-E?
**A:** En SPEC-C. Sin la fila de mano de obra, el desglose del PDF no cuadra: `costoMaterial + costoInicio ≠ precioUnitario`. Cambio mínimo: agregar fila "Mano de obra" en `CotizacionPDF.tsx` y el tipo en `frontend/src/types/index.ts`. El coeficiente de ganancia no se muestra al cliente.

### C-2: Semántica de `precioUnitarioUSD`
**Type:** ambiguity
**Q:** `precioUnitarioUSD` actualmente es "costo por unidad sin ganancia". Después de SPEC-C incluye el coeficiente. ¿Se renombra?
**A:** No se renombra. El label "Precio unitario" en el PDF es correcto: es el precio de venta por unidad. El cliente no ve el margen. La semántica mejora, no empeora.

### C-4: Corrección de fórmula de coeficiente (post-implementación)
**Type:** bug fix — discrepancia con Excel
**Q:** El Excel usa `precio = costoBase * (coeficiente + 1)`. La implementación inicial usaba `precio = costoBase * coeficiente`. ¿Cuál es correcta?
**A:** La del Excel. Con `coeficienteGanancia = 2`, el multiplicador efectivo es 3 (no 2). El coeficiente representa el margen sobre el costo, no el multiplicador directo. Corregido en `quote.service.ts` al leer el Excel `Calculo (SM-GLN) - 2026 v14.xlsx`, hoja "Otros costos", celda C18.

### C-3: Estrategia de tests para QuoteService
**Type:** structural gap
**Q:** ¿Tests con SQLite real o mocks?
**A:** Mocks de las 3 interfaces (`IPricesRepository`, `IGlobalParametersRepository`, `IQuoteRepository`). `QuoteService` es lógica de negocio pura — los tests deben ser rápidos y sin I/O. Los tests de repositorios (que sí usan SQLite) están en `tests/repositories/`.
