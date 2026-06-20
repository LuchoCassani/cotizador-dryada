import type { CotizacionResult, Maquina, Material, UploadResult, ApiError, MaterialAdmin, MaquinaAdmin, ParametrosGlobales, AdminSession } from '../types'

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

export async function getMachines(): Promise<Maquina[]> {
  const res = await fetch('/api/machines', { headers: authHeaders() })
  return handleResponse<Maquina[]>(res)
}

export async function createQuote(params: {
  uploadId: string
  materialId: string
  maquinaId: string
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

// --- Auth cotizador ---

export async function cotizadorLogin(password: string): Promise<{ token: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ password }),
  })
  return handleResponse<{ token: string }>(res)
}

// --- Admin ---

function adminHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('admin_token')
  return token ? { 'X-Admin-Token': token } : {}
}

async function handleAdminResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    sessionStorage.removeItem('admin_token')
    throw { error: 'Sesión expirada', code: 'SESSION_EXPIRED' } as ApiError
  }
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ error: 'Error inesperado', code: 'UNKNOWN' }))
    throw err
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export async function adminLogin(password: string): Promise<AdminSession> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ password }),
  })
  return handleAdminResponse<AdminSession>(res)
}

export async function adminGetMaterials(): Promise<MaterialAdmin[]> {
  const res = await fetch('/api/admin/materials', { headers: { ...authHeaders(), ...adminHeaders() } })
  return handleAdminResponse<MaterialAdmin[]>(res)
}

export async function adminCreateMaterial(data: Omit<MaterialAdmin, 'id' | 'creadaAt' | 'actualizadaAt'>): Promise<MaterialAdmin> {
  const res = await fetch('/api/admin/materials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...adminHeaders() },
    body: JSON.stringify(data),
  })
  return handleAdminResponse<MaterialAdmin>(res)
}

export async function adminUpdateMaterial(id: string, data: Partial<Omit<MaterialAdmin, 'id' | 'creadaAt' | 'actualizadaAt'>>): Promise<MaterialAdmin> {
  const res = await fetch(`/api/admin/materials/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...adminHeaders() },
    body: JSON.stringify(data),
  })
  return handleAdminResponse<MaterialAdmin>(res)
}

export async function adminDeleteMaterial(id: string): Promise<void> {
  const res = await fetch(`/api/admin/materials/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders(), ...adminHeaders() },
  })
  return handleAdminResponse<void>(res)
}

export async function adminGetMachines(): Promise<MaquinaAdmin[]> {
  const res = await fetch('/api/admin/machines', { headers: { ...authHeaders(), ...adminHeaders() } })
  return handleAdminResponse<MaquinaAdmin[]>(res)
}

export async function adminCreateMachine(data: Omit<MaquinaAdmin, 'id' | 'creadaAt'>): Promise<MaquinaAdmin> {
  const res = await fetch('/api/admin/machines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...adminHeaders() },
    body: JSON.stringify(data),
  })
  return handleAdminResponse<MaquinaAdmin>(res)
}

export async function adminUpdateMachine(id: string, data: Partial<Omit<MaquinaAdmin, 'id' | 'creadaAt'>>): Promise<MaquinaAdmin> {
  const res = await fetch(`/api/admin/machines/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...adminHeaders() },
    body: JSON.stringify(data),
  })
  return handleAdminResponse<MaquinaAdmin>(res)
}

export async function adminDeleteMachine(id: string): Promise<void> {
  const res = await fetch(`/api/admin/machines/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders(), ...adminHeaders() },
  })
  return handleAdminResponse<void>(res)
}

export async function adminGetParams(): Promise<ParametrosGlobales> {
  const res = await fetch('/api/admin/params', { headers: { ...authHeaders(), ...adminHeaders() } })
  return handleAdminResponse<ParametrosGlobales>(res)
}

export async function adminUpdateParams(data: Partial<Omit<ParametrosGlobales, 'actualizadaAt'>>): Promise<ParametrosGlobales> {
  const res = await fetch('/api/admin/params', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...adminHeaders() },
    body: JSON.stringify(data),
  })
  return handleAdminResponse<ParametrosGlobales>(res)
}

export async function adminChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/admin/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...adminHeaders() },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  return handleAdminResponse<void>(res)
}
