# ADR-001: SQLite con better-sqlite3 como capa de datos persistente

**Date**: 2026-06-13
**Status**: Accepted
**Feature**: sqlite-data-model

## Context

El cotizador utilizaba `prices.json` (fuente de datos estática de materiales) e `InMemoryQuoteRepository` (trazabilidad volátil). Esto bloqueaba dos necesidades reales: editar precios y costos sin intervención técnica, y la incorporación de 4 máquinas con costos distintos como entidades de primera clase.

Se necesitaba un mecanismo de persistencia que:
- Funcione sin infraestructura adicional (sin servidor de base de datos)
- Viva en un único archivo copiable entre máquinas (carpeta compartida de servidor)
- Soporte CRUD completo desde la UI de gestión
- Se integre con el stack Node.js + TypeScript existente

## Alternatives Considered

**Opción A: `better-sqlite3` (sincrónico)**
- Pros: 2-3× más rápido que drivers async en benchmarks, sin callback hell, cero overhead de async/await real, API simple y directa.
- Cons: módulo nativo (requiere compilación en `npm install`), las interfaces deben wrappear en `Promise.resolve()` para mantener contratos async.
- Constitution compatibility: aprobado explícitamente en `constitution.md`.

**Opción B: `sqlite3` (asincrónico)**
- Pros: no es módulo nativo en todas las plataformas, API naturalmente async.
- Cons: más lento, requiere callbacks o promisificación manual, más código para el mismo resultado.
- Constitution compatibility: no listado como dependencia aprobada.

**Opción C: Prisma ORM**
- Pros: migraciones automáticas, cliente tipado generado, excelente DX.
- Cons: agrega un generador de código externo, overhead de compilación, complejidad operativa. Innecesario para el volumen y uso interno de esta herramienta.
- Constitution compatibility: no listado como dependencia aprobada. Requeriría aprobación explícita.

## Decision

`better-sqlite3`. Es la única opción aprobada por la constitution con las características requeridas. El wrapper de `Promise.resolve()` para mantener interfaces async es una deuda mínima y aceptada.

## Consequences

**Positivo:**
- Performance superior para un servidor de uso interno con carga baja.
- API síncrona simplifica el código de repositorios.
- Un único archivo `.db` portable y copiable.

**Negativo:**
- Módulo nativo: requiere que el entorno tenga herramientas de compilación (node-gyp). En la mayoría de entornos modernos esto está resuelto automáticamente, pero puede fallar en entornos con Node.js mal configurado.
- Las interfaces exponen `Promise<T>` aunque la ejecución sea síncrona internamente. Esto puede confundir a futuros desarrolladores que no conozcan la decisión.
- Migración futura a PostgreSQL requiere reemplazar todas las implementaciones `Sqlite*Repository`. Las interfaces permanecen intactas.
