# Tasks: PrusaSlicer Integration

**Feature**: prusaslicer-integration
**Plan**: specs/prusaslicer-integration/plan.md
**Generated**: 2026-06-13

---

## TASK-001: Definir IPrusaSlicerService y SliceResult

**Status**: completed
**Requirements**: FR-002, NFR-002
**Complexity**: S
**Depends on**: none
**Files**: `backend/src/services/prusa-slicer.service.ts`

### Description
Crear el archivo `prusa-slicer.service.ts` con el tipo `SliceResult { gramosTotal: number }` y la interfaz `IPrusaSlicerService { slice(stlPath: string, densidad: number): Promise<SliceResult> }`. Solo el contrato — sin implementación concreta todavía. Seguir el patrón de las interfaces de repositorios existentes (prefijo I, en el mismo archivo que la implementación).

### Validation
`tsc --noEmit` en backend sin errores. El archivo exporta `SliceResult` e `IPrusaSlicerService`.

---

## TASK-002: Guardar STL en disco en el upload handler

**Status**: completed
**Requirements**: FR-001, FR-009, EC-007, C-2
**Complexity**: S
**Depends on**: none
**Files**: `backend/src/routes/upload.route.ts`

### Description
Después de obtener el `buffer` del archivo y antes de llamar a `analizarStl(buffer)`, guardar el archivo en `path.join(os.tmpdir(), `${uploadId}.stl`)`. El `uploadId` viene del resultado de `analizarStl`, entonces el orden correcto es: (1) llamar `analizarStl`, (2) guardar el STL con `fs.writeFile(stlPath, buffer)` en un try/catch silencioso. Si la escritura falla, loguear el error con `fastify.log.error` y continuar — el upload responde normalmente y la cotización posterior usará fallback N1 (C-2). La función `programarLimpieza` ya existe y ya tiene el código de borrado del STL — no modificarla.

### Validation
`tsc --noEmit` sin errores. Al subir un STL, el archivo `{os.tmpdir()}/{uploadId}.stl` existe en disco inmediatamente después del upload.

---

## TASK-003: Implementar PrusaSlicerService

**Status**: completed
**Requirements**: FR-003, FR-004, NFR-001, NFR-003, NFR-005, NFR-006, EC-001, EC-002, EC-003, EC-004, EC-005, EC-006
**Complexity**: M
**Depends on**: TASK-001
**Files**: `backend/src/services/prusa-slicer.service.ts`

### Description
Agregar la clase `PrusaSlicerService implements IPrusaSlicerService` al mismo archivo. El constructor recibe `bin: string` (ruta al binario) y `layerHeight: string` (ej: `"0.20"`).

El método `slice(stlPath, densidad)`:
1. Construye el path de salida del gcode: `stlPath.replace('.stl', '.gcode')`.
2. Lanza `child_process.spawn` con el binario y estos flags en orden: `--fill-density`, `10%`, `--perimeters`, `2`, `--nozzle-diameter`, `0.40`, `--layer-height`, `{layerHeight}`, `--filament-density`, `{densidad}`, `--export-gcode`, `--output`, `{gcodePath}`, `{stlPath}`.
3. Aplica timeout de 60 segundos: si el proceso no termina, hacer `proceso.kill('SIGKILL')` y lanzar un `Error('timeout')`.
4. Si el exit code es distinto de 0, lanzar `Error('exit code {code}')`.
5. Leer el gcode con `fs.readFile(gcodePath, 'utf-8')`.
6. Buscar la línea con regex `/^;\s*filament used \[g\]\s*=\s*([\d.]+)/m`. Si no se encuentra, lanzar `Error('parse failed')`.
7. Parsear el valor como `number`. Si es `NaN`, `<= 0` o `Infinity`, lanzar `Error('invalid value')`.
8. En un bloque `finally`, borrar el gcode con `fs.unlink(gcodePath).catch(() => {})` (fire-and-forget, no relanzar).
9. Devolver `{ gramosTotal }`.

Cualquier excepción lanzada por `slice()` se propaga al llamador (QuoteService es quien atrapa y hace fallback).

### Validation
`tsc --noEmit` sin errores. La clase se puede instanciar con `new PrusaSlicerService('prusa-slicer', '0.20')`.

---

## TASK-004: Actualizar QuoteService — lógica PrusaSlicer y fallback

**Status**: completed
**Requirements**: FR-005, FR-006, FR-007, FR-008, EC-006, EC-008, C-1
**Complexity**: M
**Depends on**: TASK-001, TASK-003
**Files**: `backend/src/services/quote.service.ts`

### Description
1. Agregar `IPrusaSlicerService` como 5to parámetro del constructor (después de `quoteRepo`).
2. Agregar `weightSource: 'prusaslicer' | 'n1'` a la interfaz `CotizacionResult`.
3. En `calcularCotizacion()`, después de resolver material/params/machine, agregar la lógica de slicing:

```typescript
const stlPath = path.join(os.tmpdir(), `${input.stlAnalysis.uploadId}.stl`)
let gramosTotal: number
let gramosInfill = 0
let gramosParedes = 0
let weightSource: 'prusaslicer' | 'n1' = 'n1'

let stlExists = false
try { await fs.access(stlPath); stlExists = true } catch {}

if (stlExists) {
  try {
    const result = await this.prusaSlicerService.slice(stlPath, material.densidad)
    gramosTotal = result.gramosTotal * (1 + params.desperdicioPct)
    weightSource = 'prusaslicer'
    // gramosInfill y gramosParedes quedan en 0 (C-1: no mostrar desglose en UI)
  } catch {
    // fallback a N1
  }
}

if (weightSource === 'n1') {
  gramosInfill  = volumenCm3 * FILL_RATIO * material.densidad
  gramosParedes = areaCm2 * (N_PERIMETROS * ANCHO_LINEA_CM) * material.densidad
  gramosTotal   = (gramosInfill + gramosParedes) * (1 + params.desperdicioPct)
}
```

4. Eliminar el STL después de cotizar (fire-and-forget): `fs.unlink(stlPath).catch(() => {})`.
5. Incluir `weightSource` en el objeto retornado.
6. Importar `path` y `fs/promises` al inicio del archivo.

### Validation
`tsc --noEmit` sin errores. Los tests existentes de QuoteService siguen pasando después de agregar el mock de `IPrusaSlicerService` en TASK-010.

---

## TASK-005: Actualizar app.ts — instanciar y conectar PrusaSlicerService

**Status**: completed
**Requirements**: FR-005, FR-010
**Complexity**: S
**Depends on**: TASK-004
**Files**: `backend/src/app.ts`

### Description
1. Leer las variables de entorno: `const PRUSASLICER_BIN = process.env.PRUSASLICER_BIN ?? 'prusa-slicer'` y `const PRUSA_LAYER_HEIGHT = process.env.PRUSA_LAYER_HEIGHT ?? '0.20'`.
2. Instanciar: `const prusaSlicerService = new PrusaSlicerService(PRUSASLICER_BIN, PRUSA_LAYER_HEIGHT)`.
3. Actualizar la instanciación de `QuoteService` para incluirlo como 5to argumento: `new QuoteService(pricesAdapter, paramsRepo, machinesRepo, quoteRepo, prusaSlicerService)`.

### Validation
`tsc --noEmit` sin errores. El servidor arranca sin errores con `npm run dev`.

---

## TASK-006: Agregar weightSource a tipos del frontend

**Status**: completed
**Requirements**: FR-007
**Complexity**: S
**Depends on**: none
**Files**: `frontend/src/types/index.ts`

### Description
Agregar el campo `weightSource: 'prusaslicer' | 'n1'` a la interfaz `CotizacionResult`. Seguir el mismo patrón de los demás campos existentes.

### Validation
`tsc -b` en frontend sin errores.

---

## TASK-007: Display condicional en PasoResultado

**Status**: completed
**Requirements**: FR-007, C-1
**Complexity**: S
**Depends on**: TASK-006
**Files**: `frontend/src/components/screens/PasoResultado.tsx`

### Description
En la tabla de desglose, condicionar la visibilidad de las filas "Gramos infill" y "Gramos paredes" a `result.weightSource !== 'prusaslicer'`. Las dos filas se envuelven en `{result.weightSource !== 'prusaslicer' && (...)}`. La fila "Peso total estimado" se muestra siempre. No agregar ningún indicador de texto ni badge extra — el cambio es solo en la visibilidad de las filas.

### Validation
`tsc -b` en frontend sin errores. Cuando `weightSource = 'prusaslicer'`, las filas de infill y paredes no aparecen en el desglose; cuando `weightSource = 'n1'`, aparecen normalmente.

---

## TASK-008: Display condicional en CotizacionPDF

**Status**: completed
**Requirements**: FR-007, C-1
**Complexity**: S
**Depends on**: TASK-006
**Files**: `frontend/src/components/pdf/CotizacionPDF.tsx`

### Description
Mismo condicional que TASK-007 pero en el PDF. Las `<View style={s.tr}>` de "Gramos infill" y "Gramos paredes" se envuelven en `{weightSource !== 'prusaslicer' && (...)}`. Agregar `weightSource` al destructuring de `quoteResult` al inicio del componente. La fila de "Peso total estimado" se muestra siempre.

### Validation
`tsc -b` en frontend sin errores. El componente `CotizacionPDF` compila con el nuevo campo.

---

## TASK-009: Tests unitarios para PrusaSlicerService

**Status**: completed
**Requirements**: NFR-004, EC-001, EC-002, EC-003, EC-004, EC-005, EC-006
**Complexity**: M
**Depends on**: TASK-003
**Files**: `backend/tests/services/prusa-slicer.service.test.ts`

### Description
Crear el archivo de tests con al menos estos casos. Usar `vi.mock('child_process')` y `vi.mock('fs/promises')` para evitar ejecución real:

1. **Caso éxito**: spawn retorna exit code 0, readFile devuelve gcode con `; filament used [g] = 12.45` → `slice()` resuelve `{ gramosTotal: 12.45 }`.
2. **EC-001 (binario no encontrado)**: spawn emite evento `'error'` con `code: 'ENOENT'` → `slice()` lanza.
3. **EC-002 (exit code ≠ 0)**: spawn emite `'close'` con código 1 → `slice()` lanza.
4. **EC-003 (timeout)**: spawn no emite `'close'` en 60s → `slice()` lanza. (Usar `vi.useFakeTimers()` para avanzar el tiempo.)
5. **EC-004 (línea no encontrada)**: readFile devuelve gcode sin la línea `filament used [g]` → `slice()` lanza.
6. **EC-005 (valor inválido)**: readFile devuelve `; filament used [g] = 0` → `slice()` lanza.
7. **Limpieza**: en el caso éxito, verificar que `fs.unlink` fue llamado con el path del gcode.

### Validation
`npm test -- --run` pasa todos los tests nuevos. Total de tests ≥ 60.

---

## TASK-010: Actualizar tests de QuoteService con mock de IPrusaSlicerService

**Status**: completed
**Requirements**: NFR-004
**Complexity**: S
**Depends on**: TASK-004
**Files**: `backend/tests/services/quote.service.test.ts`, `backend/tests/services/quote.service.machine.test.ts`

### Description
En ambos archivos de tests de QuoteService, agregar un mock de `IPrusaSlicerService` al helper `makeRepos()` o donde se construya el servicio. El mock debe tener `slice: vi.fn()` que por defecto lanza una excepción (para que los tests existentes sigan usando el path N1 sin cambios). Actualizar el constructor de `QuoteService` en cada test para pasar el mock como 5to argumento. No modificar los assertions existentes — los tests deben seguir pasando con el fallback a N1.

### Validation
`npm test -- --run` pasa todos los tests existentes sin modificar ningún assertion. El constructor de QuoteService en los tests acepta 5 argumentos.
