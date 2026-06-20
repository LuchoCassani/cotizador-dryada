import { FastifyPluginAsync } from 'fastify'
import { adminSessionService } from '../services/admin-session.service'
import { materialsRepo, machinesRepo, paramsRepo, adminPasswordService } from '../app'

const idParams = { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false }

const materialBody = {
  type: 'object',
  properties: {
    nombre: { type: 'string' }, precioPorCartucho750gEUR: { type: 'number' },
    densidadGCm3: { type: 'number' }, activo: { type: 'boolean' },
  },
  additionalProperties: false,
}

const machineBody = {
  type: 'object',
  properties: {
    nombre: { type: 'string' }, capacidadXmm: { type: 'number' }, capacidadYmm: { type: 'number' },
    capacidadZmm: { type: 'number' }, costoUsd: { type: 'number' },
    mesesAmortizacion: { type: 'integer' }, activa: { type: 'boolean' },
  },
  additionalProperties: false,
}

const paramsBody = {
  type: 'object',
  properties: {
    tasaEurUsd: { type: 'number' }, tasaArsUsd: { type: 'number' }, tarifaManoObraUsdHora: { type: 'number' }, horasPorPieza: { type: 'number' },
    desperdicioPct: { type: 'number' }, costosAdicionalesUsd: { type: 'number' }, coeficienteGanancia: { type: 'number' }, piezasPorDiaEstimadas: { type: 'number' },
  },
  additionalProperties: false,
}

const passwordBody = {
  type: 'object',
  properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } },
  additionalProperties: false,
}

export const adminRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { password?: string } }>(
    '/api/admin/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          properties: { password: { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { password } = request.body
      const { match, configured } = await adminPasswordService.verifyLogin(password ?? '')
      if (!configured) return reply.status(503).send({ error: 'Panel de admin no configurado', code: 'ADMIN_DISABLED' })
      if (!match) return reply.status(401).send({ error: 'Contraseña incorrecta', code: 'ADMIN_UNAUTHORIZED' })
      const token = adminSessionService.createSession()
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      return reply.send({ token, expiresAt })
    }
  )

  fastify.register(async (api) => {
    api.addHook('preHandler', async (request, reply) => {
      const token = request.headers['x-admin-token'] as string | undefined
      if (!token || !adminSessionService.isValid(token)) {
        return reply.status(401).send({ error: 'No autorizado', code: 'ADMIN_UNAUTHORIZED' })
      }
    })

    // --- Materiales ---

    api.get('/api/admin/materials', { schema: {} }, async (_request, reply) => {
      const materials = await materialsRepo.getAll()
      return reply.send(materials)
    })

    api.post<{ Body: { nombre?: string; precioPorCartucho750gEUR?: number; densidadGCm3?: number; activo?: boolean } }>(
      '/api/admin/materials',
      { schema: { body: { ...materialBody, required: ['nombre', 'precioPorCartucho750gEUR', 'densidadGCm3'] } } },
      async (request, reply) => {
        const { nombre, precioPorCartucho750gEUR, densidadGCm3, activo = true } = request.body ?? {}
        if (!nombre?.trim()) {
          return reply.status(400).send({ error: 'El nombre es requerido', code: 'VALIDATION_ERROR' })
        }
        if (!precioPorCartucho750gEUR || precioPorCartucho750gEUR <= 0) {
          return reply.status(400).send({ error: 'El precio debe ser mayor a 0', code: 'VALIDATION_ERROR' })
        }
        if (!densidadGCm3 || densidadGCm3 <= 0) {
          return reply.status(400).send({ error: 'La densidad debe ser mayor a 0', code: 'VALIDATION_ERROR' })
        }
        const all = await materialsRepo.getAll()
        if (all.some(m => m.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
          return reply.status(409).send({ error: 'Ya existe un material con ese nombre', code: 'DUPLICATE_NAME' })
        }
        const created = await materialsRepo.create({ nombre: nombre.trim(), precioPorCartucho750gEUR, densidadGCm3, activo })
        return reply.status(201).send(created)
      }
    )

    api.put<{
      Params: { id: string }
      Body: { nombre?: string; precioPorCartucho750gEUR?: number; densidadGCm3?: number; activo?: boolean }
    }>(
      '/api/admin/materials/:id',
      { schema: { params: idParams, body: materialBody } },
      async (request, reply) => {
        const { id } = request.params
        const existing = await materialsRepo.getById(id)
        if (!existing) {
          return reply.status(404).send({ error: 'Material no encontrado', code: 'NOT_FOUND' })
        }
        const { nombre, precioPorCartucho750gEUR, densidadGCm3, activo } = request.body ?? {}
        if (precioPorCartucho750gEUR !== undefined && precioPorCartucho750gEUR <= 0) {
          return reply.status(400).send({ error: 'El precio debe ser mayor a 0', code: 'VALIDATION_ERROR' })
        }
        if (densidadGCm3 !== undefined && densidadGCm3 <= 0) {
          return reply.status(400).send({ error: 'La densidad debe ser mayor a 0', code: 'VALIDATION_ERROR' })
        }
        if (nombre !== undefined) {
          const all = await materialsRepo.getAll()
          if (all.some(m => m.nombre.toLowerCase() === nombre.trim().toLowerCase() && m.id !== id)) {
            return reply.status(409).send({ error: 'Ya existe un material con ese nombre', code: 'DUPLICATE_NAME' })
          }
        }
        await materialsRepo.update(id, {
          ...(nombre !== undefined && { nombre: nombre.trim() }),
          ...(precioPorCartucho750gEUR !== undefined && { precioPorCartucho750gEUR }),
          ...(densidadGCm3 !== undefined && { densidadGCm3 }),
          ...(activo !== undefined && { activo }),
        })
        const updated = await materialsRepo.getById(id)
        return reply.send(updated)
      }
    )

    api.delete<{ Params: { id: string } }>(
      '/api/admin/materials/:id',
      { schema: { params: idParams } },
      async (request, reply) => {
        const { id } = request.params
        const existing = await materialsRepo.getById(id)
        if (!existing) {
          return reply.status(404).send({ error: 'Material no encontrado', code: 'NOT_FOUND' })
        }
        await materialsRepo.update(id, { activo: false })
        return reply.status(204).send()
      }
    )

    // --- Máquinas ---

    api.get('/api/admin/machines', { schema: {} }, async (_request, reply) => {
      const machines = await machinesRepo.getAll()
      return reply.send(machines)
    })

    api.post<{
      Body: { nombre?: string; capacidadXmm?: number; capacidadYmm?: number; capacidadZmm?: number; costoUsd?: number; mesesAmortizacion?: number; activa?: boolean }
    }>(
      '/api/admin/machines',
      { schema: { body: { ...machineBody, required: ['nombre', 'capacidadXmm', 'capacidadYmm', 'capacidadZmm', 'costoUsd', 'mesesAmortizacion'] } } },
      async (request, reply) => {
        const { nombre, capacidadXmm, capacidadYmm, capacidadZmm, costoUsd, mesesAmortizacion, activa = true } = request.body ?? {}
        if (!nombre?.trim()) {
          return reply.status(400).send({ error: 'El nombre es requerido', code: 'VALIDATION_ERROR' })
        }
        if (!capacidadXmm || capacidadXmm <= 0 || !capacidadYmm || capacidadYmm <= 0 || !capacidadZmm || capacidadZmm <= 0) {
          return reply.status(400).send({ error: 'Las dimensiones deben ser mayores a 0', code: 'VALIDATION_ERROR' })
        }
        if (!costoUsd || costoUsd <= 0) {
          return reply.status(400).send({ error: 'El costo debe ser mayor a 0', code: 'VALIDATION_ERROR' })
        }
        if (!mesesAmortizacion || mesesAmortizacion < 1 || !Number.isInteger(mesesAmortizacion)) {
          return reply.status(400).send({ error: 'Los meses de amortización deben ser al menos 1', code: 'VALIDATION_ERROR' })
        }
        const all = await machinesRepo.getAll()
        if (all.some(m => m.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
          return reply.status(409).send({ error: 'Ya existe una máquina con ese nombre', code: 'DUPLICATE_NAME' })
        }
        const created = await machinesRepo.create({ nombre: nombre.trim(), capacidadXmm, capacidadYmm, capacidadZmm, costoUsd, mesesAmortizacion, activa })
        return reply.status(201).send(created)
      }
    )

    api.put<{
      Params: { id: string }
      Body: { nombre?: string; capacidadXmm?: number; capacidadYmm?: number; capacidadZmm?: number; costoUsd?: number; mesesAmortizacion?: number; activa?: boolean }
    }>(
      '/api/admin/machines/:id',
      { schema: { params: idParams, body: machineBody } },
      async (request, reply) => {
        const { id } = request.params
        const existing = await machinesRepo.getById(id)
        if (!existing) {
          return reply.status(404).send({ error: 'Máquina no encontrada', code: 'NOT_FOUND' })
        }
        const { nombre, capacidadXmm, capacidadYmm, capacidadZmm, costoUsd, mesesAmortizacion, activa } = request.body ?? {}
        if (capacidadXmm !== undefined && capacidadXmm <= 0) {
          return reply.status(400).send({ error: 'Las dimensiones deben ser mayores a 0', code: 'VALIDATION_ERROR' })
        }
        if (capacidadYmm !== undefined && capacidadYmm <= 0) {
          return reply.status(400).send({ error: 'Las dimensiones deben ser mayores a 0', code: 'VALIDATION_ERROR' })
        }
        if (capacidadZmm !== undefined && capacidadZmm <= 0) {
          return reply.status(400).send({ error: 'Las dimensiones deben ser mayores a 0', code: 'VALIDATION_ERROR' })
        }
        if (costoUsd !== undefined && costoUsd <= 0) {
          return reply.status(400).send({ error: 'El costo debe ser mayor a 0', code: 'VALIDATION_ERROR' })
        }
        if (mesesAmortizacion !== undefined && (mesesAmortizacion < 1 || !Number.isInteger(mesesAmortizacion))) {
          return reply.status(400).send({ error: 'Los meses de amortización deben ser al menos 1', code: 'VALIDATION_ERROR' })
        }
        if (nombre !== undefined) {
          const all = await machinesRepo.getAll()
          if (all.some(m => m.nombre.toLowerCase() === nombre.trim().toLowerCase() && m.id !== id)) {
            return reply.status(409).send({ error: 'Ya existe una máquina con ese nombre', code: 'DUPLICATE_NAME' })
          }
        }
        await machinesRepo.update(id, {
          ...(nombre !== undefined && { nombre: nombre.trim() }),
          ...(capacidadXmm !== undefined && { capacidadXmm }),
          ...(capacidadYmm !== undefined && { capacidadYmm }),
          ...(capacidadZmm !== undefined && { capacidadZmm }),
          ...(costoUsd !== undefined && { costoUsd }),
          ...(mesesAmortizacion !== undefined && { mesesAmortizacion }),
          ...(activa !== undefined && { activa }),
        })
        const updated = await machinesRepo.getById(id)
        return reply.send(updated)
      }
    )

    api.delete<{ Params: { id: string } }>(
      '/api/admin/machines/:id',
      { schema: { params: idParams } },
      async (request, reply) => {
        const { id } = request.params
        const existing = await machinesRepo.getById(id)
        if (!existing) {
          return reply.status(404).send({ error: 'Máquina no encontrada', code: 'NOT_FOUND' })
        }
        await machinesRepo.update(id, { activa: false })
        return reply.status(204).send()
      }
    )

    // --- Parámetros globales ---

    api.get('/api/admin/params', { schema: {} }, async (_request, reply) => {
      const params = await paramsRepo.get()
      return reply.send(params)
    })

    api.put<{
      Body: {
        tasaEurUsd?: number; tasaArsUsd?: number; tarifaManoObraUsdHora?: number
        horasPorPieza?: number; desperdicioPct?: number; costosAdicionalesUsd?: number
        coeficienteGanancia?: number; piezasPorDiaEstimadas?: number
      }
    }>(
      '/api/admin/params',
      { schema: { body: paramsBody } },
      async (request, reply) => {
        const body = request.body ?? {}
        for (const [key, value] of Object.entries(body)) {
          if (typeof value !== 'number') continue
          if (key === 'desperdicioPct') {
            if (value < 0 || value > 100) {
              return reply.status(400).send({ error: 'desperdicioPct debe estar entre 0 y 100', code: 'VALIDATION_ERROR' })
            }
          } else if (value <= 0) {
            return reply.status(400).send({ error: `${key} debe ser mayor a 0`, code: 'VALIDATION_ERROR' })
          }
        }
        await paramsRepo.update(body)
        const updated = await paramsRepo.get()
        return reply.send(updated)
      }
    )

    // --- Contraseña ---

    api.put<{ Body: { currentPassword?: string; newPassword?: string } }>(
      '/api/admin/password',
      { schema: { body: passwordBody } },
      async (request, reply) => {
        const { currentPassword, newPassword } = request.body ?? {}
        if (!currentPassword || !newPassword) return reply.status(400).send({ error: 'Faltan campos requeridos', code: 'VALIDATION_ERROR' })
        if (newPassword.length < 8) return reply.status(400).send({ error: 'La contraseña debe tener al menos 8 caracteres', code: 'VALIDATION_ERROR' })
        const result = await adminPasswordService.change(currentPassword, newPassword)
        if (!result.ok) return reply.status(401).send({ error: result.error ?? 'Contraseña actual incorrecta', code: 'ADMIN_UNAUTHORIZED' })
        return reply.status(204).send()
      }
    )
  })
}
