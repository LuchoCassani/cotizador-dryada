import { FastifyPluginAsync } from 'fastify';
import { uploadCache, quoteService } from '../app';

interface QuoteBody {
  uploadId: string;
  materialId: string;
  maquinaId: string;
  cantidad: number;
  empleadoId: string;
  observaciones?: string;
}

function sseWrite(raw: NodeJS.WritableStream, payload: unknown): void {
  raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export const quoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: QuoteBody }>('/api/quote', {
    schema: {
      body: {
        type: 'object',
        required: ['uploadId', 'materialId', 'maquinaId', 'cantidad', 'empleadoId'],
        additionalProperties: false,
        properties: {
          uploadId:      { type: 'string' },
          materialId:    { type: 'string' },
          maquinaId:     { type: 'string', minLength: 1 },
          cantidad:      { type: 'integer', minimum: 1 },
          empleadoId:    { type: 'string', minLength: 1, maxLength: 100 },
          observaciones: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const { uploadId, materialId, maquinaId, cantidad, empleadoId, observaciones } = request.body;

    const stlAnalysis = uploadCache.get(uploadId);
    if (!stlAnalysis) {
      return reply.status(404).send({ error: 'El archivo ya no está disponible (puede haber expirado). Por favor volvé a subir el STL.', code: 'UPLOAD_NOT_FOUND' });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const ac = new AbortController();
    request.raw.once('close', () => ac.abort());

    try {
      const result = await quoteService.calcularCotizacion({
        stlAnalysis, materialId, maquinaId, cantidad, empleadoId, observaciones, signal: ac.signal,
        onProgress: (pct, etapa) => sseWrite(reply.raw, { type: 'progress', pct, etapa }),
      });
      sseWrite(reply.raw, { type: 'done', result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al calcular la cotización.';
      sseWrite(reply.raw, { type: 'error', message, code: 'QUOTE_ERROR' });
    } finally {
      reply.raw.end();
    }
  });
};
