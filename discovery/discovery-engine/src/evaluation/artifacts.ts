import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { uuid7 } from '../shared/uuid.js';
import { EvaluationError } from '../../engines/evaluation-learning/src/contracts.js';

/** Local offline artifacts only, never a provider/import path or merchant store. */
export async function readEvaluationFile(path: string): Promise<unknown> {
  const absolute = resolve(path); const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024 || resolve(await realpath(absolute)) !== absolute) throw new EvaluationError('UNSAFE_EVALUATION_INPUT');
  const file = await open(absolute, 'r');
  try {
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      bytes += chunk.length; if (bytes > 32 * 1024 * 1024) throw new EvaluationError('EVALUATION_INPUT_TOO_LARGE'); chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new EvaluationError('INVALID_EVALUATION_JSON'); }
  } finally { await file.close(); }
}
export async function writeEvaluationReport(directory: string, report: unknown): Promise<string> {
  const base = resolve(directory); await mkdir(base, { recursive: true });
  if ((await lstat(base)).isSymbolicLink() || resolve(await realpath(base)) !== base) throw new EvaluationError('UNSAFE_EVALUATION_OUTPUT');
  const output = join(base, uuid7()); await mkdir(output);
  const file = join(output, 'report.json'); await writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); return file;
}
