import { FastifyPluginAsync } from 'fastify';
import { quoteRepo, emailService } from '../app';

interface EmailBody {
  destinatario: string;
  pdfBase64: string;
}

// Un PDF de 15MB en base64 son ~20MB de string. Es un techo generoso para cualquier cotización.
const PDF_BASE64_MAX = 20 * 1024 * 1024;

export const emailRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: EmailBody }>('/api/quote/:id/email', {
    config: {
      rateLimit: {
        max: 5,           // máximo 5 emails por minuto por IP — previene uso como relay de spam
        timeWindow: 60_000,
        errorResponseBuilder: () => ({
          error: 'Demasiados emails enviados. Esperá un minuto antes de reintentar.',
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      },
    },
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
          destinatario: { type: 'string', format: 'email', maxLength: 254 },
          pdfBase64:    { type: 'string', minLength: 1, maxLength: PDF_BASE64_MAX },
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
    } catch {
      // No exponer detalles del error de Nodemailer (puede incluir host SMTP, credenciales parciales)
      return reply.status(500).send({
        error: 'No se pudo enviar el email. Verificá la dirección o intentá de nuevo.',
        code: 'EMAIL_ERROR',
      });
    }

    return reply.send({ ok: true });
  });
};
