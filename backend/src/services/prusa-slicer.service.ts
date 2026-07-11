import { spawn } from 'child_process';
import * as fs from 'fs/promises';

export interface SliceResult {
  gramosTotal: number;
}

export interface BuildVolume {
  xMm: number;
  yMm: number;
  zMm: number;
}

export type ProgressCallback = (pct: number, etapa: string) => void;

export interface IPrusaSlicerService {
  slice(stlPath: string, densidad: number, buildVolume: BuildVolume, signal?: AbortSignal, onProgress?: ProgressCallback): Promise<SliceResult>;
}

const FILAMENT_REGEX = /^;\s*filament used \[g\]\s*=\s*([\d.]+)/m;
const PROGRESS_REGEX = /^(\d{1,3})\s*=>\s*(.+)$/;

export class PrusaSlicerService implements IPrusaSlicerService {
  private busy = false;

  constructor(
    private readonly bin: string,
    private readonly layerHeight: string,
    private readonly timeoutMs: number = 300_000,
  ) {}

  async slice(stlPath: string, densidad: number, buildVolume: BuildVolume, signal?: AbortSignal, onProgress?: ProgressCallback): Promise<SliceResult> {
    if (this.busy) throw new Error('PrusaSlicer ocupado: otro slicing en curso');
    this.busy = true;
    const gcodePath = stlPath.replace('.stl', '.gcode');
    const { xMm, yMm, zMm } = buildVolume;
    const args = [
      '--fill-density', '10%',
      '--perimeters', '2',
      '--nozzle-diameter', '0.40',
      '--layer-height', this.layerHeight,
      '--filament-density', String(densidad),
      '--threads', '1',
      // Sin esto, PrusaSlicer usa su bed/altura por defecto (200x200x200mm),
      // más chico que varias máquinas de Dryada — piezas que sí entran en la
      // máquina seleccionada caían al fallback N1 con "exceeds the maximum
      // build volume height".
      '--bed-shape', `0x0,${xMm}x0,${xMm}x${yMm},0x${yMm}`,
      '--max-print-height', String(zMm),
      '--export-gcode',
      '--output', gcodePath,
      stlPath,
    ];

    try {
      await this.runProcess(args, signal, onProgress);

      const gcode = await fs.readFile(gcodePath, 'utf-8').finally(() => {
        fs.unlink(gcodePath).catch(() => {});
      });

      const match = FILAMENT_REGEX.exec(gcode);
      if (!match) throw new Error('parse failed: filament used [g] line not found');

      const gramosTotal = parseFloat(match[1]);
      if (!Number.isFinite(gramosTotal) || gramosTotal <= 0) {
        throw new Error(`invalid value: ${gramosTotal}`);
      }

      return { gramosTotal };
    } finally {
      this.busy = false;
    }
  }

  private runProcess(args: string[], signal?: AbortSignal, onProgress?: ProgressCallback): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.bin, args, { stdio: 'pipe' });

      let stdoutBuffer = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const match = PROGRESS_REGEX.exec(line.trim());
          if (match) onProgress?.(parseInt(match[1], 10), match[2]);
        }
      });

      // Solo se guardan los últimos ~4000 chars: PrusaSlicer puede emitir miles de
      // líneas de diagnóstico de reparación de malla ("facet (N)/first facet") en
      // archivos con geometría problemática, y el mensaje de error real suele estar
      // al final.
      let stderrTail = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-4000);
      });

      const onAbort = () => {
        proc.kill('SIGKILL');
        reject(new Error('slicing cancelado: cliente desconectado'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => signal?.removeEventListener('abort', onAbort);

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`timeout: PrusaSlicer exceeded ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      proc.on('error', (err) => {
        clearTimeout(timer);
        cleanup();
        reject(err);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        cleanup();
        if (code === 0) resolve();
        else reject(new Error(`exit code ${code}${stderrTail ? ` — stderr: ${stderrTail.trim()}` : ''}`));
      });
    });
  }
}
