# ADR-005: PrusaSlicer CLI ejecutado en tiempo de cotización

**Date**: 2026-06-13
**Status**: Accepted
**Feature**: prusaslicer-integration

## Context

Para obtener estimaciones de peso de filamento más precisas que la fórmula geométrica de N1, se integra PrusaSlicer CLI en el backend. La decisión central es **cuándo ejecutar el slicer**: al momento del upload del STL o al momento de cotizar.

La precisión del peso depende de la densidad del material (`--filament-density`). Sin conocer qué material va a usar el empleado, no se puede pre-calcular el peso con precisión. El material se elige en el paso de cotización, no en el de upload.

## Alternatives Considered

### Opción A: Ejecutar PrusaSlicer al momento del upload
- **Pros:** Quote response más rápida (no hay slicing en el path crítico). El STL solo necesita estar en disco durante el upload.
- **Contras:** Sin el material seleccionado, PrusaSlicer debería correr con `--filament-density 1.0` y luego escalar por la densidad real del material. El escalado lineal por densidad no es exacto — PrusaSlicer ajusta internamente las rutas del extrusor según el perfil de material. Menor precisión que correrlo con la densidad real.
- **Veredicto:** Rechazada. La mayor precisión de N2 requiere la densidad real del material.

### Opción B: Ejecutar PrusaSlicer al momento de cotizar ← Elegida
- **Pros:** Usa la densidad exacta del material seleccionado → máxima precisión. El STL se guarda en disco en el upload y se elimina post-cotización.
- **Contras:** El tiempo de respuesta del POST /api/quote aumenta en 2-15 segundos dependiendo de la complejidad del STL. El STL debe persistir en disco entre upload y cotización (minutos).
- **Mitigación del tiempo:** El timeout de PrusaSlicer es 60 segundos; slicear una pieza típica de cotización tarda 2-8 segundos. Aceptable para una herramienta interna.
- **Mitigación de persistencia:** Si el STL no está (server restart, TTL expirado), el sistema cae en fallback a N1 automáticamente.

## Decision

Ejecutar PrusaSlicer CLI al momento de cotizar (Opción B). El STL se guarda en `os.tmpdir()/{uploadId}.stl` durante el upload y se elimina inmediatamente después de la cotización.

`PrusaSlicerService` implementa `IPrusaSlicerService` para permitir mocking en tests sin necesidad de tener PrusaSlicer instalado en el entorno de CI.

## Consequences

**Positivo:**
- Máxima precisión en la estimación de peso al usar la densidad real del material.
- El fallback a N1 garantiza disponibilidad aunque PrusaSlicer falle o no esté instalado.
- La interfaz `IPrusaSlicerService` desacopla la implementación y facilita el testing.

**Negativo:**
- El endpoint `POST /api/quote` es 2-15 segundos más lento cuando PrusaSlicer corre exitosamente. Para 2 usuarios internos con volumen bajo, es aceptable.
- Los STL deben persistir en disco efímero de Railway durante el tiempo entre upload y cotización. Un restart del contenedor entre ambos eventos activa el fallback a N1.
