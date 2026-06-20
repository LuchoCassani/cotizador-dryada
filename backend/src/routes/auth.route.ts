import { FastifyPluginAsync } from 'fastify'
import { randomBytes, timingSafeEqual } from 'crypto'

export const authRoute: FastifyPluginAsync = async (fastify) => {
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
      if (!cotizadorPassword) {
        return reply.send({ token: randomBytes(32).toString('hex') })
      }
      const { password } = request.body
      const expected = Buffer.from(cotizadorPassword)
      const received = Buffer.from(password ?? '')
      const isMatch = expected.length === received.length && timingSafeEqual(expected, received)
      if (!isMatch) {
        return reply.status(401).send({ error: 'Contraseña incorrecta', code: 'UNAUTHORIZED' })
      }
      return reply.send({ token: randomBytes(32).toString('hex') })
    }
  )
}
