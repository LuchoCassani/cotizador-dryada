# Selección de Máquina — Specification

**Version:** 1.0
**Date:** 2026-06-13
**Status:** Draft
**PRD Reference:** None
**Constitution:** Pending review

---

## 1. Metadata

| Campo | Valor |
|---|---|
| Feature | machine-selection |
| Autor | Lucho |
| Versión | 1.0 |
| Estado | Draft |
| Creado | 2026-06-13 |
| Última actualización | 2026-06-13 |

---

## 2. Context

La fórmula actual de SPEC-C ignora el costo de amortización de la impresora. El Excel de referencia incluye una línea "Amortización máquina" (~0.04 USD/pieza) calculada a partir del costo de la impresora y su plazo de amortización. La DB ya tiene la tabla `maquinas` con 4 equipos, cada uno con `costo_usd` y `meses_amortizacion`. Falta:

1. Un endpoint HTTP que exponga las máquinas activas al frontend.
2. Un selector de máquina en el formulario de cotización (junto al selector de material).
3. Que `QuoteService` use la máquina seleccionada para calcular el costo de amortización por pieza.
4. Persistir `maquina_id` en la tabla `cotizaciones`.
5. Mostrar la línea de amortización en el PDF.

Este spec cubre el ciclo completo: API → servicio → UI → PDF.

---

## 3. Goals & Non-Goals

### Goals

1. Exponer `GET /api/machines` que devuelve las máquinas activas.
2. El frontend muestra un selector de máquina en el paso de configuración (junto al selector de material). El usuario debe elegir máquina antes de poder cotizar.
3. `QuoteService` calcula `costoAmortizacionUSD` usando los datos de la máquina seleccionada.
4. `maquinaId` se persiste en `QuoteRecord` y en la tabla `cotizaciones`.
5. `CotizacionResult` expone `costoAmortizacionUSD` y `maquina: { id, nombre }`.
6. El PDF agrega una fila "Amortización máquina" en el desglose.

### Non-Goals

1. CRUD de máquinas desde la UI — SPEC-E (panel admin).
2. Validación de que la pieza cabe en la máquina (bounding box check) — SPEC futura.
3. Selección de múltiples máquinas por cotización.
4. Cambiar la estructura de pasos de la UI (sigue siendo 4 pasos: upload → configurar → resultado → email/PDF).

---

## 4. User Stories

### Actor: Empleado de ventas

**Story:** Al configurar la cotización, el empleado elige qué máquina va a usar para imprimir la pieza.

**Acceptance criteria:**
- Given que el empleado está en el paso de configuración, when llega a ese paso, then ve un selector de máquina con las máquinas activas disponibles.
- Given que no hay máquina seleccionada, when intenta cotizar, then el botón "Cotizar" está deshabilitado.
- Given que el empleado selecciona una máquina y un material, when presiona "Cotizar", then la cotización incluye el costo de amortización de esa máquina.

### Actor: Sistema (QuoteService)

**Story:** Al calcular la cotización, el servicio incluye el costo de amortización de la máquina en la fórmula.

**Acceptance criteria:**
- Given una máquina con `costoUsd = 7000` y `mesesAmortizacion = 30`, when se calcula la amortización, then `costoAmortizacionUSD` refleja el costo proporcional por pieza según la fórmula definida.
- Given que `maquinaId` no corresponde a ninguna máquina activa, when se llama a `calcularCotizacion()`, then lanza un error con mensaje descriptivo.

---

## 5. Functional Requirements

- **FR-001:** `GET /api/machines` devuelve un array de máquinas activas: `[{ id, nombre, capacidadXmm, capacidadYmm, capacidadZmm }]`. No expone `costoUsd` ni `mesesAmortizacion` al frontend (datos internos de pricing).
- **FR-002:** El paso de configuración del frontend agrega un `<select>` de máquina, requerido antes de habilitar el botón "Cotizar".
- **FR-003:** `CotizacionInput` agrega `maquinaId: string`.
- **FR-004:** `QuoteService` recibe `IMachinesRepository` como cuarta dependencia en el constructor y llama a `machinesRepo.getById(input.maquinaId)` para obtener los datos de la máquina.
- **FR-005:** La fórmula incluye: `costoAmortizacionUSD = (maquina.costoUsd / maquina.mesesAmortizacion / 30 / params.piezasPorDiaEstimadas) * (gramosTotal / GRAMOS_REFERENCIA)`, donde `GRAMOS_REFERENCIA = 10` es una constante de proceso y `piezasPorDiaEstimadas` es un nuevo campo en `parametros_globales` (seed: 20). La amortización escala proporcionalmente al peso de la pieza respecto a la referencia de 10g.
- **FR-006:** `costoBase = costoMaterialUSD + costoManoObraUSD + costoAmortizacionUSD + costoInicioUSD`.
- **FR-007:** `CotizacionResult` agrega `costoAmortizacionUSD: number` y `maquina: { id: string; nombre: string }`.
- **FR-008:** `QuoteRecord` agrega `maquinaId: string`. La tabla `cotizaciones` agrega la columna `maquina_id TEXT NOT NULL REFERENCES maquinas(id)`.
- **FR-009:** `frontend/src/types/index.ts` agrega la interfaz `Maquina { id, nombre, capacidadXmm, capacidadYmm, capacidadZmm }`, `maquinaId: string` al body de la petición de cotización, y `costoAmortizacionUSD` + `maquina` a `CotizacionResult`.
- **FR-010:** `CotizacionPDF.tsx` agrega una fila "Amortización máquina" con `costoAmortizacionUSD` en el desglose, entre "Mano de obra" y "Costo inicio de impresión".

---

## 6. Non-Functional Requirements

- **NFR-001:** `tsc --noEmit` en backend y `tsc -b` en frontend sin errores. Sin `any`.
- **NFR-002:** `npm test -- --run` pasa todos los tests existentes (47) más los nuevos.
- **NFR-003:** `GET /api/machines` responde en < 100ms (SQLite local, sin carga).
- **NFR-004:** `QuoteService` hace exactamente 1 llamada a `machinesRepo.getById()` por cotización, en el mismo `Promise.all` que `pricesRepo.getMaterialById()` y `paramsRepo.get()`.
- **NFR-005:** La migración de `cotizaciones` es aditiva: el script de init agrega la columna si no existe, sin destruir datos previos. En desarrollo local se puede documentar como "borrar DB y reiniciar".

---

## 7. Technical Design

### Fórmula completa (SPEC-D)

```
// Amortización (nuevo) — replica celda C14 del Excel "Otros costos"
costoAmortizacionUSD = (maquina.costoUsd / maquina.mesesAmortizacion / 30 / params.piezasPorDiaEstimadas) * (gramosTotal / GRAMOS_REFERENCIA)

// Costos (actualizado)
costoBase = costoMaterialUSD + costoManoObraUSD + costoAmortizacionUSD + costoInicioUSD

// Sin cambios respecto a SPEC-C (ya corregido)
precioUnitarioUSD = costoBase * (1 + params.coeficienteGanancia)
precioFinalUSD    = precioUnitarioUSD * cantidad
```

### Nuevo parámetro global: `piezasPorDiaEstimadas`

Se agrega a `parametros_globales`. Representa la producción diaria estimada para distribuir la amortización. Valor seed: `20` (coincide con el Excel, produce `costoAmortizacionUSD ≈ 0.0428` con una pieza de 1.1g).

La fórmula replica exactamente la celda C14 del Excel `Calculo (SM-GLN) - 2026 v14.xlsx`, hoja "Otros costos":
```
(((C12/C13)/30)/20)*(C7/10)
↓
(costoUsd / meses / DIAS_POR_MES / piezasPorDia) * (gramosTotal / GRAMOS_REFERENCIA)
```

Constantes de proceso (no configurables): `DIAS_POR_MES = 30`, `GRAMOS_REFERENCIA = 10`.

### Endpoint nuevo

```
GET /api/machines
Response: Array<{ id: string; nombre: string; capacidadXmm: number; capacidadYmm: number; capacidadZmm: number }>
```

Solo devuelve máquinas con `activa = true`.

### Inyección de dependencias

`QuoteService` pasa de 3 a 4 dependencias:

```typescript
constructor(
  private readonly pricesRepo: IPricesRepository,
  private readonly paramsRepo: IGlobalParametersRepository,
  private readonly machinesRepo: IMachinesRepository,
  private readonly quoteRepo: IQuoteRepository,
) {}
```

### Migration de cotizaciones

```sql
ALTER TABLE cotizaciones ADD COLUMN maquina_id TEXT NOT NULL DEFAULT '' REFERENCES maquinas(id);
```

Nota: SQLite no soporta `ADD COLUMN ... NOT NULL` sin DEFAULT. Para producción la columna debería tener un `maquina_id` real; para las filas históricas se usa `DEFAULT ''` (string vacío como placeholder). En desarrollo local se recomienda borrar el archivo `.db` y reiniciar.

### Archivos afectados

**Backend — modificar:**
- `backend/src/services/quote.service.ts` — agregar `machinesRepo`, `costoAmortizacionUSD` en fórmula, `maquinaId` en input/result/record
- `backend/src/app.ts` — inyectar `machinesRepo` en `QuoteService`, agregar endpoint `GET /api/machines`
- `backend/src/db/init.ts` — migration: ALTER TABLE + nuevo campo `piezas_por_dia_estimadas` en `parametros_globales`
- `backend/src/repositories/global-params.repository.ts` — agregar `piezasPorDiaEstimadas: number` a `ParametrosGlobales`
- `backend/src/repositories/sqlite-global-params.repository.ts` — leer/escribir el nuevo campo
- `backend/src/repositories/quote.repository.ts` — agregar `maquinaId: string` a `QuoteRecord`
- `backend/src/repositories/sqlite-quote.repository.ts` — leer/escribir `maquina_id`
- `backend/src/db/seed/parametros.seed.ts` — agregar `piezasPorDiaEstimadas: 20`

**Backend — crear:**
- `backend/src/routes/machines.route.ts` — handler GET /api/machines
- `backend/tests/services/quote.service.machine.test.ts` — tests para la nueva lógica

**Frontend — modificar:**
- `frontend/src/types/index.ts` — agregar `Maquina`, `maquinaId` en request, `costoAmortizacionUSD` + `maquina` en `CotizacionResult`
- `frontend/src/components/steps/ConfigStep.tsx` (o equivalente) — agregar selector de máquina
- `frontend/src/components/pdf/CotizacionPDF.tsx` — agregar fila "Amortización máquina"

---

## 8. Data Models

### `IMachinesRepository` (nueva interface)

```typescript
interface Maquina {
  id: string;
  nombre: string;
  costoUsd: number;
  mesesAmortizacion: number;
  capacidadXmm: number;
  capacidadYmm: number;
  capacidadZmm: number;
  activa: boolean;
}

interface MaquinaPublica {
  id: string;
  nombre: string;
  capacidadXmm: number;
  capacidadYmm: number;
  capacidadZmm: number;
}

interface IMachinesRepository {
  getById(id: string): Promise<Maquina | null>;
  getActivas(): Promise<MaquinaPublica[]>;
}
```

`getById` devuelve `null` si no existe o si `activa = false` (EC-001, EC-002).
`getActivas` devuelve solo campos públicos — no expone `costoUsd` ni `mesesAmortizacion` (FR-001).

### `parametros_globales` (nuevo campo)

| Campo | Tipo | Descripción |
|---|---|---|
| `piezas_por_dia_estimadas` | INTEGER | **NUEVO** — producción diaria estimada para distribuir la amortización (default 20) |

### `cotizaciones` (nuevo campo)

| Campo | Tipo | Descripción |
|---|---|---|
| `maquina_id` | TEXT | **NUEVO** — FK a `maquinas.id` |

### `CotizacionResult` (nuevos campos)

| Campo | Tipo | Descripción |
|---|---|---|
| `costoAmortizacionUSD` | number | **NUEVO** — amortización por pieza |
| `maquina` | `{ id: string; nombre: string }` | **NUEVO** — máquina usada en la cotización |

---

## 9. API Contracts

### Nuevo

```
GET /api/machines
200: [{ id: string, nombre: string, capacidadXmm: number, capacidadYmm: number, capacidadZmm: number }]
```

### Modificado

```
POST /api/quote
Body (agregado): { maquinaId: string }
Response (agregado): { costoAmortizacionUSD: number, maquina: { id: string, nombre: string } }
```

---

## 10. Edge Cases & Error Handling

| ID | Escenario | Comportamiento esperado |
|---|---|---|
| EC-001 | `maquinaId` no existe en la DB | `QuoteService` lanza `Error("Máquina '{id}' no encontrada.")`. Ruta HTTP devuelve 400. |
| EC-002 | Máquina existe pero `activa = false` | Se trata igual que no encontrada: lanza error. La consulta filtra `activa = 1`. |
| EC-003 | `GET /api/machines` con tabla vacía | Devuelve `[]`. El frontend muestra "No hay máquinas disponibles." y deshabilita el botón. |
| EC-004 | `piezasPorDiaEstimadas = 0` | `QuoteService` lanza `Error("piezasPorDiaEstimadas debe ser mayor que 0.")` antes de calcular. La ruta HTTP devuelve 500. |
| EC-005 | Frontend envía cotización sin `maquinaId` | La ruta valida presencia del campo antes de pasar al servicio. Devuelve 400 con mensaje descriptivo. |

---

## 11. Open Questions

_(ninguna — OQ-001 resuelta leyendo el Excel directamente)_

## Clarifications

### C-5: Tests existentes al cambiar constructor QuoteService
**Type:** assumption
**Q:** Al pasar de 3 a 4 dependencias en el constructor, todos los tests existentes en `quote.service.test.ts` fallarían. ¿Se actualiza el archivo existente o se añade un default?
**A:** Se actualiza `quote.service.test.ts`: `makeRepos()` agrega un cuarto mock `machinesRepo` con `getById` y `getActivas` como `vi.fn()`. Los tests nuevos de la feature van en `quote.service.machine.test.ts` (separación de responsabilidades). NFR-002 actualizado: la base es 47 tests existentes (no 45).

### C-3: Métodos de IMachinesRepository
**Type:** structural gap
**Q:** La interface IMachinesRepository era referenciada pero no definida. ¿Qué métodos expone?
**A:** Dos métodos: `getById(id: string): Promise<Maquina | null>` (para QuoteService, devuelve null si no existe o inactiva) y `getActivas(): Promise<MaquinaPublica[]>` (para GET /api/machines, sin campos de pricing). Definición agregada a §8.

### C-4: División por cero en piezasPorDiaEstimadas
**Type:** edge case
**Q:** EC-004 decía que piezasPorDiaEstimadas=0 produce Infinity silenciosamente. ¿Debería el servicio guardar silencio o lanzar error?
**A:** Lanzar error: `Error("piezasPorDiaEstimadas debe ser mayor que 0.")`. EC-004 actualizado para reflejar esto. Se agrega un test unitario para este caso.

### C-2: Fuente de verdad para la fórmula de amortización
**Type:** ambiguity
**Q:** §7 Technical Design tenía una fórmula distinta a FR-005 y usaba `piezasMensualesEstimadas` en vez de `piezasPorDiaEstimadas`. ¿Cuál es la fuente de verdad?
**A:** FR-005 + C-1 son autoritativos. §7 estaba stale. Se corrigió §7 para usar la fórmula del Excel con `piezasPorDiaEstimadas` (seed: 20, diario) y la corrección `(1 + coeficienteGanancia)` ya aplicada en SPEC-C.

### C-1: Fórmula de amortización replicada del Excel
**Type:** domain clarification resolved
**Q:** ¿Cómo calcula el Excel la amortización por pieza?
**A:** Celda C14, hoja "Otros costos": `(((costoUsd/meses)/30)/20)*(gramosTotal/10)`. La amortización escala con el peso de la pieza (no es fija por pieza). Constantes: 30 días/mes, 20 piezas/día estimadas (configurable como `piezasPorDiaEstimadas`), 10g de referencia.
