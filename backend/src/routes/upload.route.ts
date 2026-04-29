import { FastifyPluginAsync } from 'fastify';
import { uploadCache } from '../app';
import { analizarStl } from '../services/stl-processor';

export const uploadRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/upload', async (request, reply) => {
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
