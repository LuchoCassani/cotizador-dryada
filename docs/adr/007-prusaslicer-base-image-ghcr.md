# ADR-007: PrusaSlicer Base Image en GitHub Container Registry

**Date**: 2026-06-14
**Status**: Accepted
**Feature**: prusaslicer-base-image

## Context

Cada deploy del backend (`railway up --service backend`) reconstruye la imagen Docker completa, incluyendo la descarga del AppImage de PrusaSlicer (~300MB) y su extracción con `unsquashfs`. Esta operación toma ~10 minutos de build en Railway y consume créditos de cómputo significativos. Con el plan Hobby de Railway ($5/mes, $5 de crédito incluido), el crédito se agota en pocas sesiones de desarrollo activo.

PrusaSlicer no cambia entre deploys del backend — solo cambia cuando hay una nueva versión validada del slicer, lo cual ocurre infrecuentemente.

## Alternatives Considered

**Alternativa: GitHub Actions build cache (`cache-from: type=gha`)**
- Cachearía las capas de PrusaSlicer en el cache de GitHub Actions.
- No aplica: `railway up` sube el contexto a los builders de Railway, que no tienen acceso al cache de GitHub Actions. El build en Railway siempre parte desde cero.

**Alternativa: Imagen pre-construida en Docker Hub**
- Similar a GHCR pero en un registro externo.
- No elegida: GHCR está integrado con el mismo repositorio de GitHub, usa `GITHUB_TOKEN` sin secrets adicionales, y es gratuito para repos públicos.

No hay otras alternativas viables que logren el objetivo sin complejidad adicional significativa.

## Decision

Extraer PrusaSlicer a una imagen base separada publicada en GHCR como `ghcr.io/luchocassani/dryada-prusaslicer-base`. El backend Dockerfile referencia esta imagen en su etapa runtime con `FROM ghcr.io/luchocassani/dryada-prusaslicer-base:latest`. La imagen base se buildea manualmente via `workflow_dispatch` en GitHub Actions cuando cambia la versión de PrusaSlicer.

La imagen base usa un multi-stage build interno: stage `extractor` descarga y extrae el AppImage; stage `base` copia solo `/opt/prusaslicer` y las libs de sistema, sin las herramientas de build.

## Consequences

**Positivo:**
- `railway up --service backend` pasa de ~10 minutos a < 2 minutos.
- El crédito mensual de Railway ($5) alcanza para uso normal del equipo de desarrollo.
- La imagen base versionada (`2.8.1`, `2.9.0`, etc.) permite rollback instantáneo si una actualización de PrusaSlicer rompe el backend.

**Negativo:**
- El primer deploy después de implementar este cambio requiere ejecutar manualmente el workflow de la imagen base antes de correr `railway up`.
- El tag `latest` en GHCR es mutable — una imagen base rota rompe el próximo deploy. Mitigado por los tags versionados para rollback.
- Se agrega un paso operacional nuevo: cuando se actualiza PrusaSlicer, primero se buildea la imagen base, luego se actualiza el FROM en el Dockerfile y se redeploya.
