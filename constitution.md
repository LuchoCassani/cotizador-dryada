# Constitution — Cotizador Dryada

Principios y restricciones no negociables. Este archivo tiene precedencia sobre `CLAUDE.md` ante cualquier conflicto.

---

## Architecture

- Monorepo con dos servicios separados: `backend/` (Fastify) y `frontend/` (React/Vite). Nunca mezclar código entre ellos salvo tipos TypeScript compartidos.
- Toda lógica de negocio y cálculo (gramos, precio, complejidad STL) vive en el backend. Si hay cálculos en el frontend, están mal.
- El procesamiento del STL (volumen, área superficial, detección de complejidad, validaciones) ocurre exclusivamente en `backend/src/services/stl-processor.ts`.
- Los repositorios se instancian en un único lugar: `backend/src/app.ts`. Ningún servicio ni ruta instancia repositorios concretos directamente.
- Los servicios solo hablan con interfaces (`IPricesRepository`, `IQuoteRepository`, `IMachinesRepository`). Nunca importan implementaciones concretas.
- Persistencia: SQLite vía `better-sqlite3`. Reemplaza `prices.json` e `InMemoryQuoteRepository`. Un único archivo `.db` en la carpeta compartida del servidor.
- El modelo de máquinas incluye: nombre, capacidad (x, y, z en mm), costo de compra, meses de amortización. Hay 4 máquinas configurables (seed inicial). La selección de máquina es el paso 0 de cualquier cotización.
- El PDF se genera en el frontend con `@react-pdf/renderer`. El backend solo recibe el base64 para adjuntarlo al email.

## Testing

- Framework: `vitest`.
- Cobertura mínima del 80% para toda la lógica de negocio: `stl-processor.ts`, `quote.service.ts`, y todos los repositorios SQLite.
- No testear UI: sin tests de componentes React, PDF ni visualización 3D.
- Tests unitarios obligatorios para servicios y repositorios. Tests de integración para rutas Fastify usando SQLite real (no mocks de base de datos).
- Un test que falla bloquea el merge. No se saltean tests con `.skip` sin justificación documentada en el test.

## Security

- Bearer token estático en todas las rutas `/api/*` (`API_TOKEN` env var). En desarrollo local sin `API_TOKEN` seteado, el hook se omite.
- Rate limiting global: 60 req/IP/min. Por endpoint: `POST /api/upload` → 10 req/IP/min, `POST /api/quote/:id/email` → 5 req/IP/min.
- Límite máximo de triángulos en el parser STL: 5.000.000. Archivos que lo superen se rechazan antes de entrar al loop.
- Todos los errores retornan `{ error: string, code: string }`. Nunca exponer stack traces ni mensajes internos al cliente.
- Todas las credenciales en variables de entorno. Cero valores hardcodeados. El `.env` no se versiona.
- Validación de payloads con JSON Schema en todas las rutas Fastify (`additionalProperties: false`). Sin rutas sin schema.
- Security headers HTTP en nginx: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`.
- La herramienta es interna. Antes de exponer la URL fuera de la red privada, el checklist de `specs/security-sdd.md` § 3 debe estar completado.

## Allowed Dependencies

### Backend
| Paquete | Propósito |
|---|---|
| `fastify`, `@fastify/cors`, `@fastify/multipart`, `@fastify/rate-limit` | HTTP server y plugins |
| `better-sqlite3` | Persistencia SQLite |
| `nodemailer` | Email SMTP |
| `uuid` | Generación de IDs |
| `zod` | Validación de variables de entorno al arranque |
| `vitest` | Tests |

### Frontend
| Paquete | Propósito |
|---|---|
| `react`, `react-dom` | UI |
| `vite`, `@vitejs/plugin-react` | Build y dev server |
| `tailwindcss` v4 | Estilos |
| `three`, `@react-three/fiber`, `@react-three/drei` | Visor 3D |
| `@react-pdf/renderer` | Generación de PDF |
| `@tabler/icons-react` | Iconografía |

**Proceso para nuevas dependencias:** aprobación explícita del usuario antes de instalar. Justificar por qué no alcanza con las deps existentes.

## Code Standards

- TypeScript estricto: `"strict": true` en todos los `tsconfig`. Sin `any`, sin `as unknown as X` sin comentario que explique por qué.
- Nombres de dominio en español: `cotizacion`, `material`, `maquina`, `empleado`, `precioFinal`.
- Nombres de infraestructura en inglés: `service`, `repository`, `handler`, `processor`.
- Interfaces con prefijo `I`: `IPricesRepository`, `IMachinesRepository`.
- Implementaciones describen su mecanismo: `SqlitePricesRepository`, `SqliteQuoteRepository`.
- Sin comentarios que expliquen el qué. Solo comentar el por qué cuando el razonamiento no es obvio.
- Todos los valores monetarios intermedios en USD. La conversión a pesos ocurre exclusivamente en la respuesta final al frontend.
- Funciones: máximo 50 líneas. Archivos: máximo 300 líneas.
- Nombres de archivo: kebab-case (`quote.service.ts`, `stl-processor.ts`).
- Funciones y variables: camelCase. Clases e interfaces: PascalCase. Constantes de configuración: SCREAMING_SNAKE_CASE.

## Process

- Toda feature no trivial pasa por el ciclo SDD completo: specify → clarify → plan → tasks → implement → validate.
- No se implementa sin spec aprobada.
- No se salta la clarificación. La ambigüedad en specs se convierte en bugs.
- Una tarea por vez. No batch-implementar múltiples tareas en un solo paso.
- Blockers se reportan, no se workaround-ean. Si una tarea necesita algo fuera de su scope, se para y se reporta.
- Después de cada commit: actualizar `tasks.json` y `checklist.md` según R17 en `rules.md`.
