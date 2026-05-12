import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { uploadRoute } from './routes/upload.route';
import { materialsRoute } from './routes/materials.route';
import { quoteRoute } from './routes/quote.route';
import { emailRoute } from './routes/email.route';

const PORT = parseInt(process.env.PORT ?? '3001');
const UPLOAD_MAX_BYTES = parseInt(process.env.UPLOAD_MAX_MB ?? '50') * 1024 * 1024;

async function start() {
  const app = Fastify({ logger: { level: 'info' } });

  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'
  await app.register(cors, { origin: allowedOrigin });
  await app.register(multipart, { limits: { fileSize: UPLOAD_MAX_BYTES } });

  await app.register(uploadRoute);
  await app.register(materialsRoute);
  await app.register(quoteRoute);
  await app.register(emailRoute);

  app.get('/health', async () => ({ status: 'ok' }));

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Error interno del servidor.' : error.message,
      code: error.code ?? 'INTERNAL_ERROR',
    });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`Backend corriendo en http://localhost:${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
