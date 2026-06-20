import { FastifyPluginAsync } from 'fastify'
import { randomBytes, timingSafeEqual } from 'crypto'

export const authRoute: FastifyPluginAsync = async (fastify) => {
  // Informa si el cotizador requiere password — sin exponer el probe de bypass.
  // COTIZADOR_AUTH_DISABLED=true habilita acceso sin password (opt-in explícito).
  fastify.get(
    '/api/auth/status',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      const requiresPassword =
        !!process.env.COTIZADOR_PASSWORD &&
        process.env.COTIZADOR_AUTH_DISABLED !== 'true'
      return reply.send({ requiresPassword })
    }
  )

  fastify.post<{ Body: { password?: string } }>(
    '/api/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          properties: { password: { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const cotizadorPassword = process.env.COTIZADOR_PASSWORD
      const authDisabled = process.env.COTIZADOR_AUTH_DISABLED === 'true'

      // Opt-in explícito al modo sin contraseña
      if (authDisabled) {
        return reply.send({ token: randomBytes(32).toString('hex') })
      }

      // Fail-closed: ni password ni COTIZADOR_AUTH_DISABLED configurados
      if (!cotizadorPassword) {
        return reply.status(503).send({ error: 'Acceso no disponible.', code: 'COTIZADOR_DISABLED' })
      }

      const { password } = request.body
      // Contraseña vacía siempre rechazada, independientemente del env
      if (!password) {
        return reply.status(401).send({ error: 'Contraseña incorrecta', code: 'UNAUTHORIZED' })
      }

      const expected = Buffer.from(cotizadorPassword)
      const received = Buffer.from(password)
      const isMatch = expected.length === received.length && timingSafeEqual(expected, received)
      if (!isMatch) {
        return reply.status(401).send({ error: 'Contraseña incorrecta', code: 'UNAUTHORIZED' })
      }
      return reply.send({ token: randomBytes(32).toString('hex') })
    }
  )
}
