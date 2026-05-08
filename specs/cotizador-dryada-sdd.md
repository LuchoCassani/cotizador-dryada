# Software Design Description — Cotizador Dryada

**Versión:** 1.0  
**Fecha:** 2026-04-29  
**Estado:** Draft — pendiente alineación

---

## 1. Introducción y objetivos

### 1.1 Propósito del sistema

El Cotizador Dryada es una herramienta interna web que permite al equipo de ventas obtener estimaciones de costo para piezas de impresión 3D FDM a partir de un archivo STL. El flujo completo —subir modelo, calcular gramos, seleccionar material, generar PDF y registrar la cotización— debe completarse sin intervención del área técnica.

### 1.2 Objetivos de diseño

- **Precisión progresiva**: el Nivel 1 usa cálculo geométrico aproximado; el Nivel 2 reemplaza ese cálculo con la salida real del slicer. El resto del sistema no cambia.
- **Agnóstico a la persistencia**: la lógica de negocio nunca habla directamente con una fuente de datos concreta. Toda la capa de precios y trazabilidad se accede mediante interfaces/repositorios.
- **Extensibilidad sin reescritura**: el paso de Nivel 1 a Nivel 3 debe poder hacerse reemplazando implementaciones, no modificando contratos.

### 1.3 Alcance de este documento

Cubre arquitectura, decisiones de diseño, capa de abstracción de datos y guía de implementación para el Nivel 1 (MVP). Los Niveles 2 y 3 están descriptos a nivel de estrategia de escalabilidad.

---

## 2. Análisis crítico del desglose de 3 niveles

### 2.1 Riesgo principal: precisión del cálculo geométrico

La fórmula del Nivel 1 usa:

```
gramos = volumen_cm3 × densidad × (factor_relleno + factor_paredes)
```

**Falla lógica**: `factor_paredes` es una constante global, pero el peso real de las paredes depende del área superficial total del modelo dividida por el espesor de línea y el número de perímetros — no del volumen. Una pieza hueca delgada (esfera) y una pieza maciza del mismo volumen tienen factores de pared completamente distintos.

**Impacto estimado**: error de ±20–35% en piezas con geometría compleja (alta relación superficie/volumen) o muy orgánicas. En piezas blocky (cubos, soportes estructurales) el error es menor (~10%).

**Solución adoptada**: reemplazar el factor constante por cálculo real de área superficial, que ya está disponible en los datos del STL (ver sección 6). El error esperado baja de ±30% a ±10–15% en piezas complejas y a ±5% en piezas simples.

**Mitigación adicional**: detectar automáticamente piezas donde la aproximación geométrica es menos confiable y avisar al empleado antes de que envíe la cotización (ver sección 6.3).

### 2.2 Riesgo secundario: unidades en archivos STL

El formato STL no especifica unidades. Un archivo exportado desde Fusion 360 en pulgadas y uno en milímetros son indistinguibles a nivel binario. Si el empleado sube un modelo en pulgadas, el volumen calculado será `25.4³ ≈ 16.387×` mayor, generando cotizaciones absurdas.

**Mitigación**: detectar el bounding box del modelo al parsear. Si alguna dimensión supera 500 mm (o está bajo 0.1 mm), mostrar advertencia con la dimensión calculada y pedir confirmación al usuario.

### 2.3 Transición Nivel 1 → Nivel 2: el riesgo silencioso

El Nivel 2 reemplaza el cálculo geométrico por la salida del slicer CLI. Esto es correcto en concepto, pero implica que el backend debe estar preparado desde el Nivel 1 para ejecutar procesos hijos (`child_process` / subprocesos). Si el Nivel 1 hace todo en el frontend (cálculo de volumen en el browser con Three.js), la transición al Nivel 2 requeriría mover toda esa lógica al backend.

**Decisión de diseño**: el procesamiento del STL ocurre en el backend desde el Nivel 1. El frontend solo renderiza para visualización. Esto hace que Nivel 2 sea un reemplazo interno en un solo servicio.

### 2.4 Concurrencia en Nivel 2

PrusaSlicer CLI es un proceso pesado (~2–5 segundos por pieza, con picos de CPU). Con múltiples usuarios simultáneos se puede saturar el servidor. Aunque esto es un problema de Nivel 2, la arquitectura del backend debe usar una cola de trabajos desde el inicio para no tener que reescribir el flujo completo.

---

## 3. Stack tecnológico propuesto

### 3.1 Frontend

| Tecnología | Versión mínima | Razón |
|---|---|---|
| React + TypeScript | 18 + 5.x | Ecosistema de componentes, tipado estricto |
| Vite | 5.x | Build rápido, HMR confiable |
| react-three-fiber | 8.x | Wrapping idiomático de Three.js para React |
| @react-three/drei | latest | STLLoader, OrbitControls, helpers 3D |
| @react-pdf/renderer | 3.x | Generación de PDF estructurado en el cliente |
| Tailwind CSS | 3.x | Utility-first, sin overhead de componentes |

**Por qué react-three-fiber sobre Three.js directo**: el STLLoader de drei maneja tanto STL binario como ASCII y expone la geometría como `BufferGeometry`, que tiene método `computeBoundingBox`. La visualización se vuelve declarativa y se integra con el ciclo de vida de React sin efectos manuales.

### 3.2 Backend

| Tecnología | Razón |
|---|---|
| Node.js 20 LTS + TypeScript | Soporte nativo de worker_threads, mismo lenguaje que el frontend |
| Fastify 4.x | 2× más rápido que Express en benchmarks reales, esquemas de validación integrados, plugin ecosystem |
| Multer | Manejo de multipart/form-data para STL uploads |
| BullMQ + Redis | Cola de trabajos para el procesamiento de STL (preparación Nivel 2) |
| Nodemailer | Envío de PDF por email con SMTP configurable |
| tsx / ts-node-esm | Dev server sin compilación explícita |

**¿Por qué no Python?**: la razón habitual para elegir Python sobre Node en este contexto es el ecosistema científico (numpy, scipy para cálculo de volumen). Pero el cálculo de volumen de una malla STL es una operación simple (suma de tetraedros signados) que se implementa en ~20 líneas de TypeScript. Python aportaría más complejidad operativa sin beneficio real hasta el Nivel 2 con PrusaSlicer. En ese punto, PrusaSlicer ya es el proceso externo —no hay diferencia si el wrapper es Node o Python.

### 3.3 Persistencia

| Nivel | Implementación |
|---|---|
| 1 | `prices.json` local en el backend (leído en memoria al iniciar) |
| 2 | PostgreSQL con Prisma ORM (el repositorio cambia, el servicio no) |

---

## 4. Arquitectura del sistema

### 4.1 Diagrama lógico

```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER                                                      │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ FileUploader │   │ ModelViewer  │   │  QuoteResult     │  │
│  │             │   │ (Three.js)   │   │  + PDF download  │  │
│  └──────┬──────┘   └──────────────┘   └──────────────────┘  │
│         │                                                     │
│  ┌──────▼──────────────────────────────────────────────────┐ │
│  │              ApiClient (fetch wrapper tipado)           │ │
│  └──────────────────────────┬───────────────────────────────┘ │
└─────────────────────────────│────────────────────────────────┘
                              │ HTTP/multipart
┌─────────────────────────────▼────────────────────────────────┐
│  BACKEND (Fastify)                                            │
│                                                              │
│  POST /api/upload          GET /api/materials                │
│  POST /api/quote           POST /api/quote/:id/email         │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  QuoteService                                           │ │
│  │  calcularCotizacion(stlBuffer, materialId, cantidad)    │ │
│  │      │                                                  │ │
│  │      ├── StlProcessor.calcularVolumen()   ← Nivel 1     │ │
│  │      │   (reemplazado por SlicerProcessor en Nivel 2)   │ │
│  │      │                                                  │ │
│  │      └── PricesRepository.getMateriales()               │ │
│  │          PricesRepository.getCostoInicio()              │ │
│  └──────────────────────────┬──────────────────────────────┘ │
│                             │                                │
│  ┌──────────────────────────▼──────────────────────────────┐ │
│  │  DATA ABSTRACTION LAYER (Repositories)                  │ │
│  │                                                         │ │
│  │  IPricesRepository ◄── JsonPricesRepository (N1)        │ │
│  │                    ◄── DatabasePricesRepository (N2)    │ │
│  │                                                         │ │
│  │  IQuoteRepository  ◄── InMemoryQuoteRepository (N1)     │ │
│  │                    ◄── PostgresQuoteRepository (N2)     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Flujo de una cotización (Nivel 1)

```
1. Usuario sube STL                → POST /api/upload → archivo guardado en /tmp
2. Backend parsea STL              → GeometricStlProcessor.calcularVolumen()
3. Frontend renderiza              → STLLoader en drei (solo visual, no cálculo)
4. Usuario selecciona material     → GET /api/materials → JsonPricesRepository
5. Usuario confirma cotización     → POST /api/quote
6. Backend calcula precio          → QuoteService.calcularCotizacion()
7. Backend guarda trazabilidad     → IQuoteRepository.save()
8. Backend devuelve resultado      → JSON con desglose completo
9. Frontend genera PDF             → @react-pdf/renderer
10. Usuario envía por email        → POST /api/quote/:id/email → Nodemailer
```

---

## 5. Diseño de la Data Abstraction Layer

### 5.1 Contratos (interfaces TypeScript)

```typescript
// src/repositories/prices.repository.ts

export interface Material {
  id: string;
  nombre: string;
  precioGramo: number;    // en USD
  densidad: number;       // g/cm³
}

export interface IPricesRepository {
  getMateriales(): Promise<Material[]>;
  getMaterialById(id: string): Promise<Material | null>;
  getCostoInicio(): Promise<number>;
}
```

```typescript
// src/repositories/quote.repository.ts

export interface QuoteRecord {
  id: string;             // UUID
  empleadoId: string;
  fecha: Date;
  archivoStl: string;     // nombre original del archivo
  materialId: string;
  cantidad: number;
  volumenCm3: number;
  gramos: number;
  precioFinal: number;
  observaciones?: string;
}

export interface IQuoteRepository {
  save(quote: QuoteRecord): Promise<void>;
  findById(id: string): Promise<QuoteRecord | null>;
  findByEmpleado(empleadoId: string): Promise<QuoteRecord[]>;
}
```

### 5.2 Implementaciones Nivel 1

```typescript
// src/repositories/json-prices.repository.ts

import prices from '../data/prices.json';
import { IPricesRepository, Material } from './prices.repository';

export class JsonPricesRepository implements IPricesRepository {
  async getMateriales(): Promise<Material[]> {
    return prices.materiales;
  }

  async getMaterialById(id: string): Promise<Material | null> {
    return prices.materiales.find(m => m.id === id) ?? null;
  }

  async getCostoInicio(): Promise<number> {
    return prices.costoInicio;
  }
}
```

```typescript
// src/data/prices.json
// Todos los precios en USD. Valores a confirmar con el equipo antes de lanzar (ver F1-T9).

{
  "costoInicio": 5.00,
  "materiales": [
    { "id": "pla-standard", "nombre": "PLA Estándar", "precioGramo": 0.08, "densidad": 1.24 },
    { "id": "pla-silk",     "nombre": "PLA Silk",     "precioGramo": 0.12, "densidad": 1.24 },
    { "id": "petg",         "nombre": "PETG",         "precioGramo": 0.10, "densidad": 1.27 },
    { "id": "abs",          "nombre": "ABS",          "precioGramo": 0.09, "densidad": 1.04 }
  ]
}
```

### 5.3 Inyección de dependencias

El bootstrap de la app resuelve qué implementación usar. El `QuoteService` nunca importa `JsonPricesRepository` directamente:

```typescript
// src/app.ts (bootstrap)

import { JsonPricesRepository } from './repositories/json-prices.repository';
import { InMemoryQuoteRepository } from './repositories/in-memory-quote.repository';
import { QuoteService } from './services/quote.service';

const pricesRepo = new JsonPricesRepository();          // swap por DatabasePricesRepository en N2
const quoteRepo  = new InMemoryQuoteRepository();       // swap por PostgresQuoteRepository en N2

export const quoteService = new QuoteService(pricesRepo, quoteRepo);
```

---

## 6. Cálculo de gramos STL (Nivel 1)

### 6.1 Fórmula mejorada: volumen + área superficial

La iteración sobre los triángulos del STL ya nos da ambas métricas en un solo paso. La fórmula resultante modela correctamente cómo funciona un slicer FDM:

```
// Todo en cm
infill_weight  = volumen_cm3 × fill_ratio × densidad
               // fill_ratio = 0.10 (10% relleno fijo N1)

wall_weight    = area_superficial_cm2 × (n_perimetros × ancho_linea_cm) × densidad
               // n_perimetros = 2 · ancho_linea = 0.04 cm (nozzle 0.4 mm)

gramos         = infill_weight + wall_weight
```

**Por qué es correcto**: el peso de las paredes es proporcional al área superficial, no al volumen. Una esfera y un cubo del mismo volumen tienen áreas distintas y la fórmula lo refleja. El error esperado baja de ±30% (con factor constante) a ±10–15% en piezas complejas y ±5% en piezas simples.

### 6.2 Implementación en el parser STL

```typescript
// src/services/stl-processor.ts

export interface StlAnalysis {
  volumenCm3: number;
  areaCm2: number;
  boundingBox: { x: number; y: number; z: number }; // mm
}

export function analizarStl(stlBuffer: Buffer): StlAnalysis {
  const triangles = parseStl(stlBuffer); // maneja binario y ASCII
  let volumen = 0;
  let area = 0;

  for (const [v0, v1, v2] of triangles) {
    // Volumen: tetraedros signados (teorema de divergencia)
    volumen +=
      (v0[0] * (v1[1] * v2[2] - v1[2] * v2[1]) +
       v1[0] * (v2[1] * v0[2] - v2[2] * v0[1]) +
       v2[0] * (v0[1] * v1[2] - v0[2] * v1[1])) / 6;

    // Área: producto vectorial de dos aristas
    const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
    const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
    area += Math.sqrt(
      (ay * bz - az * by) ** 2 +
      (az * bx - ax * bz) ** 2 +
      (ax * by - ay * bx) ** 2
    ) / 2;
  }

  const volumenMm3 = Math.abs(volumen);
  return {
    volumenCm3: volumenMm3 / 1000,
    areaCm2: area / 100,         // mm² → cm²
    boundingBox: calcularBoundingBox(triangles),
  };
}
```

### 6.3 Detección de pieza compleja

Se usa el **índice de compacidad**: `IC = area_cm2 / volumen_cm3^(2/3)`. Es adimensional y escala correctamente con el tamaño. Valores de referencia: esfera = 4.84 (mínimo teórico), cubo = 6.0. Piezas con features delgados, celosías o geometría orgánica tienen IC > 12.

```typescript
export type NivelComplejidad = 'simple' | 'moderada' | 'compleja';

export function evaluarComplejidad(areaCm2: number, volumenCm3: number): NivelComplejidad {
  if (volumenCm3 < 0.001) return 'compleja'; // geometría inválida o pieza vacía
  const ic = areaCm2 / Math.pow(volumenCm3, 2 / 3);
  if (ic > 20) return 'compleja';
  if (ic > 12) return 'moderada';
  return 'simple';
}
```

**Comportamiento en el frontend según nivel de complejidad**:

| `NivelComplejidad` | Mensaje al empleado | Acción bloqueante |
|---|---|---|
| `simple` | *(sin advertencia)* | No |
| `moderada` | "Pieza con geometría moderada — margen estimado ±15%. Verificar con el área técnica si el valor parece incorrecto." | No |
| `compleja` | "⚠️ Pieza compleja detectada — el cálculo automático puede tener un margen de error alto. Se recomienda revisión manual antes de enviar esta cotización." | No (el empleado puede continuar, pero queda registrado en la trazabilidad) |

El campo `complejidad` se guarda en `QuoteRecord` para que en el futuro se pueda analizar correlación entre IC y error real.

### 6.4 Validación de unidades

Si `boundingBox.max > 500 mm` en alguna dimensión, el procesador incluye `advertencias: ['unidades_probables_pulgadas']` en la respuesta. El frontend muestra las dimensiones calculadas y pide confirmación antes de continuar.

Si el volumen calculado es negativo o cero, la malla tiene geometría inválida (normales invertidas, malla abierta): el procesador retorna un error explícito con mensaje para el empleado.

---

## 7. Estructura de carpetas del proyecto

```
cotizador-dryada/
│
├── specs/
│   └── cotizador-dryada-sdd.md           ← este archivo
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       │
│       ├── components/
│       │   ├── FileUploader/
│       │   │   └── FileUploader.tsx       # drag & drop, validación de extensión y tamaño
│       │   ├── ModelViewer/
│       │   │   └── ModelViewer.tsx        # react-three-fiber + STLLoader + OrbitControls
│       │   ├── QuoteForm/
│       │   │   └── QuoteForm.tsx          # selector material + cantidad + observaciones
│       │   └── QuoteResult/
│       │       └── QuoteResult.tsx        # desglose + botones PDF y email
│       │
│       ├── services/
│       │   ├── api.client.ts              # fetch wrapper tipado contra el backend
│       │   └── pdf.service.ts             # genera PDF con @react-pdf/renderer
│       │
│       └── types/
│           └── index.ts                   # tipos compartidos con el backend (a futuro: monorepo)
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app.ts                         # bootstrap + DI
│       ├── server.ts                      # Fastify listen
│       │
│       ├── routes/
│       │   ├── upload.route.ts            # POST /api/upload
│       │   ├── materials.route.ts         # GET /api/materials
│       │   ├── quote.route.ts             # POST /api/quote
│       │   └── email.route.ts             # POST /api/quote/:id/email
│       │
│       ├── services/
│       │   ├── quote.service.ts           # lógica de negocio (orquesta repos + processor)
│       │   ├── email.service.ts           # Nodemailer wrapper
│       │   └── stl-processor.ts           # cálculo de volumen geométrico (reemplazable)
│       │
│       ├── repositories/
│       │   ├── prices.repository.ts       # interface IPricesRepository
│       │   ├── json-prices.repository.ts  # implementación Nivel 1
│       │   ├── quote.repository.ts        # interface IQuoteRepository
│       │   └── in-memory-quote.repository.ts
│       │
│       └── data/
│           └── prices.json
│
└── package.json                           # scripts raíz (dev, build)
```

---

## 8. Estrategia de escalabilidad N1 → N3

### Nivel 1 → Nivel 2: reemplazar el procesador de STL

El único cambio en la lógica de negocio:

```diff
- const volumenCm3 = GeometricStlProcessor.calcularVolumenCm3(stlBuffer);
- const gramos = volumenCm3 × densidad × (FACTOR_RELLENO + FACTOR_PAREDES);
+ const { gramos, tiempo, soportes } = await SlicerProcessor.slice(stlPath, params);
```

`SlicerProcessor` ejecuta `PrusaSlicer --export-obj --slice` como proceso hijo y parsea el `.gcode` resultante para extraer el peso real estimado. Todo lo demás (repositorios, rutas, PDF, email) permanece igual.

Para no bloquear el servidor con múltiples slicings concurrentes, `SlicerProcessor` encola los trabajos con BullMQ (Redis) y el endpoint devuelve un `jobId`; el frontend hace polling o usa WebSocket para recibir el resultado.

### Nivel 2 → Nivel 3: parámetros editables + panel de admin

- Los parámetros de impresión (calidad, relleno, soportes, orientación) pasan de constantes a campos del formulario de cotización.
- Se agrega un panel de administración para editar materiales y costos → `DatabasePricesRepository` ya está preparado.
- Se implementa `PostgresQuoteRepository` para historial y reportes.

Ninguna de estas adiciones modifica los contratos existentes.

---

## 9. Blockers técnicos principales

| Prioridad | Blocker | Mitigación |
|---|---|---|
| **Crítico** | Error de ±20–35% en el cálculo geométrico vs. peso real | Calibrar con 10 piezas antes de abrir a ventas. Documentar el margen de error visible en el PDF. |
| **Alto** | STL sin unidades → escala incorrecta (pulgadas vs mm) | Detectar bounding box al parsear; advertir si dimensiones son anómalas. |
| **Alto** | Geometría inválida (mallas no manifold, normales invertidas) | El resultado de `calcularVolumenCm3` será incorrecto (valor negativo o cercano a 0). Detectar y mostrar error claro: "Archivo STL inválido — verificá la geometría en el modelador." |
| **Medio** | Archivos grandes (>50 MB) → timeout en upload | Limitar a 50 MB con mensaje amigable. Procesar en worker thread para no bloquear el event loop. |
| **Medio** | STL ASCII vs binario | Detectar por los primeros 5 bytes del buffer (`solid` = ASCII). Implementar ambos parsers. |
| **Bajo** | Concurrencia en Nivel 2 (PrusaSlicer CPU-bound) | BullMQ con concurrencia configurable. Limitador de trabajos simultáneos. |

---

## 10. Guía de implementación — Fase 1

### Orden de construcción recomendado

El objetivo es tener siempre algo funcionando al final de cada jornada. Construir de adentro hacia afuera: primero la lógica pura (sin UI ni HTTP), después los adaptadores.

#### Paso 1 — Backend core (sin rutas)
1. Scaffolding: `npm create fastify-app`, TypeScript config.
2. `stl-processor.ts`: función `calcularVolumenCm3`. Testear con buffer de un cubo 10×10×10 mm (volumen esperado: 1 cm³).
3. `JsonPricesRepository` + `InMemoryQuoteRepository`.
4. `QuoteService.calcularCotizacion()` con ambos repositorios inyectados. Testear la fórmula con valores conocidos.

#### Paso 2 — Backend HTTP
5. Ruta `POST /api/upload`: recibe el STL, calcula volumen, devuelve `{ volumenCm3, boundingBox, advertencias }`.
6. Ruta `GET /api/materials`: devuelve lista del repositorio.
7. Ruta `POST /api/quote`: recibe `{ uploadId, materialId, cantidad, observaciones }`, devuelve cotización completa.
8. Ruta `POST /api/quote/:id/email`: envía PDF por email (Nodemailer mock en desarrollo).

#### Paso 3 — Frontend
9. Scaffolding: `npm create vite@latest frontend -- --template react-ts`.
10. `ModelViewer`: STLLoader + OrbitControls. Probar con un STL real.
11. `FileUploader`: drag & drop → POST /api/upload → mostrar dimensiones y advertencias.
12. `QuoteForm`: GET /api/materials → selector → POST /api/quote.
13. `QuoteResult`: desglose de fórmula + botones PDF y email.
14. `pdf.service.ts`: template de PDF con logo, desglose, número de cotización.

#### Paso 4 — Validación antes de lanzar
15. Pesar 10 piezas físicas en la impresora, compararlas con la cotización, documentar el error porcentual.
16. Ajustar `FACTOR_PAREDES` según los resultados de calibración.
17. Probar con archivos STL problemáticos: binario, ASCII, en pulgadas, malla abierta, >50 MB.
18. Validar el PDF generado con un cotización real firmada por el equipo de ventas.

### Variables de entorno mínimas para Nivel 1

```env
# backend/.env
PORT=3001

# Gmail SMTP — usar App Password (ver instrucciones abajo)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=cotizador@dryada.com
SMTP_PASS=abcd efgh ijkl mnop    # App Password de 16 caracteres generada por Google
EMAIL_FROM="Cotizador Dryada <cotizador@dryada.com>"

UPLOAD_MAX_MB=50
```

### Configuración de email con Gmail

Se usa Gmail SMTP con **App Password** (sin OAuth2). Es la opción más simple para una herramienta interna con bajo volumen de emails.

**Pasos para obtener el App Password:**
1. Activar verificación en dos pasos en la cuenta Gmail de Dryada (`myaccount.google.com → Seguridad`)
2. Ir a **Seguridad → Contraseñas de aplicaciones**
3. Crear una nueva: aplicación "Otro" → nombre "Cotizador Dryada"
4. Copiar los 16 caracteres generados (sin espacios) como valor de `SMTP_PASS`

**Configuración Nodemailer:**

```typescript
// src/services/email.service.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,          // STARTTLS en puerto 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,  // App Password, no la contraseña de la cuenta
  },
});
```

**Límites a tener en cuenta:**
- Gmail gratuito: 500 emails/día
- Google Workspace: 2000 emails/día

Para el volumen de cotizaciones internas de Dryada, ambos límites son más que suficientes. Si en el futuro se necesita mayor volumen o mejor deliverability, migrar a Resend o SendGrid cambia solo `createTransport` — el resto del servicio no se toca.

---

## 11. Diseño de base de datos (Nivel 2)

### 11.1 Esquema de tablas

Cinco tablas cubren el dominio completo. El schema está en `specs/db-schema.prisma`.

| Tabla | Propósito | Aparece en |
|---|---|---|
| `materiales` | Reemplaza `prices.json`. Campo `activo` para soft delete. `updated_at` para auditoría de precios. | N2 |
| `cotizaciones` | Desglose completo snapshot al momento de cotizar. Nada se recalcula. | N2 |
| `emails_enviados` | Log separado de envíos. Una cotización puede tener múltiples (reenvíos). | N2 |
| `empleados` | Tabla de empleados para historial y métricas por vendedor. | N3 |
| `config_impresion` | Parámetros de impresión editables. `es_activa` garantiza que siempre haya una config vigente sin pisar la historia. | N3 |

### 11.2 Decisiones de diseño

**Snapshot de precios** — `cotizaciones` guarda `costo_material_usd` calculado al momento de la cotización. No guarda el precio del material por referencia. Si el precio de PLA cambia mañana, las cotizaciones históricas no se alteran.

**Empleado como dos columnas desde N2** — En N1 `empleado_id` es string libre. Para no tener una migración dolorosa cuando se agregue la tabla `empleados` en N3, desde N2 `cotizaciones` tendrá dos columnas:
```
empleado_nombre  TEXT        -- siempre legible, nunca se pierde
empleado_id      UUID? FK    -- null en N1, FK real en N3
```

**Snapshot de parámetros de impresión** — `config_impresion` no tiene FK en `cotizaciones`. En cambio, los parámetros usados se copian en la fila de cotización (`fill_ratio_usado`, `n_perimetros_usado`, `ancho_linea_cm_usado`). Misma filosofía que el snapshot de precios: los datos históricos no dependen de la config actual.

**`advertencias` como `jsonb`** — Permite índices GIN y queries eficientes del tipo "cotizaciones con advertencia X en el mes Y". Con `text[]` esto no indexa bien.

**`estado` como enum** — Ciclo de vida de una cotización: `borrador → enviada → aceptada → rechazada`. Se define como enum en Prisma para aprovechar el type safety en TypeScript.

### 11.3 Repositorio faltante para N2

El diagrama de evolución no incluye `IEmailLogRepository`. En N1 el `EmailService` solo envía sin persistir. En N2, con `emails_enviados` como tabla real, se necesita:

```typescript
// src/repositories/email-log.repository.ts
export interface EmailLog {
  id: string;
  cotizacionId: string;
  destinatario: string;
  estado: 'enviado' | 'fallido';
  errorMensaje?: string;
  enviadoAt: Date;
}

export interface IEmailLogRepository {
  save(log: EmailLog): Promise<void>;
  findByCotizacion(cotizacionId: string): Promise<EmailLog[]>;
}
```

`EmailService` recibirá este repositorio por inyección de dependencias al igual que los otros. El swap en `app.ts` cuando se conecte a Postgres será transparente.

---

*Fin del documento SDD v1.2 — Cotizador Dryada*
