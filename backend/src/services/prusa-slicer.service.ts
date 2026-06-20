import { spawn } from 'child_process';
import * as fs from 'fs/promises';

export interface SliceResult {
  gramosTotal: number;
}

export interface IPrusaSlicerService {
  slice(stlPath: string, densidad: number): Promise<SliceResult>;
}

const FILAMENT_REGEX = /^;\s*filament used \[g\]\s*=\s*([\d.]+)/m;

export class PrusaSlicerService implements IPrusaSlicerService {
  constructor(
    private readonly bin: string,
    private readonly layerHeight: string,
    private readonly timeoutMs: number = 300_000,
  ) {}

  async slice(stlPath: string, densidad: number): Promise<SliceResult> {
    const gcodePath = stlPath.replace('.stl', '.gcode');
    const args = [
      '--fill-density', '10%',
      '--perimeters', '2',
      '--nozzle-diameter', '0.40',
      '--layer-height', this.layerHeight,
      '--filament-density', String(densidad),
      '--export-gcode',
      '--output', gcodePath,
      stlPath,
    ];

    await this.runProcess(args);

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
  }

  private runProcess(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.bin, args, { stdio: 'pipe' });

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`timeout: PrusaSlicer exceeded ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`exit code ${code}`));
      });
    });
  }
}
