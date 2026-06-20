import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { initDatabase } from '../../src/db/init'
import { SqliteMaterialsRepository } from '../../src/repositories/sqlite-materials.repository'
import { SqliteMachinesRepository } from '../../src/repositories/sqlite-machines.repository'
import { SqliteGlobalParamsRepository } from '../../src/repositories/sqlite-global-params.repository'
import { AdminPasswordService } from '../../src/services/admin-password.service'
import { adminRoute } from '../../src/routes/admin.route'
import { adminSessionService } from '../../src/services/admin-session.service'

let _materialsRepo: SqliteMaterialsRepository
let _machinesRepo: SqliteMachinesRepository
let _paramsRepo: SqliteGlobalParamsRepository
let _adminPasswordService: AdminPasswordService

vi.mock('../../src/app', () => ({
  get materialsRepo() { return _materialsRepo },
  get machinesRepo() { return _machinesRepo },
  get paramsRepo() { return _paramsRepo },
  get adminPasswordService() { return _adminPasswordService },
}))

const TEST_PASSWORD = 'test-admin-password-123'

let app: FastifyInstance

beforeEach(async () => {
  process.env.ADMIN_PASSWORD = TEST_PASSWORD
  const db = initDatabase(':memory:')
  _materialsRepo = new SqliteMaterialsRepository(db)
  _machinesRepo = new SqliteMachinesRepository(db)
  _paramsRepo = new SqliteGlobalParamsRepository(db)
  _adminPasswordService = new AdminPasswordService(db)
  app = Fastify({ logger: false })
  await app.register(adminRoute)
  await app.ready()
})

afterEach(async () => {
  await app.close()
  delete process.env.ADMIN_PASSWORD
})

async function login(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { password: TEST_PASSWORD },
  })
  return (JSON.parse(res.body) as { token: string }).token
}

describe('POST /api/admin/login', () => {
  it('contraseña correcta devuelve token de 64 chars y expiresAt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_PASSWORD },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { token: string; expiresAt: string }
    expect(body.token).toHaveLength(64)
    expect(body.expiresAt).toBeTruthy()
  })

  it('contraseña incorrecta devuelve 401 ADMIN_UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
    expect((JSON.parse(res.body) as { code: string }).code).toBe('ADMIN_UNAUTHORIZED')
  })

  it('sin ADMIN_PASSWORD configurada devuelve 503 ADMIN_DISABLED', async () => {
    delete process.env.ADMIN_PASSWORD
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_PASSWORD },
    })
    expect(res.statusCode).toBe(503)
    expect((JSON.parse(res.body) as { code: string }).code).toBe('ADMIN_DISABLED')
  })
})

describe('Autenticación de rutas protegidas', () => {
  it('sin token devuelve 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/materials' })
    expect(res.statusCode).toBe(401)
  })

  it('token inválido devuelve 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/materials',
      headers: { 'x-admin-token': 'token-falso' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('token expirado devuelve 401 y es eliminado del mapa (lazy cleanup)', async () => {
    // acceso al Map privado para forzar expiración sin esperar 8h reales
    const sessions = (adminSessionService as unknown as { sessions: Map<string, { expiresAt: number }> }).sessions
    sessions.set('expired-token', { expiresAt: Date.now() - 1000 })
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/materials',
      headers: { 'x-admin-token': 'expired-token' },
    })
    expect(res.statusCode).toBe(401)
    expect(sessions.has('expired-token')).toBe(false)
  })
})

describe('CRUD Materiales', () => {
  it('GET /api/admin/materials retorna lista del seed', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/materials',
      headers: { 'x-admin-token': token },
    })
    expect(res.statusCode).toBe(200)
    const list = JSON.parse(res.body) as unknown[]
    expect(list.length).toBeGreaterThan(0)
  })

  it('POST /api/admin/materials crea material y devuelve 201', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/materials',
      headers: { 'x-admin-token': token },
      payload: { nombre: 'PLA Test', precioPorCartucho750gEUR: 20, densidadGCm3: 1.24, activo: true },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body) as { nombre: string; id: string }
    expect(body.nombre).toBe('PLA Test')
    expect(body.id).toBeTruthy()
  })

  it('POST /api/admin/materials con precio 0 devuelve 400', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/materials',
      headers: { 'x-admin-token': token },
      payload: { nombre: 'Test', precioPorCartucho750gEUR: 0, densidadGCm3: 1.24, activo: true },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /api/admin/materials con nombre duplicado devuelve 409 DUPLICATE_NAME', async () => {
    const token = await login()
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/materials',
      headers: { 'x-admin-token': token },
    })
    const existingName = (JSON.parse(listRes.body) as Array<{ nombre: string }>)[0].nombre
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/materials',
      headers: { 'x-admin-token': token },
      payload: { nombre: existingName, precioPorCartucho750gEUR: 20, densidadGCm3: 1.24, activo: true },
    })
    expect(res.statusCode).toBe(409)
    expect((JSON.parse(res.body) as { code: string }).code).toBe('DUPLICATE_NAME')
  })

  it('PUT /api/admin/materials/:id actualiza precio', async () => {
    const token = await login()
    const listRes = await app.inject({ method: 'GET', url: '/api/admin/materials', headers: { 'x-admin-token': token } })
    const id = (JSON.parse(listRes.body) as Array<{ id: string }>)[0].id
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/materials/${id}`,
      headers: { 'x-admin-token': token },
      payload: { precioPorCartucho750gEUR: 99.99 },
    })
    expect(res.statusCode).toBe(200)
    expect((JSON.parse(res.body) as { precioPorCartucho750gEUR: number }).precioPorCartucho750gEUR).toBe(99.99)
  })

  it('PUT /api/admin/materials/:id nombre duplicado devuelve 409', async () => {
    const token = await login()
    const listRes = await app.inject({ method: 'GET', url: '/api/admin/materials', headers: { 'x-admin-token': token } })
    const list = JSON.parse(listRes.body) as Array<{ id: string; nombre: string }>
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/materials/${list[0].id}`,
      headers: { 'x-admin-token': token },
      payload: { nombre: list[1].nombre },
    })
    expect(res.statusCode).toBe(409)
  })

  it('DELETE /api/admin/materials/:id hace soft delete (activo: false)', async () => {
    const token = await login()
    const listRes = await app.inject({ method: 'GET', url: '/api/admin/materials', headers: { 'x-admin-token': token } })
    const id = (JSON.parse(listRes.body) as Array<{ id: string }>)[0].id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/materials/${id}`,
      headers: { 'x-admin-token': token },
    })
    expect(res.statusCode).toBe(204)
    const mat = await _materialsRepo.getById(id)
    expect(mat?.activo).toBe(false)
  })
})

describe('CRUD Máquinas', () => {
  it('GET /api/admin/machines retorna lista del seed', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/machines',
      headers: { 'x-admin-token': token },
    })
    expect(res.statusCode).toBe(200)
    expect((JSON.parse(res.body) as unknown[]).length).toBeGreaterThan(0)
  })

  it('POST /api/admin/machines crea máquina y devuelve 201', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines',
      headers: { 'x-admin-token': token },
      payload: { nombre: 'Test Machine', capacidadXmm: 200, capacidadYmm: 200, capacidadZmm: 200, costoUsd: 5000, mesesAmortizacion: 24, activa: true },
    })
    expect(res.statusCode).toBe(201)
    expect((JSON.parse(res.body) as { nombre: string }).nombre).toBe('Test Machine')
  })

  it('POST /api/admin/machines con nombre duplicado devuelve 409', async () => {
    const token = await login()
    const listRes = await app.inject({ method: 'GET', url: '/api/admin/machines', headers: { 'x-admin-token': token } })
    const existingName = (JSON.parse(listRes.body) as Array<{ nombre: string }>)[0].nombre
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines',
      headers: { 'x-admin-token': token },
      payload: { nombre: existingName, capacidadXmm: 200, capacidadYmm: 200, capacidadZmm: 200, costoUsd: 5000, mesesAmortizacion: 24, activa: true },
    })
    expect(res.statusCode).toBe(409)
  })

  it('PUT /api/admin/machines/:id actualiza costo', async () => {
    const token = await login()
    const listRes = await app.inject({ method: 'GET', url: '/api/admin/machines', headers: { 'x-admin-token': token } })
    const id = (JSON.parse(listRes.body) as Array<{ id: string }>)[0].id
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/machines/${id}`,
      headers: { 'x-admin-token': token },
      payload: { costoUsd: 9999 },
    })
    expect(res.statusCode).toBe(200)
    expect((JSON.parse(res.body) as { costoUsd: number }).costoUsd).toBe(9999)
  })

  it('DELETE /api/admin/machines/:id hace soft delete (activa: false)', async () => {
    const token = await login()
    const listRes = await app.inject({ method: 'GET', url: '/api/admin/machines', headers: { 'x-admin-token': token } })
    const id = (JSON.parse(listRes.body) as Array<{ id: string }>)[0].id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/machines/${id}`,
      headers: { 'x-admin-token': token },
    })
    expect(res.statusCode).toBe(204)
    // getById filtra por activa=1, así que verificamos con getAll() que incluye inactivas
    const all = await _machinesRepo.getAll()
    const mac = all.find(m => m.id === id)
    expect(mac?.activa).toBe(false)
  })
})

describe('Parámetros globales', () => {
  it('GET /api/admin/params retorna parámetros con tasaEurUsd > 0', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/params',
      headers: { 'x-admin-token': token },
    })
    expect(res.statusCode).toBe(200)
    expect((JSON.parse(res.body) as { tasaEurUsd: number }).tasaEurUsd).toBeGreaterThan(0)
  })

  it('PUT /api/admin/params actualiza tasaEurUsd', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/params',
      headers: { 'x-admin-token': token },
      payload: { tasaEurUsd: 1.25 },
    })
    expect(res.statusCode).toBe(200)
    expect((JSON.parse(res.body) as { tasaEurUsd: number }).tasaEurUsd).toBe(1.25)
  })

  it('PUT /api/admin/params con desperdicioPct 150 devuelve 400', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/params',
      headers: { 'x-admin-token': token },
      payload: { desperdicioPct: 150 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('PUT /api/admin/params con tasaEurUsd 0 devuelve 400', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/params',
      headers: { 'x-admin-token': token },
      payload: { tasaEurUsd: 0 },
    })
    expect(res.statusCode).toBe(400)
  })
})
