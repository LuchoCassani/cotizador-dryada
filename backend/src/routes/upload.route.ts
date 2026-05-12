import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FastifyPluginAsync } from 'fastify';
import { uploadCache } from '../app';
import { analizarStl } from '../services/stl-processor';

const UPLOAD_TTL_MS = 30 * 60 * 1000; // 30 minutos

function programarLimpieza(uploadId: string): void {
  setTimeout(async () => {
    uploadCache.delete(uploadId);
    try {
      await fs.unlink(path.join(os.tmpdir(), `${uploadId}.stl`));
    } catch {
      // El archivo puede haber sido eliminado antes por otro proceso
    }
  }, UPLOAD_TTL_MS);
}

const MAX_TRIANGLES = 5_000_000; // ~250MB de STL binario; por encima es DoS territory

export const uploadRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/upload', {
    config: {
      rateLimit: {
        max: 10,          // máximo 10 uploads por minuto por IP
        timeWindow: 60_000,
        errorResponseBuilder: () => ({
          error: 'Demasiados archivos subidos. Esperá un minuto antes de reintentar.',
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      },
    },
  }, async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No se recibió ningún archivo.', code: 'NO_FILE' });
    }

    if (!data.filename.toLowerCase().endsWith('.stl')) {
      return reply.status(400).send({ error: 'Solo se aceptan archivos .stl', code: 'INVALID_EXTENSION' });
    }

    const buffer = await data.toBuffer();

    let analysis;
    try {
      analysis = await analizarStl(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al procesar el archivo STL.';
      return reply.status(422).send({ error: message, code: 'STL_PROCESSING_ERROR' });
    }

    uploadCache.set(analysis.uploadId, analysis);
    programarLimpieza(analysis.uploadId);

    return reply.send({
      uploadId: analysis.uploadId,
      volumenCm3: analysis.volumenCm3,
      areaCm2: analysis.areaCm2,
      boundingBox: analysis.boundingBox,
      complejidad: analysis.complejidad,
      advertencias: analysis.advertencias,
    });
  });
};
