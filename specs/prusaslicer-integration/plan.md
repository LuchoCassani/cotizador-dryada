# Plan: PrusaSlicer Integration

## Architecture

La feature toca cuatro áreas independientes que se conectan en `app.ts`:

### 1. Upload handler — guardar STL en disco

`upload.route.ts` ya tiene `programarLimpieza(uploadId)` que borra `{os.tmpdir()}/{uploadId}.stl` al expirar el TTL. La pieza que falta es el `fs.writeFile` antes del análisis. El cambio es de dos líneas.

El path usa `os.tmpdir()` (ya presente en el código) en vez de introducir `UPLOADS_DIR`. Para Railway/Docker, `/tmp` es efímero pero suficiente — los archivos duran minutos, no días.

### 2. PrusaSlicerService — nuevo servicio

```
IPrusaSlicerService
  └─ slice(stlPath: string, densidad: number): Promise<SliceResult>

PrusaSlicerService implements IPrusaSlicerService
  └─ spawn(PRUSASLICER_BIN, [...flags])
  └─ parsea {uploadId}.gcode → /; filament used \[g\] = ([\d.]+)/
  └─ en cualquier fallo → throw (el catch vive en QuoteService)
```

No tiene estado propio. Recibe la ruta del STL y la densidad del material, devuelve `{ gramosTotal }` o lanza excepción.

### 3. QuoteService — lógica de fallback

El servicio intenta PrusaSlicer primero. Si falla por cualquier causa (excepción, resultado inválido), cae a N1 silenciosamente:

```
const stlPath = path.join(os.tmpdir(), `${uploadId}.stl`)
let gramosTotal: number
let weightSource: 'prusaslicer' | 'n1'

if (stlFileExists) {
  try {
    ({ gramosTotal } = await prusaSlicerService.slice(stlPath, material.densidad))
    weightSource = 'prusaslicer'
    gramosInfill = 0; gramosParedes = 0  // C-1: ocultar desglose en UI
  } catch {
    // fallback silencioso
  }
}

if (weightSource !== 'prusaslicer') {
  gramosInfill = ...N1...
  gramosParedes = ...N1...
  gramosTotal = gramosInfill + gramosParedes
  weightSource = 'n1'
}
```

Después de calcular, el STL se borra de disco (fire-and-forget). El gcode temporal lo borra `PrusaSlicerService` internamente.

### 4. Frontend — display condicional

Solo en `PasoResultado.tsx` y `CotizacionPDF.tsx`: cuando `weightSource === 'prusaslicer'`, ocultar las filas de gramosInfill y gramosParedes y mostrar solo "Peso total estimado". El tipo `CotizacionResult` agrega `weightSource`.

---

## Dependencies

**Backend (sin cambios en package.json):**
- `child_process` — stdlib Node, ya disponible
- `fs/promises` — ya importado en `upload.route.ts`
- `path`, `os` — ya importados

**Nuevas variables de entorno:**

| Variable | Default | Uso |
|---|---|---|
| `PRUSASLICER_BIN` | `prusa-slicer` | Ruta al binario |
| `PRUSA_LAYER_HEIGHT` | `0.20` | Layer height en mm |

Se leen con `process.env.X ?? 'default'` (mismo patrón que `DB_PATH` en `app.ts`). No se introduce zod env validation en esta feature — queda para un refactor futuro.

---

## Files Affected

### Backend

| Archivo | Acción | Qué cambia |
|---|---|---|
| `backend/src/routes/upload.route.ts` | modify | Agregar `fs.writeFile(stlPath, buffer)` antes de `analizarStl` |
| `backend/src/services/prusa-slicer.service.ts` | create | `IPrusaSlicerService` + `PrusaSlicerService` |
| `backend/src/services/quote.service.ts` | modify | 5to param `IPrusaSlicerService`, lógica de fallback, campo `weightSource` |
| `backend/src/app.ts` | modify | Instanciar `PrusaSlicerService`, inyectar en `QuoteService` |
| `backend/tests/services/prusa-slicer.service.test.ts` | create | Tests unitarios con spawn mockeado |
| `backend/tests/services/quote.service.test.ts` | modify | Agregar mock `IPrusaSlicerService` al constructor |

### Frontend

| Archivo | Acción | Qué cambia |
|---|---|---|
| `frontend/src/types/index.ts` | modify | Agregar `weightSource: 'prusaslicer' \| 'n1'` a `CotizacionResult` |
| `frontend/src/components/screens/PasoResultado.tsx` | modify | Condicionar filas infill/paredes a `weightSource !== 'prusaslicer'` |
| `frontend/src/components/pdf/CotizacionPDF.tsx` | modify | Mismo condicional en el desglose del PDF |

---

## Risks and Trade-offs

### Riesgo 1 — PrusaSlicer headless en Docker (OQ-001)
PrusaSlicer puede requerir un display virtual (`Xvfb`) en Linux para correr en modo CLI. Si el AppImage de PrusaSlicer lo necesita, el Dockerfile del backend va a necesitar `xvfb-run`. Este riesgo no bloquea el desarrollo del código — el fallback a N1 garantiza que la app funciona aunque PrusaSlicer no esté disponible. Se resuelve al buildear el Dockerfile (spec `docker-railway-deploy`).

### Riesgo 2 — Formato de gcode entre versiones de PrusaSlicer
La línea `; filament used [g] = X.XX` es estándar desde PrusaSlicer 2.x. Si Denise instala una versión muy vieja o muy nueva que cambia el formato, el parse falla y se activa el fallback a N1 (no es error hard). Documentar la versión mínima en el Dockerfile.

### Riesgo 3 — Disco efímero en Railway
Railway tiene almacenamiento efímero en `/tmp` que persiste durante la vida del contenedor. Para cotizaciones rápidas (upload → quote en minutos) esto es suficiente. Si el contenedor se reinicia entre upload y quote, el STL no está → fallback a N1 automático vía EC-006.

### Trade-off — Sin env validation con zod
El spec dice "validar con zod al arranque". La implementación usa el patrón existente (`process.env.X ?? default`). Esto es una simplificación consciente: introducir zod para solo dos env vars nuevas requeriría crear la infraestructura de validación completa. Se puede agregar en la spec `docker-railway-deploy` donde hay más env vars nuevas y el esfuerzo se amortiza.

---

## Decision

Ver `docs/adr/005-prusaslicer-cli-quote-time.md`
