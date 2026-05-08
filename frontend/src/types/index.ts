export type Complejidad = 'simple' | 'moderada' | 'compleja'

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
  costoInicioUSD: number
  precioUnitarioUSD: number
  precioFinalUSD: number
  material: { id: string; nombre: string; precioGramo: number }
  cantidad: number
  volumenCm3: number
  areaCm2: number
  complejidad: Complejidad
  advertencias: string[]
}

export interface ApiError {
  error: string
  code: string
}
