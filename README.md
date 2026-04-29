# Cotizador Dryada

Herramienta interna para cotizar piezas de impresión 3D FDM. El equipo de ventas sube un archivo STL, el sistema calcula el costo estimado en USD y genera un PDF que puede descargarse o enviarse por email.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS |
| Visualización 3D | react-three-fiber · @react-three/drei |
| PDF | @react-pdf/renderer |
| Backend | Node.js 20 · Fastify 4 · TypeScript |
| Email | Nodemailer · Gmail SMTP |
| Persistencia (N1) | JSON local · in-memory |
| Persistencia (N2) | PostgreSQL · Prisma |

---

## Requisitos previos

- Node.js 20 LTS o superior
- npm 9+
- Cuenta Gmail con verificación en dos pasos (para email)

---

## Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd cotizador-dryada

# Instalar todas las dependencias (raíz + backend + frontend)
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

---

## Configuración

```bash
# Copiar el template de variables de entorno
cp backend/.env.example backend/.env
```

Editar `backend/.env`:

```env
PORT=3001

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-cuenta@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   # App Password de 16 chars (ver más abajo)
EMAIL_FROM="Cotizador Dryada <tu-cuenta@gmail.com>"

UPLOAD_MAX_MB=50
```

### Obtener el App Password de Gmail

1. Ir a [myaccount.google.com](https://myaccount.google.com) → **Seguridad**
2. Activar **Verificación en dos pasos** (si no está activa)
3. Ir a **Contraseñas de aplicaciones**
4. Crear una nueva: tipo "Otro" → nombre "Cotizador Dryada"
5. Copiar los 16 caracteres generados como valor de `SMTP_PASS`

> En desarrollo sin credenciales, el servidor arranca igual y loguea los emails en consola sin enviarlos.

---

## Levantar el proyecto

```bash
# Backend + frontend en paralelo
npm run dev
```

O por separado:

```bash
npm run dev:backend   # http://localhost:3001
npm run dev:frontend  # http://localhost:5173
```

---

## Estructura del proyecto

```
cotizador-dryada/
│
├── backend/
│   └── src/
│       ├── app.ts                    # Inyección de dependencias
│       ├── server.ts                 # Entry point Fastify
│       ├── routes/
│       │   ├── upload.route.ts       # POST /api/upload
│       │   ├── materials.route.ts    # GET  /api/materials
│       │   ├── quote.route.ts        # POST /api/quote
│       │   └── email.route.ts        # POST /api/quote/:id/email
│       ├── services/
│       │   ├── stl-processor.ts      # Parser STL + cálculo geométrico
│       │   ├── quote.service.ts      # Fórmula de cotización
│       │   └── email.service.ts      # Nodemailer wrapper
│       ├── repositories/
│       │   ├── prices.repository.ts          # Interface IPricesRepository
│       │   ├── quote.repository.ts           # Interface IQuoteRepository
│       │   ├── json-prices.repository.ts     # Implementación N1 (JSON)
│       │   └── in-memory-quote.repository.ts # Implementación N1 (memoria)
│       └── data/
│           └── prices.json           # Materiales y precios en USD
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── FileUploader/         # Drag & drop + validación
│       │   ├── ModelViewer/          # Visualización 3D (Three.js)
│       │   ├── QuoteForm/            # Selector material + cantidad
│       │   └── QuoteResult/          # Desglose + PDF + email
│       ├── services/
│       │   ├── api.client.ts         # Fetch wrapper tipado
│       │   └── pdf.service.ts        # Generación de PDF
│       └── types/
│           └── index.ts              # Tipos compartidos
│
├── specs/
│   └── cotizador-dryada-sdd.md       # Software Design Description
│
├── tasks.json                        # Estado de todas las tareas
├── checklist.md                      # Checklist de implementación
├── rules.md                          # Reglas de arquitectura del proyecto
└── CLAUDE.md                         # Instrucciones para Claude Code
```

---

## API

### `POST /api/upload`
Recibe un archivo STL. Retorna el análisis geométrico.

```json
// Response 200
{
  "uploadId": "uuid",
  "volumenCm3": 12.4,
  "areaCm2": 38.2,
  "boundingBox": { "x": 45.0, "y": 30.0, "z": 20.0 },
  "complejidad": "simple",
  "advertencias": []
}
```

Posibles valores de `complejidad`: `"simple"` · `"moderada"` · `"compleja"`  
Posibles advertencias: `"unidades_probables_pulgadas"`

---

### `GET /api/materials`
Retorna la lista de materiales disponibles con precios en USD.

```json
[
  { "id": "pla-standard", "nombre": "PLA Estándar", "precioGramo": 0.08, "densidad": 1.24 }
]
```

---

### `POST /api/quote`
Calcula una cotización y la registra en el sistema.

```json
// Body
{
  "uploadId": "uuid",
  "materialId": "pla-standard",
  "cantidad": 3,
  "empleadoId": "Ana López",
  "observaciones": "Cliente necesita entrega urgente"
}

// Response 200
{
  "id": "uuid",
  "gramosInfill": 1.54,
  "gramosParedes": 3.79,
  "gramosTotal": 5.33,
  "costoMaterialUSD": 0.43,
  "costoInicioUSD": 5.00,
  "precioUnitarioUSD": 5.43,
  "precioFinalUSD": 16.28,
  "material": { "id": "pla-standard", "nombre": "PLA Estándar", "precioGramo": 0.08 },
  "cantidad": 3,
  "volumenCm3": 12.4,
  "areaCm2": 38.2,
  "complejidad": "simple",
  "advertencias": []
}
```

---

### `POST /api/quote/:id/email`
Envía el PDF de la cotización por email.

```json
// Body
{
  "destinatario": "cliente@ejemplo.com",
  "pdfBase64": "JVBERi0xLjQ..."
}
```

---

## Cómo se calcula el precio

La fórmula usa el volumen **y** el área superficial del modelo (extraídos del STL en una sola pasada), lo que permite estimar correctamente el peso de las paredes sin depender de un factor constante:

```
gramos_infill  = volumen_cm3 × 0.10 × densidad_material
gramos_paredes = area_cm2 × (2 perímetros × 0.04 cm) × densidad_material
gramos_total   = gramos_infill + gramos_paredes

precio_final   = (gramos_total × precio_gramo + costo_inicio) × cantidad
```

Parámetros fijos en Nivel 1: `10% relleno · nozzle 0.4mm · 2 perímetros · capa 0.2mm`.

### Detección de pieza compleja

Se calcula el **índice de compacidad** (IC = área / volumen²/³). Si es alto, la pieza tiene muchas superficies relativas a su volumen y el cálculo geométrico puede tener mayor margen de error:

| IC | Nivel | Comportamiento |
|---|---|---|
| ≤ 12 | `simple` | Sin advertencia |
| 12–20 | `moderada` | Aviso: margen estimado ±15% |
| > 20 | `compleja` | Advertencia prominente: revisar manualmente |

---

## Roadmap

| Nivel | Estado | Descripción |
|---|---|---|
| **N1 — MVP** | 🔨 En desarrollo | Cálculo geométrico, JSON local, PDF, email |
| **N2 — Precisión** | 📋 Planificado | PrusaSlicer CLI en backend, PostgreSQL |
| **N3 — Completo** | 📋 Planificado | Parámetros editables, panel de admin, historial |

El diseño es agnóstico a la fuente de datos: pasar de N1 a N2 implica reemplazar las implementaciones de repositorios en `app.ts` sin modificar la lógica de negocio.

---

## Documentación técnica

- [`specs/cotizador-dryada-sdd.md`](specs/cotizador-dryada-sdd.md) — Arquitectura completa, decisiones de diseño, guía de implementación
- [`rules.md`](rules.md) — Reglas de arquitectura que todo el código debe respetar
- [`tasks.json`](tasks.json) — Estado actualizado de todas las tareas por fase
- [`checklist.md`](checklist.md) — Checklist de validación antes del lanzamiento
