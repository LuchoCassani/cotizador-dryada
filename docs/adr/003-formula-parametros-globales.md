# ADR-003: Fórmula con Parámetros Globales

**Date**: 2026-06-13
**Status**: Accepted
**Feature**: formula-parametros-globales

## Context

`QuoteService` usaba valores hardcodeados para desperdicio, mano de obra y ganancia. Los mismos valores ya existían en `parametros_globales` (SQLite) desde SPEC-A, pero no se conectaban a la fórmula.

## Decision

1. Inyectar `IGlobalParametersRepository` como segunda dependencia en `QuoteService` (antes de `IQuoteRepository`).
2. Llamar `paramsRepo.get()` una sola vez al inicio de `calcularCotizacion()`.
3. Corregir la conversión EUR→USD en el adapter de `app.ts` (`precioGramo = cartucho / 750 * tasaEurUsd`).
4. El coeficiente de ganancia se aplica al subtotal completo: `precioUnitario = (material + manoObra + adicionales) * coeficiente`.
5. Actualización mínima del PDF: agregar fila "Mano de obra" para que el desglose no quede inconsistente con el precio final.

## Consequences

**Positivo:**
- Los precios generados reflejan los costos reales de Dryada.
- Cambiar desperdicio, mano de obra o ganancia desde la DB se refleja inmediatamente en nuevas cotizaciones.
- `IQuoteRepository`, rutas HTTP y schema SQLite no cambian.

**Negativo / Trade-offs:**
- El adapter llama `paramsRepo.get()` en cada petición de material (sin caché). Aceptable para el volumen actual.
- El coeficiente de ganancia no es visible al cliente en el PDF. Decisión intencional: es un parámetro interno de negocio.
- La amortización de impresora (visible en el Excel) no entra en esta fórmula — depende de la máquina seleccionada (SPEC-D).
