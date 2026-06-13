import { FastifyPluginAsync } from 'fastify';
import { machinesRepo } from '../app';

export const machinesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/machines', {
    schema: {
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:           { type: 'string' },
              nombre:       { type: 'string' },
              capacidadXmm: { type: 'number' },
              capacidadYmm: { type: 'number' },
              capacidadZmm: { type: 'number' },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const maquinas = await machinesRepo.getActivas();
    return reply.send(maquinas);
  });
};
