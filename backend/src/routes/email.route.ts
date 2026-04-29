import { FastifyPluginAsync } from 'fastify';
import { quoteRepo, emailService } from '../app';

interface EmailBody {
  destinatario: string;
  pdfBase64: string;
}

export const emailRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: EmailBody }>('/api/quote/:id/email', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['destinatario', 'pdfBase64'],
        additionalProperties: false,
        properties: {
          destinatario: { type: 'string', format: 'email' },
          pdfBase64:    { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { destinatario, pdfBase64 } = request.body;

    const quote = await quoteRepo.findById(id);
    if (!quote) {
      return reply.status(404).send({ error: 'Cotización no encontrada.', code: 'QUOTE_NOT_FOUND' });
    }

    try {
      await emailService.enviarCotizacion({ destinatario, numeroCotizacion: id, pdfBase64 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al enviar el email.';
      return reply.status(500).send({ error: `No se pudo enviar el email: ${message}`, code: 'EMAIL_ERROR' });
    }

    return reply.send({ ok: true });
  });
};
