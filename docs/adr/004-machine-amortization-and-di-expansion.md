# ADR-004: Amortización de máquina y expansión del constructor QuoteService

**Date**: 2026-06-13
**Status**: Accepted
**Feature**: machine-selection

## Context

La fórmula de cotización ignoraba el costo de amortización de la impresora 3D. El Excel de referencia (hoja "Otros costos", celda C14) calcula una amortización por pieza que escala con el peso de la pieza y la producción diaria estimada. La DB ya tenía la tabla `maquinas` con `costo_usd` y `meses_amortizacion`. Faltaba:

1. Exponer las máquinas al frontend via HTTP.
2. Que el frontend permita seleccionar una máquina antes de cotizar.
3. Que `QuoteService` use la máquina seleccionada para calcular el costo de amortización.
4. Persistir `maquina_id` en la tabla `cotizaciones`.

## Alternatives Considered

**Alternativa A: `machinesRepo` como 3er parámetro del constructor (elegida)**
- `QuoteService(pricesRepo, paramsRepo, machinesRepo, quoteRepo)`
- Orden semántico: repos de entrada antes de repos de salida.
- Los mocks de tests existentes se actualizan en una task dedicada.

**Alternativa B: parámetro opcional con stub**
- `machinesRepo` con valor default que retorna null.
- Permitiría que los tests viejos no cambien.
- Rechazada: los stubs defaults son una forma de compatibilidad hacia atrás que la constitution desaconseja. Si el servicio requiere una máquina para calcular, que lo exija explícitamente.

**Para `IMachinesRepository` y `GET /api/machines`:**
Se evaluó si el endpoint podía bypasear el repositorio y acceder a la DB directamente desde el route handler. Rechazado: viola el principio de la constitution de que los servicios/rutas nunca instancian implementaciones concretas ni acceden directamente a la DB.

## Decision

- `QuoteService` recibe `IMachinesRepository` como 3er parámetro de constructor.
- `IMachinesRepository` expone dos métodos: `getById(id)` para el servicio y `getActivas()` para el endpoint HTTP.
- `getById()` retorna `null` si la máquina no existe o está inactiva (EC-001/EC-002 unificados).
- La fórmula de amortización replica exactamente la celda C14 del Excel:
  ```
  costoAmortizacionUSD = (costoUsd / meses / 30 / piezasPorDiaEstimadas) * (gramosTotal / 10)
  ```
- `piezasPorDiaEstimadas` se agrega a `parametros_globales` con seed 20 (coincide con el Excel).
- La migración de `cotizaciones` usa `DEFAULT ''` para compatibilidad SQLite con `ADD COLUMN NOT NULL`.
- Tests existentes se actualizan para incluir el nuevo mock; tests de la lógica de máquina van en un archivo separado.

## Consequences

**Positivos:**
- El costo de amortización de la impresora queda incluido en el precio, alineando el cotizador con el modelo del Excel.
- La fórmula es configurable: cambiar `piezasPorDiaEstimadas` en parámetros ajusta la amortización sin tocar código.
- `IMachinesRepository` sigue el mismo patrón que `IMaterialsRepository` — consistencia arquitectural.

**Negativos/Tradeoffs:**
- Todos los tests existentes de `QuoteService` necesitan agregar el 4to mock. Es un cambio mecánico pero inevitable.
- Las cotizaciones históricas en la DB quedan con `maquina_id = ''`. Aceptable para uso interno; en un sistema multi-tenant requeriría una estrategia de backfill.
- `GET /api/machines` no expone `costoUsd` ni `mesesAmortizacion` — si en el futuro la UI necesita esos datos para mostrar info de la máquina, habrá que agregar un endpoint o ampliar la respuesta.
