import { FastifyPluginAsync } from 'fastify';
import { uploadCache, quoteService } from '../app';

interface QuoteBody {
  uploadId: string;
  materialId: string;
  cantidad: number;
  empleadoId: string;
  observaciones?: string;
}

export const quoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: QuoteBody }>('/api/quote', {
    schema: {
      body: {
        type: 'object',
        required: ['uploadId', 'materialId', 'cantidad', 'empleadoId'],
        additionalProperties: false,
        properties: {
          uploadId:      { type: 'string' },
          materialId:    { type: 'string' },
          cantidad:      { type: 'integer', minimum: 1 },
          empleadoId:    { type: 'string', minLength: 1 },
          observaciones: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { uploadId, materialId, cantidad, empleadoId, observaciones } = request.body;

    const stlAnalysis = uploadCache.get(uploadId);
    if (!stlAnalysis) {
      return reply.status(404).send({ error: 'Upload no encontrado. Subir el archivo nuevamente.', code: 'UPLOAD_NOT_FOUND' });
    }

    let result;
    try {
      result = await quoteService.calcularCotizacion({ stlAnalysis, materialId, cantidad, empleadoId, observaciones });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al calcular la cotización.';
      return reply.status(400).send({ error: message, code: 'QUOTE_ERROR' });
    }

    return reply.send(result);
  });
};
