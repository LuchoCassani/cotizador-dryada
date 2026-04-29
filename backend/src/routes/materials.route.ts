import { FastifyPluginAsync } from 'fastify';
import { pricesRepo } from '../app';

export const materialsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/materials', async (_request, reply) => {
    const materiales = await pricesRepo.getMateriales();
    return reply.send(materiales);
  });
};
