import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export type NivelComplejidad = 'simple' | 'moderada' | 'compleja';

export interface StlAnalysis {
  uploadId: string;
  volumenCm3: number;
  areaCm2: number;
  boundingBox: { x: number; y: number; z: number }; // mm
  complejidad: NivelComplejidad;
  advertencias: string[];
}

type Vertex = [number, number, number];
type Triangle = [Vertex, Vertex, Vertex];

function isBinaryStl(buffer: Buffer): boolean {
  if (buffer.length < 84) return false;
  const numTriangles = buffer.readUInt32LE(80);
  return buffer.length === 84 + numTriangles * 50;
}

const MAX_TRIANGLES = 5_000_000;

function parseBinary(buffer: Buffer): Triangle[] {
  const numTriangles = buffer.readUInt32LE(80);

  if (numTriangles > MAX_TRIANGLES) {
    throw new Error(`El archivo tiene demasiada geometría (${numTriangles.toLocaleString()} triángulos). El límite es ${MAX_TRIANGLES.toLocaleString()}.`);
  }

  const triangles: Triangle[] = [];
  let offset = 84;

  for (let i = 0; i < numTriangles; i++) {
    offset += 12; // normal vector — no se usa en el cálculo
    const v0: Vertex = [buffer.readFloatLE(offset), buffer.readFloatLE(offset + 4), buffer.readFloatLE(offset + 8)];
    offset += 12;
    const v1: Vertex = [buffer.readFloatLE(offset), buffer.readFloatLE(offset + 4), buffer.readFloatLE(offset + 8)];
    offset += 12;
    const v2: Vertex = [buffer.readFloatLE(offset), buffer.readFloatLE(offset + 4), buffer.readFloatLE(offset + 8)];
    offset += 14; // 12 vértice + 2 attribute byte count
    triangles.push([v0, v1, v2]);
  }

  return triangles;
}

function parseAscii(buffer: Buffer): Triangle[] {
  const text = buffer.toString('utf-8');
  const triangles: Triangle[] = [];
  const vertexRe = /vertex\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g;
  const vertices: Vertex[] = [];
  let match: RegExpExecArray | null;

  while ((match = vertexRe.exec(text)) !== null) {
    vertices.push([parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])]);
  }

  for (let i = 0; i + 2 < vertices.length; i += 3) {
    triangles.push([vertices[i], vertices[i + 1], vertices[i + 2]]);
  }

  return triangles;
}

function calcularMetricas(triangles: Triangle[]) {
  let volumen = 0;
  let area = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const [v0, v1, v2] of triangles) {
    volumen +=
      (v0[0] * (v1[1] * v2[2] - v1[2] * v2[1]) +
       v1[0] * (v2[1] * v0[2] - v2[2] * v0[1]) +
       v2[0] * (v0[1] * v1[2] - v0[2] * v1[1])) / 6;

    const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
    const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
    area +=
      Math.sqrt((ay * bz - az * by) ** 2 + (az * bx - ax * bz) ** 2 + (ax * by - ay * bx) ** 2) / 2;

    for (const v of [v0, v1, v2]) {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
      if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
    }
  }

  return {
    volumenMm3: Math.abs(volumen),
    areaMm2: area,
    boundingBox: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
}

function evaluarComplejidad(areaCm2: number, volumenCm3: number): NivelComplejidad {
  if (volumenCm3 < 0.001) return 'compleja';
  const ic = areaCm2 / Math.pow(volumenCm3, 2 / 3);
  if (ic > 20) return 'compleja';
  if (ic > 12) return 'moderada';
  return 'simple';
}

export async function analizarStl(buffer: Buffer): Promise<StlAnalysis> {
  if (buffer.length < 84) {
    throw new Error('Archivo STL inválido o demasiado pequeño.');
  }

  const triangles = isBinaryStl(buffer) ? parseBinary(buffer) : parseAscii(buffer);

  if (triangles.length === 0) {
    throw new Error('El archivo STL no contiene triángulos válidos.');
  }

  const { volumenMm3, areaMm2, boundingBox } = calcularMetricas(triangles);

  if (volumenMm3 <= 0) {
    throw new Error(
      'Geometría inválida: el modelo tiene normales invertidas o malla abierta. Verificar el archivo en el modelador 3D.',
    );
  }

  const volumenCm3 = volumenMm3 / 1000;
  const areaCm2 = areaMm2 / 100;
  const advertencias: string[] = [];

  if (boundingBox.x > 500 || boundingBox.y > 500 || boundingBox.z > 500) {
    advertencias.push('unidades_probables_pulgadas');
  }

  const complejidad = evaluarComplejidad(areaCm2, volumenCm3);
  const uploadId = randomUUID();

  await fs.writeFile(path.join(os.tmpdir(), `${uploadId}.stl`), buffer);

  return { uploadId, volumenCm3, areaCm2, boundingBox, complejidad, advertencias };
}
