# Software Design Description — Seguridad
## Cotizador Dryada

**Versión:** 1.0  
**Fecha:** 2026-05-12  
**Estado:** Implementado (N1)

---

## 1. Contexto y modelo de amenaza

La herramienta es de uso interno pero está hosteada en Railway con una URL pública. El perfil de amenaza es bajo-medio: no maneja dinero real ni datos sensibles de clientes, pero sí controla el envío de emails desde una cuenta Gmail corporativa y acepta archivos de hasta 50MB en un endpoint público.

**Actores de amenaza considerados:**
- **Scanner automático:** bots que descubren URLs públicas y prueban exploits conocidos
- **Usuario malicioso externo:** alguien que encuentra la URL e intenta abusar del servicio
- **Usuario interno descuidado:** empleado que sube un STL malformado o enorme

**Fuera de scope en N1:**
- Ataques de estado-nación o APTs
- Inyección SQL (no hay base de datos en N1)
- XSS persistente (no hay almacenamiento de HTML generado por usuarios)

---

## 2. Controles implementados

### 2.1 Autenticación — Bearer token estático

**Problema:** sin autenticación, cualquier persona con la URL puede usar la API ilimitadamente.

**Solución:** token estático compartido entre backend y frontend, validado en todas las rutas `/api/*`.

**Backend (`server.ts`):**
```typescript
app.addHook('onRequest', async (request, reply) => {
  if (!API_TOKEN) return; // modo dev: sin API_TOKEN seteado → sin restricción
  if (!request.routeOptions.url?.startsWith('/api/')) return;
  const authHeader = request.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
    return reply.status(401).send({ error: 'No autorizado.', code: 'UNAUTHORIZED' });
  }
});
```

**Frontend (`api.ts`):**
```typescript
const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined
function authHeaders() {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}
}
```

**Variables de entorno requeridas:**

| Servicio | Variable | Descripción |
|---|---|---|
| backend | `API_TOKEN` | Token secreto. Generar con `openssl rand -hex 32`. |
| frontend (build time) | `VITE_API_TOKEN` | El mismo token. Se hornea en el bundle de Vite. |

**Comportamiento por entorno:**

| Entorno | `API_TOKEN` seteado | Comportamiento |
|---|---|---|
| Desarrollo local | No | Sin restricción. El hook se omite. |
| Producción (Railway) | Sí | Toda request sin el header correcto → 401 |

> **Nota de seguridad:** `VITE_API_TOKEN` queda visible en el bundle JavaScript del frontend (como toda variable `VITE_*`). Esto es aceptable para una herramienta interna: el token protege contra acceso no autorizado externo, no contra ingeniería inversa del bundle por parte de un empleado.

---

### 2.2 Rate limiting

**Problema:** sin límites de velocidad, un atacante puede saturar los endpoints con requests concurrentes.

**Implementación:** `@fastify/rate-limit` con límites globales y por endpoint.

| Endpoint | Límite | Ventana | Razón |
|---|---|---|---|
| Global (todas las rutas) | 60 req/IP | 1 minuto | Límite base razonable para uso interno |
| `POST /api/upload` | 10 req/IP | 1 minuto | Endpoint costoso: parseo STL + escritura en disco |
| `POST /api/quote/:id/email` | 5 req/IP | 1 minuto | Previene uso como relay de spam |

**Respuesta al superar el límite:** HTTP 429 con `{ error: "...", code: "RATE_LIMIT_EXCEEDED" }`.

---

### 2.3 Protección contra DoS en el parser STL

**Problema:** el formato STL binario declara `numTriangles` como uint32 (hasta ~4 mil millones). Un archivo malicioso de 84 bytes puede hacer que el servidor intente allocar gigabytes de RAM.

**Solución:** límite máximo de triángulos antes de entrar al loop de parseo.

```typescript
const MAX_TRIANGLES = 5_000_000;

function parseBinary(buffer: Buffer): Triangle[] {
  const numTriangles = buffer.readUInt32LE(80);
  if (numTriangles > MAX_TRIANGLES) {
    throw new Error(`El archivo tiene demasiada geometría...`);
  }
  // ...
}
```

**Justificación del límite:** 5 millones de triángulos corresponden a ~250MB de STL binario. Ninguna pieza de impresión 3D FDM realista supera este número; los modelos para FDM tienen típicamente entre 10.000 y 500.000 triángulos.

---

### 2.4 Límites de payload en schemas JSON

**Problema:** los schemas de Fastify validaban tipo y presencia pero no longitud máxima, permitiendo payloads arbitrariamente grandes.

| Campo | Ruta | Límite aplicado |
|---|---|---|
| `pdfBase64` | `POST /api/quote/:id/email` | `maxLength: 20 * 1024 * 1024` (~20MB de string base64, equivale a ~15MB de PDF) |
| `observaciones` | `POST /api/quote` | `maxLength: 500` (alineado con validación del frontend) |
| `empleadoId` | `POST /api/quote` | `maxLength: 100` |
| `destinatario` | `POST /api/quote/:id/email` | `maxLength: 254` (límite RFC 5321 para direcciones de email) |

---

### 2.5 Límite del uploadCache en memoria

**Problema:** sin un techo, un atacante puede hacer 1000 uploads en 30 minutos y consumir toda la RAM del servidor (cada entrada guarda el análisis STL en memoria + el archivo en `/tmp`).

**Solución:** subclass de `Map` que aplica evicción FIFO al superar 200 entradas.

```typescript
const UPLOAD_CACHE_MAX = 200;
export const uploadCache = new class extends Map<string, StlAnalysis> {
  set(key: string, value: StlAnalysis) {
    if (this.size >= UPLOAD_CACHE_MAX) {
      const oldest = this.keys().next().value;
      if (oldest) this.delete(oldest);
    }
    return super.set(key, value);
  }
}();
```

**Justificación del límite:** 200 sesiones simultáneas es más que suficiente para el equipo interno de Dryada. Si se supera, el usuario más antiguo simplemente recibe un error al intentar cotizar y debe volver a subir el STL.

---

### 2.6 Sanitización de errores de Nodemailer

**Problema:** los errores de Nodemailer pueden incluir información interna: hostname del servidor SMTP, estado de la conexión TLS, o fragmentos de credenciales.

**Solución:** en el catch del endpoint de email, el mensaje de error original se loguea en el servidor pero no se devuelve al cliente.

```typescript
} catch {
  // err intencionalmente no capturado: app.log.error ya lo registró en el error handler
  return reply.status(500).send({
    error: 'No se pudo enviar el email. Verificá la dirección o intentá de nuevo.',
    code: 'EMAIL_ERROR',
  });
}
```

---

### 2.7 Security headers HTTP (nginx)

**Aplicación:** solo al frontend servido por nginx. El backend no necesita estos headers porque no sirve HTML.

| Header | Valor | Propósito |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Previene MIME type sniffing |
| `X-Frame-Options` | `DENY` | Previene clickjacking via iframe |
| `Referrer-Policy` | `strict-origin` | No filtra la URL completa en el Referer a otros dominios |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Deshabilita APIs de hardware que la app no usa |
| `Content-Security-Policy` | Ver nginx.conf | Restringe orígenes de scripts, estilos y conexiones |

**CSP configurada:**
```
default-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
script-src 'self' 'unsafe-inline' 'unsafe-eval';
img-src 'self' data: blob:;
connect-src 'self' https:;
worker-src 'self' blob:
```

> `unsafe-inline` y `unsafe-eval` son necesarios para Vite/React en su forma actual. En N3 se puede eliminar `unsafe-eval` si se migra a un bundler que soporte nonces.

---

## 3. Controles pendientes (antes de exponer a internet)

### AA-5 revisado: checklist de deploy seguro

Antes de hacer la URL pública conocida fuera del equipo:

- [ ] Generar `API_TOKEN` con `openssl rand -hex 32`
- [ ] Configurar `API_TOKEN` en Railway → backend → Variables
- [ ] Configurar `API_TOKEN` en GitHub → Secrets como `API_TOKEN` (para el build del frontend)
- [ ] Verificar que `GET /api/materials` sin Authorization header devuelve 401
- [ ] Configurar `FRONTEND_URL` en Railway → backend con la URL real del frontend (CORS)
- [ ] Verificar que el email de cotización no cae en spam

### Controles no implementados en N1

| Control | Razón de omisión | Cuándo implementar |
|---|---|---|
| HTTPS en el backend | Railway termina TLS antes del contenedor | Automático en Railway |
| Autenticación de empleados (login real) | Fuera de scope N1 | N3 |
| Audit log de cotizaciones | Sin base de datos en N1 | N2 |
| Rotación automática de tokens | Overhead innecesario para uso interno | Si se eleva el perfil de riesgo |
| CSRF protection | La API es stateless (Bearer token), no usa cookies | No necesario con este modelo |
| Validación de MIME type del STL | El parser ya rechaza STLs malformados | Mejora de hardening en N2 |

---

## 4. Guía para generar el API_TOKEN

```bash
# Generar un token aleatorio de 256 bits (32 bytes = 64 hex chars)
openssl rand -hex 32
# Ejemplo de salida: a3f8c2e1d4b7f0e9a2c5d8e1f4b7a0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1
```

El mismo valor se configura en dos lugares:
1. Railway → servicio `backend` → Variables → `API_TOKEN`
2. GitHub → Settings → Secrets → `API_TOKEN` (usado por el workflow para buildear el frontend)

---

*Fin del documento Security SDD v1.0 — Cotizador Dryada*
