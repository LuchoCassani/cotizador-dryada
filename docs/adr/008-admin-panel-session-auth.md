# ADR-008: Admin Panel — Autenticación por Sesión en Memoria

**Date**: 2026-06-19
**Status**: Accepted
**Feature**: admin-panel

## Context

El cotizador es de acceso público: cualquiera con la URL puede cotizar. Al agregar un panel de administración para editar materiales, máquinas y parámetros globales, se necesita un mecanismo de autenticación que impida accesos no autorizados sin introducir complejidad operativa desproporcionada para una herramienta interna.

Los repositorios SQLite ya tienen CRUD completo implementado. La decisión arquitectónica central es cómo gestionar la identidad del admin entre requests.

## Alternatives Considered

### Opción A: JWT firmado con secret key

El login genera un JWT firmado con `JWT_SECRET` (env var). El backend verifica la firma en cada request sin estado en memoria. Sobrevive reinicios.

**Pro:** Stateless — el servidor no guarda nada. Sobrevive reinicios del VM.
**Contra:** Requiere `JWT_SECRET` adicional en `backend.env`. Un JWT emitido no se puede revocar antes de su expiración — si el admin cierra sesión, el token sigue siendo técnicamente válido hasta que expire. Agrega complejidad (librería JWT o implementación manual) innecesaria para una sesión con un único admin simultáneo.

### Opción B (elegida): Tokens de sesión en Map en memoria

El login genera un token hex-64 aleatorio, lo almacena en un `Map<token, expiresAt>` en memoria del proceso, y lo devuelve al cliente. Cada request protegido verifica la existencia y expiración del token en el Map. Revocación instantánea (borrar del Map).

**Pro:** Sin dependencias nuevas (`crypto` es built-in). Revocación real al cerrar sesión. Implementación simple y auditable. Compatible con el patrón de variables en memoria ya usado en el proyecto (`uploadCache`).
**Contra:** Las sesiones se pierden al reiniciar el servidor. El admin debe volver a loguearse tras un restart. Aceptable para una herramienta interna con reinicios infrecuentes.

## Decision

Se implementa la Opción B: sesiones en Map en memoria gestionadas por `AdminSessionService`.

La autenticación funciona en dos capas:
1. **Capa nginx** — Bearer `API_TOKEN` inyectado automáticamente para todas las rutas `/api/*` (ya existente).
2. **Capa admin** — Header `X-Admin-Token` con el token de sesión, verificado por un `preHandler` en todas las rutas `/api/admin/*` excepto el login.

El login se protege con rate limit de 5 req/IP/min para mitigar fuerza bruta. La comparación de `ADMIN_PASSWORD` usa `crypto.timingSafeEqual` para evitar timing attacks. El token de sesión se almacena en `sessionStorage` del browser (se borra al cerrar el tab).

`ADMIN_PASSWORD` es una variable de entorno independiente del `API_TOKEN`, gestionada por Dryada.

## Consequences

**Positivo:**
- Sin dependencias nuevas.
- Revocación inmediata al cerrar sesión.
- `ADMIN_PASSWORD` separada del `API_TOKEN` de infraestructura — cambiar una no afecta a la otra.
- `sessionStorage` garantiza que la sesión no persiste entre tabs ni reinicios del browser.

**Negativo:**
- Reiniciar el servidor invalida todas las sesiones activas. El admin debe volver a loguearse.
- Si el servidor tiene múltiples instancias (no es el caso con el VM único actual), las sesiones no se comparten entre procesos. No aplicable hoy, pero limita escalabilidad futura.
