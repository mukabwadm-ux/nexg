import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IndexingError } from './contracts.js';
import type { WriterLock } from './ports.js';

/** Cross-process single writer. A crash leaves a visible lock for operator review. */
export class FileWriterLock implements WriterLock {
  constructor(private readonly directory: string) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, 'index-writer.lock');
    try { await mkdir(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new IndexingError('INDEX_WRITER_BUSY');
      throw error;
    }
    try {
      // No source records or secrets; the lock is deliberately not auto-expired.
      await writeFile(join(this.directory, 'last-writer.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      return await operation();
    } finally { await rmdir(path); }
  }
}
