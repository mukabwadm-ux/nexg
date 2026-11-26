import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { allRows, readingBeforeArchive } from './read';

describe('readingBeforeArchive', () => {
  it('uses the new read when the database has the archive columns', async () => {
    let older = 0;
    const rows = await allRows(
      readingBeforeArchive(
        async () => ({ data: [{ id: 'a', archived_at: null }], error: null }),
        async () => {
          older += 1;
          return { data: [], error: null };
        },
      ),
    );
    expect(rows).toEqual([{ id: 'a', archived_at: null }]);
    expect(older).toBe(0);
  });

  it('reads as before when a column is missing (42703), and keeps doing so', async () => {
    let newer = 0;
    const read = readingBeforeArchive<{ id: string }>(
      async () => {
        newer += 1;
        return {
          data: null,
          error: { code: '42703', message: 'column unit.deleted_at does not exist' },
        };
      },
      async (from) => ({ data: from === 0 ? [{ id: 'b' }] : [], error: null }),
    );
    expect(await allRows(read)).toEqual([{ id: 'b' }]);
    await read(500, 999);
    expect(newer).toBe(1);
  });

  it('passes any other error through unchanged', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const result = await readingBeforeArchive(
      async () => ({ data: null, error }),
      async () => ({ data: [], error: null }),
    )(0, 499);
    expect(result.error).toBe(error);
  });
});
