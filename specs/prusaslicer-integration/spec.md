# PrusaSlicer Integration — Specification

**Version:** 1.0
**Date:** 2026-06-13
**Status:** Specified
**PRD Reference:** None
**Constitution:** Reviewed

---

## 1. Metadata

| Campo | Valor |
|---|---|
| Feature | prusaslicer-integration |
| Autor | Lucho |
| Versión | 1.0 |
| Estado | Specified |
| Creado | 2026-06-13 |
| Última actualización | 2026-06-13 |

---

## 2. Context

En N1 el peso del filamento se estima con una fórmula geométrica (volumen × densidad × factor de infill + área × paredes). Esta estimación puede desviarse ±15% respecto al peso real de impresión porque no modela soportes, costuras ni variaciones de la trayectoria del nozzle.

PrusaSlicer CLI puede slicear el STL con los mismos parámetros fijos (10% infill, 2 perímetros, nozzle 0.4mm) y devolver el peso de filamento en gramos con mayor precisión, porque simula la trayectoria real del extrusor.

Este spec introduce PrusaSlicer CLI en el backend con las siguientes restricciones:

- **Fallback silencioso**: si PrusaSlicer no está instalado, falla o supera el timeout, el sistema usa la fórmula N1 sin interrumpir la cotización ni mostrar un error al usuario.
- **No cambia el flujo de UI**: el empleado no ve cambios en la pantalla. La diferencia es interna al cálculo.
- **Corre en Railway con Docker Linux**: el binario se instala en la imagen Docker del backend.

### Flujo de datos actual (N1)

```
Upload STL → stl-processor.ts → StlAnalysis (volumenCm3, areaCm2, complejidad)
                              → uploadCache.set(uploadId, stlAnalysis)

POST /api/quote → uploadCache.get(uploadId) → QuoteService.calcularCotizacion()
                                             → gramosTotal via fórmula geométrica
```

### Flujo con PrusaSlicer (N2)

```
Upload STL → stl-processor.ts → StlAnalysis
           → STL guardado en UPLOADS_DIR/{uploadId}.stl
           → uploadCache.set(uploadId, stlAnalysis)

POST /api/quote → uploadCache.get(uploadId)
               → PrusaSlicerService.slice(stlPath, densidad)
                   → éxito: gramosTotal del slicer   ← weightSource = 'prusaslicer'
                   → fallo: gramosTotal de N1         ← weightSource = 'n1'
               → QuoteService.calcularCotizacion()
               → STL eliminado de disco
```

---

## 3. Goals & Non-Goals

### Goals

1. Guardar el archivo STL en disco al momento del upload y eliminarlo después de cotizar.
2. Invocar PrusaSlicer CLI en el servicio de cotización para obtener `gramosTotal` con los parámetros fijos de N1.
3. Usar el resultado de PrusaSlicer como `gramosTotal` en la fórmula de precio.
4. Si PrusaSlicer falla por cualquier causa, caer en fallback a la fórmula N1 sin interrumpir la cotización.
5. Agregar el campo `weightSource: 'prusaslicer' | 'n1'` en `CotizacionResult` para trazabilidad.
6. Limpiar archivos STL del disco: post-cotización (inmediato) y TTL de 30 minutos para uploads sin cotizar.

### Non-Goals

1. Cambiar los parámetros de slicing (infill, perímetros, nozzle) — son fijos en N1 y N2.
2. Usar IdeaMaker u otro slicer — PrusaSlicer es el único CLI aprobado.
3. Modificar la UI para mostrar el peso de PrusaSlicer vs N1 de forma diferente (no hay cambios en pantalla).
4. Soporte para STL binario vs ASCII — el parser de N1 ya maneja ambos; PrusaSlicer también.
5. Soporte de soportes automáticos, brim o raft — parámetros fijos sin soportes.
6. Guardar el gcode generado — es un artefacto temporal que se elimina junto con el STL.

---

## 4. User Stories

### Actor: Empleado de ventas

**Story:** El empleado cotiza una pieza y obtiene un precio más preciso gracias al slicing real.

**Acceptance criteria:**
- Given que el empleado sube un STL y completa el formulario, when presiona "Cotizar", then el precio refleja el peso de filamento calculado por PrusaSlicer (sin que el empleado note diferencia en el flujo).
- Given que PrusaSlicer no está disponible en el servidor, when el empleado cotiza, then la cotización se completa igualmente usando la fórmula N1 sin mostrar ningún error.

### Actor: Sistema (QuoteService)

**Story:** Al calcular la cotización, el sistema intenta obtener `gramosTotal` de PrusaSlicer antes de usar la fórmula geométrica.

**Acceptance criteria:**
- Given un STL disponible en disco y PrusaSlicer instalado, when se calcula la cotización, then `gramosTotal` viene del gcode y `weightSource = 'prusaslicer'`.
- Given que PrusaSlicer falla o supera el timeout, when se calcula la cotización, then `gramosTotal` viene de la fórmula N1 y `weightSource = 'n1'`.
- Given que el STL fue eliminado del disco (server restart, TTL expirado), when se calcula la cotización, then el sistema cae en fallback a N1 usando el `stlAnalysis` del cache.

---

## 5. Functional Requirements

| ID | Descripción |
|---|---|
| FR-001 | El upload handler guarda el archivo STL en `UPLOADS_DIR/{uploadId}.stl` antes de procesarlo con `stl-processor.ts`. |
| FR-002 | `PrusaSlicerService` expone el método `slice(stlPath: string, densidad: number): Promise<SliceResult>` donde `SliceResult = { gramosTotal: number }`. |
| FR-003 | `PrusaSlicerService.slice()` ejecuta el binario de PrusaSlicer con flags fijos: `--fill-density 10%`, `--perimeters 2`, `--nozzle-diameter 0.4`, `--layer-height 0.2`, `--filament-density {densidad}`, `--export-gcode`, `--output {tmpGcode}`. |
| FR-004 | `PrusaSlicerService.slice()` parsea el archivo gcode generado buscando la línea `; filament used [g] = {valor}` y extrae el valor como `number`. |
| FR-005 | `QuoteService` recibe `IPrusaSlicerService` como dependencia inyectada (5to parámetro del constructor). |
| FR-006 | En `calcularCotizacion()`, si el STL está en disco, `QuoteService` llama a `prusaSlicerService.slice()`. Si tiene éxito, usa el `gramosTotal` del slicer reemplazando el cálculo N1. Si falla (excepción o resultado inválido), usa la fórmula N1 con `stlAnalysis.volumenCm3` y `stlAnalysis.areaCm2`. |
| FR-007 | `CotizacionResult` incluye el campo `weightSource: 'prusaslicer' \| 'n1'`. |
| FR-008 | Después de calcular la cotización (éxito o error), el archivo `{uploadId}.stl` y el gcode temporal se eliminan de disco. La eliminación no bloquea la respuesta. |
| FR-009 | Un job de limpieza TTL elimina archivos STL en `UPLOADS_DIR` con más de 30 minutos de antigüedad. Se ejecuta cada 10 minutos vía `setInterval` al arranque del servidor. |
| FR-010 | Las variables de entorno `PRUSASLICER_BIN` (default: `prusa-slicer`), `UPLOADS_DIR` (default: `/tmp/cotizador-uploads`) y `PRUSA_LAYER_HEIGHT` (default: `0.20`) se validan con zod al arranque del servidor. |

---

## 6. Non-Functional Requirements

| ID | Descripción |
|---|---|
| NFR-001 | Timeout de ejecución de PrusaSlicer: 60 segundos. Si supera el límite, el proceso se mata con `SIGKILL` y se activa el fallback. |
| NFR-002 | `IPrusaSlicerService` es una interfaz; `PrusaSlicerService` es la implementación concreta. Se inyecta en `app.ts` igual que los repositorios. |
| NFR-003 | No se agregan dependencias npm. Usar `child_process.spawn` de Node stdlib y `fs/promises` para lectura del gcode. |
| NFR-004 | Cobertura de tests ≥ 80% para `PrusaSlicerService`: caso éxito, fallback por error de spawn, fallback por timeout, fallback por línea no encontrada en gcode. |
| NFR-005 | Los archivos temporales (STL y gcode) se crean en `UPLOADS_DIR` con nombres `{uploadId}.stl` y `{uploadId}.gcode`. No se usan rutas hardcodeadas. |
| NFR-006 | El proceso de slicing no bloquea el event loop de Node. Se usa `spawn` (no `spawnSync`). |

---

## 7. Technical Design

### Nuevo servicio

```
backend/src/services/
  prusa-slicer.service.ts    ← IPrusaSlicerService + PrusaSlicerService
```

### Cambios en servicios existentes

- `upload.route.ts` (o handler en `app.ts`): guardar STL en disco antes de `stlProcessor.parse()`
- `quote.service.ts`: agregar `IPrusaSlicerService` como 5to parámetro, intentar slice antes del cálculo N1
- `quote.route.ts`: sin cambios en el schema (sin campos nuevos de entrada)
- `app.ts`: instanciar `PrusaSlicerService`, inyectarlo en `QuoteService`, iniciar job de limpieza TTL

### Tipos afectados

```typescript
// Backend — quote.service.ts
export interface CotizacionResult {
  // ... campos existentes sin cambios ...
  weightSource: 'prusaslicer' | 'n1';  // nuevo
}

// Frontend — types/index.ts
export interface CotizacionResult {
  // ... campos existentes sin cambios ...
  weightSource: 'prusaslicer' | 'n1';  // nuevo
}
```

### Comando PrusaSlicer

```bash
{PRUSASLICER_BIN} \
  --fill-density 10% \
  --perimeters 2 \
  --nozzle-diameter 0.4 \
  --layer-height 0.2 \
  --filament-density {densidad} \
  --export-gcode \
  --output {UPLOADS_DIR}/{uploadId}.gcode \
  {UPLOADS_DIR}/{uploadId}.stl
```

### Parsing del gcode

```
; filament used [g] = 12.45
```

Regex: `/^;\s*filament used \[g\]\s*=\s*([\d.]+)/m`

---

## 8. Data Models

### SliceResult

```typescript
interface SliceResult {
  gramosTotal: number;
}
```

### IPrusaSlicerService

```typescript
interface IPrusaSlicerService {
  slice(stlPath: string, densidad: number): Promise<SliceResult>;
}
```

### Variables de entorno nuevas

| Variable | Default | Descripción |
|---|---|---|
| `PRUSASLICER_BIN` | `prusa-slicer` | Ruta al binario de PrusaSlicer |
| `UPLOADS_DIR` | `/tmp/cotizador-uploads` | Directorio para STL y gcode temporales |
| `PRUSA_LAYER_HEIGHT` | `0.20` | Layer height en mm para el slicing |

---

## 9. API Contracts

### Sin cambios en inputs

`POST /api/quote` body no cambia. El uploadId ya identifica el STL.

### Cambio en el response de `POST /api/quote`

Campo nuevo (no breaking — los clientes ignoran campos desconocidos):

```json
{
  "weightSource": "prusaslicer"
}
```

---

## 10. Edge Cases & Error Handling

| ID | Escenario | Comportamiento esperado |
|---|---|---|
| EC-001 | `PRUSASLICER_BIN` no existe o no es ejecutable | Fallback a N1. Log `warn`. `weightSource = 'n1'`. |
| EC-002 | PrusaSlicer termina con exit code ≠ 0 | Fallback a N1. Log `error` con stderr. |
| EC-003 | PrusaSlicer supera 60 segundos | `SIGKILL` al proceso. Fallback a N1. |
| EC-004 | El gcode no contiene la línea `; filament used [g]` | Fallback a N1. Log `warn`. |
| EC-005 | `gramosTotal` parseado es `NaN`, `Infinity` o `<= 0` | Fallback a N1. Log `warn` con el valor inválido. |
| EC-006 | El STL no está en disco al momento de cotizar (TTL expirado o restart) | Skip PrusaSlicer. Usar N1 con `stlAnalysis` del cache. `weightSource = 'n1'`. |
| EC-007 | `UPLOADS_DIR` no existe o no es escribible | Log `error` al arranque. Servicio funciona sin guardar STL → siempre N1. |
| EC-008 | Error al eliminar archivos temporales post-cotización | Log `warn`. No relanzar error. La cotización ya fue guardada. |

---

## 11. Open Questions

| ID | Pregunta | Responsable | Deadline |
|---|---|---|---|
| OQ-001 | ¿La imagen Docker de PrusaSlicer en Railway necesita GPU/display (headless)? Confirmar que `--export-gcode` funciona sin Xvfb en el AppImage de Linux. | Lucho (investigar al buildear el Dockerfile) | Antes de TASK de Docker |
| OQ-002 | ¿Qué versión mínima de PrusaSlicer garantiza el formato de output `; filament used [g]`? | Lucho | Antes de tests de integración |

---

## 12. Clarifications

### C-1: Desglose de gramos cuando PrusaSlicer es exitoso
**Type:** ambiguity
**Q:** Cuando PrusaSlicer calcula el gramosTotal, ¿qué hacemos con gramosInfill y gramosParedes en el desglose?
**A:** Ocultar gramosInfill y gramosParedes cuando weightSource='prusaslicer'. Solo mostrar la fila "Peso total estimado" con el valor de PrusaSlicer. Cuando es fallback N1, mostrar el desglose completo (infill + paredes + total) como en la actualidad.
**Impacto:** CotizacionResult mantiene los campos gramosInfill y gramosParedes (pueden ser 0 cuando PrusaSlicer los calcula), pero la UI y el PDF condicionan su visibilidad a weightSource.

### C-2: Comportamiento cuando falla la escritura del STL en disco
**Type:** edge case
**Q:** ¿Qué hace el upload si no puede guardar el STL en disco (disco lleno, permisos)?
**A:** Continuar sin guardar. El upload responde normalmente, la cotización posterior usará fallback N1. Log interno del error. El usuario no ve nada.
**Impacto:** EC-007 en la spec cubre este caso — confirmado que el comportamiento es degradado silencioso, no error hard.

### C-3: Layer height de PrusaSlicer
**Type:** assumption
**Q:** ¿A qué layer height imprime Denise normalmente?
**A:** 0.20mm es el estándar pero puede cambiar según la pieza.
**Impacto:** Layer height pasa a ser configurable via env var `PRUSA_LAYER_HEIGHT` (default `0.20`). Se agrega al listado de env vars en FR-010 y al comando CLI. Así Denise puede ajustarlo sin cambiar el Dockerfile.
