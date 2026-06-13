# Plan: Machine Selection

## Architecture

La feature atraviesa las 5 capas del stack en orden bottom-up: DB → repositorios → servicio → HTTP → frontend.

### Flujo de datos

```
Frontend                          Backend
--------                          -------
mount PasoCotizar
  └─ GET /api/machines ──────────► machinesRepo.getActivas()
       ◄── [{ id, nombre, ... }] ──┘
       renders <select>

user selects machine + material
  └─ POST /api/quote
       { maquinaId, materialId, ... } ──► QuoteService.calcularCotizacion()
                                              Promise.all([
                                                getMaterialById(materialId),
                                                paramsRepo.get(),
                                                machinesRepo.getById(maquinaId)  ← NUEVO
                                              ])
                                              guard: piezasPorDiaEstimadas > 0
                                              guard: machine !== null
                                              costoAmortizacionUSD = formula(machine, params, gramosTotal)
                                              costoBase = material + manoObra + amort + inicio
                                              precioFinal = costoBase * (1 + coef)
                                          quoteRepo.save(record incl. maquinaId)
       ◄── { ..., costoAmortizacionUSD, maquina: { id, nombre } }

frontend renders PasoResultado (nuevo row desglose)
frontend renders CotizacionPDF (nueva fila tabla)
```

### Patrones a respetar

- Toda la lógica de negocio permanece en `QuoteService`. El route handler de `/api/machines` es solo un thin wrapper.
- Los repositorios se instancian únicamente en `app.ts`.
- `QuoteService` depende solo de interfaces, no de implementaciones concretas.
- Nuevo `machinesRepo` se inyecta como 3er parámetro (antes de `quoteRepo`) para respetar el orden semántico: datos de entrada antes de datos de salida.

---

## Dependencies

Sin dependencias nuevas. El stack existente cubre todo:

| Recurso | Uso |
|---|---|
| `better-sqlite3` | Queries a `maquinas`, migration de `cotizaciones` y `parametros_globales` |
| `fastify` | Endpoint `GET /api/machines` |
| `React.useState` / `useEffect` | Fetch y selector de máquina en `PasoCotizar` |
| `vitest` | Tests nuevos en `quote.service.machine.test.ts` |

---

## Files Affected

### Backend — modificar

| Archivo | Cambio |
|---|---|
| `backend/src/repositories/machines.repository.ts` | [modify] Agregar interfaz `IMachinesRepository` con `getById` + `getActivas`, tipos `Maquina` y `MaquinaPublica` |
| `backend/src/repositories/sqlite-machines.repository.ts` | [modify] Implementar `getActivas()` (solo campos públicos, filtra `activa = 1`) |
| `backend/src/repositories/global-params.repository.ts` | [modify] Agregar `piezasPorDiaEstimadas: number` a `ParametrosGlobales` |
| `backend/src/repositories/sqlite-global-params.repository.ts` | [modify] Leer/escribir `piezas_por_dia_estimadas` |
| `backend/src/repositories/quote.repository.ts` | [modify] Agregar `maquinaId: string` a `QuoteRecord` |
| `backend/src/repositories/sqlite-quote.repository.ts` | [modify] Mapear `maquina_id` en INSERT y SELECT |
| `backend/src/services/quote.service.ts` | [modify] 4ta dependencia `machinesRepo`, guards EC-001/EC-004, fórmula amortización, `costoAmortizacionUSD` en result |
| `backend/src/db/init.ts` | [modify] Migrations aditivas: ALTER TABLE `parametros_globales` ADD `piezas_por_dia_estimadas`, ALTER TABLE `cotizaciones` ADD `maquina_id` |
| `backend/src/db/seed/parametros.seed.ts` | [modify] Agregar `piezasPorDiaEstimadas: 20` |
| `backend/src/app.ts` | [modify] Inyectar `machinesRepo` en `QuoteService`, registrar `/api/machines` route, actualizar JSON Schema de `POST /api/quote` para incluir `maquinaId` como campo requerido |
| `backend/tests/services/quote.service.test.ts` | [modify] Agregar `machinesRepo` mock a `makeRepos()` para que el constructor de 4 params no rompa los tests existentes |

### Backend — crear

| Archivo | Descripción |
|---|---|
| `backend/src/routes/machines.route.ts` | [create] Handler `GET /api/machines`: llama `machinesRepo.getActivas()`, devuelve array |
| `backend/tests/services/quote.service.machine.test.ts` | [create] Tests: fórmula amortización, EC-001 (maquinaId inválido), EC-002 (inactiva), EC-004 (piezasPorDiaEstimadas=0), NFR-004 (1 llamada a getById) |

### Frontend — modificar

| Archivo | Cambio |
|---|---|
| `frontend/src/types/index.ts` | [modify] Agregar interfaz `Maquina` (forma pública), `maquinaId: string` en request body, `costoAmortizacionUSD: number` + `maquina: { id, nombre }` en `CotizacionResult` |
| `frontend/src/services/api.ts` | [modify] Agregar `getMachines(): Promise<Maquina[]>` |
| `frontend/src/components/screens/PasoCotizar.tsx` | [modify] Fetch máquinas al montar, agregar `<select>` requerido, pasar `maquinaId` al body de la cotización |
| `frontend/src/components/screens/PasoResultado.tsx` | [modify] Agregar fila "Amortización máquina" en la tabla de desglose |
| `frontend/src/components/pdf/CotizacionPDF.tsx` | [modify] Agregar fila "Amortización máquina" entre "Mano de obra" y "Costo inicio" |

---

## Risks and Trade-offs

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| `PasoCotizar.tsx` tiene estructura desconocida — puede requerir refactor mayor para integrar el selector | Media | Medio | El componente sigue el patrón de `PasoResultado`; si hay divergencia se reporta como blocker en la tarea correspondiente |
| Migration SQLite con `DEFAULT ''` para `maquina_id` — rows históricas quedan con string vacío | Baja | Bajo | Documentado en spec §7. En dev se borra DB y se reinicia. Aceptable para uso interno. |
| Constructor `QuoteService` pasa de 3 a 4 params — rompe tests si `makeRepos()` no se actualiza primero | Alta | Alto | TASK de update de tests va antes que las tasks de servicio (dependencia explícita). |
| `getActivas()` es nuevo en `sqlite-machines.repository.ts` — puede necesitar verificar interfaz actual | Baja | Bajo | La interfaz se formaliza en la misma task que la implementación, no hay contrato previo roto. |

---

## Decision

Ver `docs/adr/004-machine-amortization-and-di-expansion.md`
