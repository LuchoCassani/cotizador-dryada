export type Complejidad = 'simple' | 'moderada' | 'compleja'

export interface Maquina {
  id: string
  nombre: string
  capacidadXmm: number
  capacidadYmm: number
  capacidadZmm: number
}

export type Step = 0 | 1 | 2 | 3

export interface BoundingBox {
  x: number
  y: number
  z: number
}

export interface UploadResult {
  uploadId: string
  volumenCm3: number
  areaCm2: number
  boundingBox: BoundingBox
  complejidad: Complejidad
  advertencias: string[]
}

export interface Material {
  id: string
  nombre: string
  precioGramo: number
  densidad: number
}

export interface CotizacionResult {
  id: string
  gramosInfill: number
  gramosParedes: number
  gramosTotal: number
  costoMaterialUSD: number
  costoManoObraUSD: number
  costoInicioUSD: number
  precioUnitarioUSD: number
  costoAmortizacionUSD: number
  precioFinalUSD: number
  precioFinalARS: number
  material: { id: string; nombre: string; precioGramo: number }
  maquina: { id: string; nombre: string }
  cantidad: number
  volumenCm3: number
  areaCm2: number
  complejidad: Complejidad
  advertencias: string[]
  weightSource: 'prusaslicer' | 'n1'
}

export interface ApiError {
  error: string
  code: string
}
