# ADR-006: Docker Deploy Strategy — Backend Image Base y Extracción de PrusaSlicer

**Date**: 2026-06-14
**Status**: Accepted
**Feature**: docker-railway-deploy

## Context

El Cotizador Dryada necesita ser deployado en Railway. El backend tiene dos dependencias con requerimientos especiales de empaquetado:

1. **`better-sqlite3`**: módulo nativo que compila un binario `.node` con `node-gyp`. Requiere `python3`, `make` y `g++` en el entorno de build. Incompatible con musl (Alpine).
2. **PrusaSlicer CLI**: distribuido como AppImage Linux x64. Los AppImages usan FUSE, que no está disponible en Docker. Necesita extracción manual del filesystem squashfs.

La elección de imagen base y estrategia de extracción afecta tamaño de imagen, velocidad de build y confiabilidad del deploy.

## Alternatives Considered

### Opción A: Alpine para todo
- **Pro**: imagen más pequeña (~5MB base).
- **Contra**: `better-sqlite3` falla con musl (libc alternativa de Alpine). PrusaSlicer solo existe como binario glibc. Incompatibilidad fundamental — descartada.

### Opción B: Debian Slim + `--appimage-extract`
- **Pro**: método documentado oficialmente para AppImages sin FUSE.
- **Contra**: `--appimage-extract` requiere ejecutar el AppImage mismo, que falla en ARM64 (Exec format error) y en entornos sin FUSE. No reproducible en Mac Apple Silicon. Descartado tras validación local.

### Opción C (elegida): Debian Slim + `unsquashfs` con offset fijo
- **Pro**: extrae el squashfs directamente sin ejecutar el binario. Funciona en cualquier arquitectura host. Validado en contenedor Debian bookworm-slim headless sin display.
- **Contra**: el offset `193728` es específico de esta versión del AppImage (2.8.1 newer-distros). Si se actualiza PrusaSlicer, el offset podría cambiar y habría que re-validar.

## Decision

Usar `node:20-bookworm-slim` como imagen base para ambas etapas del backend (build y runtime). Para PrusaSlicer, descargar el AppImage `newer-distros x64` y extraerlo con `unsquashfs -o 193728`. El binario compilado de `better-sqlite3` viaja del stage build al runtime via `COPY --from=build /app/node_modules ./node_modules` — no se re-instala en runtime.

## Consequences

**Positivo:**
- Compatibilidad garantizada con `better-sqlite3` y PrusaSlicer en el mismo contenedor.
- Pipeline de build simple: un solo Dockerfile sin imágenes base personalizadas.
- Método de extracción validado localmente antes de integrar al Dockerfile de producción.

**Negativo:**
- Imagen final probablemente supera los 500MB originales de NFR-001 (PrusaSlicer + libs de sistema ~300-400MB adicionales). NFR-001 se ajusta a <1GB.
- El AppImage de ~300MB se descarga en cada build que no tenga caché de capas. Si Railway no cachea entre deploys, el build será lento (~2-3 minutos solo por la descarga).
- El offset `193728` de `unsquashfs` es frágil ante actualizaciones de PrusaSlicer — documentado como deuda técnica.
