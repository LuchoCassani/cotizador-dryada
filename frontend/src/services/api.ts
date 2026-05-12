import type { CotizacionResult, Material, UploadResult, ApiError } from '../types'

// Si VITE_API_TOKEN está seteado (producción), se incluye en todas las llamadas.
// En desarrollo local sin la variable, el header no se envía y el backend lo ignora.
const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined

function authHeaders(): Record<string, string> {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ error: 'Error inesperado', code: 'UNKNOWN' }))
    throw err
  }
  return res.json()
}

export async function uploadStl(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  return handleResponse<UploadResult>(res)
}

export async function getMaterials(): Promise<Material[]> {
  const res = await fetch('/api/materials', { headers: authHeaders() })
  return handleResponse<Material[]>(res)
}

export async function createQuote(params: {
  uploadId: string
  materialId: string
  cantidad: number
  empleadoId: string
  observaciones?: string
}): Promise<CotizacionResult> {
  const res = await fetch('/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(params),
  })
  return handleResponse<CotizacionResult>(res)
}

export async function sendEmail(quoteId: string, destinatario: string, pdfBase64: string): Promise<void> {
  const res = await fetch(`/api/quote/${quoteId}/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ destinatario, pdfBase64 }),
  })
  return handleResponse<void>(res)
}
