import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FileWriterLock } from '../indexing/writerLock.js';
import { canonicalJson } from '../shared/immutable.js';
import { uuid7 } from '../shared/uuid.js';
import { controlRecord, validateControl, OperatorError, type ControlRecord, type RuntimeFlags, type OperatorReason } from './runtimeControl.js';
import { setTimeout as delay } from 'node:timers/promises';

/** One standalone-owned directory, atomic pointer + immutable bounded history.
 * Deployment OS ACLs own operator access. No merchant/source data is stored here.
 */
export class ControlFileStore {
  readonly directory: string;
  constructor(directory: string, private readonly replace: typeof rename = rename) { this.directory = resolve(directory); }
  async #directory(create = false): Promise<void> {
    if (create) await mkdir(this.directory, { recursive: true });
    const stat = await lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || resolve(await realpath(this.directory)) !== this.directory) throw new OperatorError('UNSAFE_CONTROL_PATH');
  }
  async #read(name: string): Promise<ControlRecord> {
    await this.#directory(); const path = join(this.directory, name); const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new OperatorError('INVALID_CONTROL');
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const bytes = Buffer.alloc(4097); const result = await file.read(bytes, 0, bytes.length, 0);
      if (result.bytesRead > 4096) throw new OperatorError('INVALID_CONTROL');
      try { return validateControl(JSON.parse(bytes.subarray(0, result.bytesRead).toString('utf8'))); }
      catch { throw new OperatorError('INVALID_CONTROL'); } // Never echo malformed file contents at startup.
    } finally { await file.close(); }
  }
  read(): Promise<ControlRecord> { return this.#read('controls.json'); }
  async #commit(record: ControlRecord): Promise<ControlRecord> {
    const history = join(this.directory, `revision-${record.revision}.json`); const bytes = canonicalJson(record) + '\n';
    const files = await readdir(this.directory);
    if (files.filter(name => /^revision-\d+\.json$/.test(name)).length >= 128) throw new OperatorError('CONTROL_HISTORY_FULL');
    const previous = await this.#read(`revision-${record.revision}.json`).then(value => canonicalJson(value) + '\n').catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (previous !== undefined && previous !== bytes) throw new OperatorError('CONTROL_HISTORY_CONFLICT');
    if (previous === undefined) {
      const file = await open(history, 'wx', 0o600); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    }
    const temporary = join(this.directory, `control-next-${uuid7()}.json`);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    try {
      // Windows readers/antivirus can briefly deny replacement. Retain the old
      // pointer throughout; retry only atomic rename, never unlink it first.
      const waits = [0, 10, 25, 50, 100];
      for (const [attempt, wait] of waits.entries()) {
        if (wait) await delay(wait);
        try { await this.replace(temporary, join(this.directory, 'controls.json')); break; }
        catch (error) {
          if (!['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt === waits.length - 1) throw error;
        }
      }
    }
    catch (error) { await unlink(temporary).catch(() => {}); throw error; }
    return record;
  }
  async init(flags: RuntimeFlags): Promise<ControlRecord> {
    await this.#directory(true);
    return new FileWriterLock(this.directory).run(async () => {
      try { await lstat(join(this.directory, 'controls.json')); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.#commit(controlRecord(0, flags, 'initial'));
        throw error;
      }
      throw new OperatorError('CONTROL_ALREADY_EXISTS');
    });
  }
  async set(expected: number, flags: RuntimeFlags, reason: OperatorReason): Promise<ControlRecord> {
    await this.#directory();
    return new FileWriterLock(this.directory).run(async () => {
      const current = await this.read(); if (current.revision !== expected) throw new OperatorError('CONTROL_REVISION_CONFLICT');
      return this.#commit(controlRecord(current.revision + 1, flags, reason));
    });
  }
  async rollback(expected: number, targetRevision: number, reason: OperatorReason): Promise<ControlRecord> {
    if (!Number.isSafeInteger(targetRevision) || targetRevision < 0 || targetRevision >= expected) throw new OperatorError('INVALID_ROLLBACK_TARGET');
    await this.#directory();
    return new FileWriterLock(this.directory).run(async () => {
      const current = await this.read(); if (current.revision !== expected) throw new OperatorError('CONTROL_REVISION_CONFLICT');
      const target = await this.#read(`revision-${targetRevision}.json`);
      if (target.revision !== targetRevision) throw new OperatorError('INVALID_ROLLBACK_TARGET');
      return this.#commit(controlRecord(current.revision + 1, target.flags, reason, targetRevision));
    });
  }
}
