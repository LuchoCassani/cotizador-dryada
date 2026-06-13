# Plan: Fórmula con Parámetros Globales

## Architecture

Este feature es un cambio de fórmula. No toca esquema SQLite, no agrega endpoints, no modifica interfaces de repositorio. Los cambios van en tres capas:

1. **Backend — lógica** (`quote.service.ts`): nueva fórmula + nuevo campo en resultado
2. **Backend — composición** (`app.ts`): inyección de `paramsRepo` + corrección EUR→USD en adapter
3. **Frontend — tipos + PDF** (`types/index.ts` + `CotizacionPDF.tsx`): campo nuevo + fila en desglose

```
IPricesRepository          IGlobalParametersRepository    IQuoteRepository
       ↓                            ↓                           ↓
              QuoteService.calcularCotizacion()
                  ↓
          CotizacionResult  (+ costoManoObraUSD)
                  ↓
          POST /api/quote response
                  ↓
          CotizacionPDF.tsx (+ fila "Mano de obra")
```

## Fórmula completa implementada

```typescript
const params = await this.paramsRepo.get();

// Peso
const gramosInfill  = volumenCm3 * FILL_RATIO * material.densidad;
const gramosParedes = areaCm2 * (N_PERIMETROS * ANCHO_LINEA_CM) * material.densidad;
const gramosRaw     = gramosInfill + gramosParedes;
const gramosTotal   = gramosRaw * (1 + params.desperdicioPct);

// Costos
const costoMaterialUSD  = gramosTotal * material.precioGramo;  // precioGramo ya en USD (adapter corregido)
const costoManoObraUSD  = params.tarifaManoObraUsdHora * params.horasPorPieza;
const costoInicioUSD    = await this.pricesRepo.getCostoInicio();  // costosAdicionalesUsd
const costoBase         = costoMaterialUSD + costoManoObraUSD + costoInicioUSD;
const precioUnitarioUSD = costoBase * params.coeficienteGanancia;
const precioFinalUSD    = precioUnitarioUSD * input.cantidad;
```

## Adapter EUR→USD (app.ts)

El adapter llama a `paramsRepo.get()` una vez por petición y reutiliza el resultado:

```typescript
const pricesAdapter: IPricesRepository = {
  getMateriales: async () => {
    const [all, params] = await Promise.all([materialsRepo.getAll(), paramsRepo.get()]);
    return all.filter(m => m.activo).map(m => ({
      id: m.id,
      nombre: m.nombre,
      precioGramo: (m.precioPorCartucho750gEUR / 750) * params.tasaEurUsd,
      densidad: m.densidadGCm3,
    }));
  },
  getMaterialById: async (id) => {
    const [m, params] = await Promise.all([materialsRepo.getById(id), paramsRepo.get()]);
    if (!m) return null;
    return { id: m.id, nombre: m.nombre,
             precioGramo: (m.precioPorCartucho750gEUR / 750) * params.tasaEurUsd,
             densidad: m.densidadGCm3 };
  },
  getCostoInicio: async () => {
    const params = await paramsRepo.get();
    return params.costosAdicionalesUsd;
  },
};
```

## Tests

`backend/tests/services/quote.service.test.ts` — mocks de las 3 interfaces. Tests:

1. `gramosTotal` incluye `desperdicioPct` (FR-002)
2. `costoManoObraUSD = tarifaHora * horasPorPieza` (FR-003)
3. `precioUnitarioUSD = costoBase * coeficiente` (FR-004)
4. `precioFinalUSD = precioUnitario * cantidad` (FR-004)
5. `desperdicioPct = 0` → `gramosTotal = gramosRaw` (EC-004)
6. Material no encontrado → lanza error (regresión)
7. `params.get()` se llama una sola vez por cotización (NFR-004)

## Files Affected

**Modificar:**
- `backend/src/services/quote.service.ts`
- `backend/src/app.ts`
- `frontend/src/types/index.ts`
- `frontend/src/components/pdf/CotizacionPDF.tsx`

**Crear:**
- `backend/tests/services/quote.service.test.ts`

**Sin cambios:**
- `backend/src/repositories/prices.repository.ts`
- `backend/src/repositories/global-params.repository.ts`
- Rutas HTTP, `IQuoteRepository`, seed data, schema SQLite

## Risks

**Bajo: `precioUnitarioUSD` ahora incluye ganancia.** El PDF lo etiqueta "Precio unitario" — semánticamente correcto. El cliente ve el precio de venta, no el costo. No hay confusión.

**Bajo: adapter llama `paramsRepo.get()` en cada petición.** `better-sqlite3` es síncrono y rápido; sin caching en N1. Aceptable para el volumen de uso de Dryada. SPEC-E puede agregar caché en memoria si se necesita.

**Ninguno: cambio breaking en API.** `costoManoObraUSD` es un campo nuevo en la respuesta — el frontend lo consume en el PDF pero no rompe clientes existentes.

## Decision

Ver clarificaciones en `specs/formula-parametros-globales/spec.md` §11.
