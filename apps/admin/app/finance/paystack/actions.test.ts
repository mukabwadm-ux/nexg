import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
const who = vi.hoisted(() => ({ isSuperAdmin: true }));
const refresh = vi.hoisted(() => vi.fn(async () => undefined));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: revalidate }));
vi.mock('@/lib/staff', () => ({
  requireStaff: async () => ({ displayName: 'Fixture owner', isSuperAdmin: who.isSuperAdmin }),
  requireModule: () => ({ level: 'full' }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => db }));
vi.mock('@/lib/paystack-keys', () => ({ refreshPaystackKeys: refresh }));

import { removePaystackKey, reviewPaystackProblem, savePaystackKey } from './actions';

const KEY = 'sk_test_ci_only_0123456789';

const logged: unknown[] = [];
beforeEach(() => {
  who.isSuperAdmin = true;
  db.rpc.mockReset();
  refresh.mockClear();
  revalidate.mockClear();
  logged.length = 0;
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logged.push(...args));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('saving a Paystack key', () => {
  it('sends it to the database only, refreshes this server and says the last four', async () => {
    db.rpc.mockResolvedValue({
      data: { ok: true, mode: 'test', set: true, last4: '6789' },
      error: null,
    });

    const out = await savePaystackKey('test', KEY);

    expect(db.rpc).toHaveBeenCalledWith('rpc_paystack_key_set', {
      p_mode: 'test',
      p_value: KEY,
    });
    expect(out).toEqual({ ok: true, message: 'Saved the test key. It ends 6789.' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledWith('/finance/paystack');
    expect(JSON.stringify([out, revalidate.mock.calls, logged])).not.toContain(KEY);
  });

  it('passes the database’s refusal on, and never a key', async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'A live secret key starts sk_live_.' },
    });
    expect(await savePaystackKey('live', KEY)).toEqual({
      ok: false,
      message: 'A live secret key starts sk_live_.',
    });

    db.rpc.mockResolvedValue({ data: null, error: { message: `bad value ${KEY} given` } });
    const out = await savePaystackKey('test', KEY);
    expect(out.message).toBe('bad value [key] given');
    expect(refresh).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it('says nothing about the key when the database cannot be reached', async () => {
    db.rpc.mockRejectedValue(new Error(`fetch failed: ${KEY}`));
    const out = await savePaystackKey('test', KEY);
    expect(out.ok).toBe(false);
    expect(JSON.stringify([out, logged])).not.toContain(KEY);
  });

  it('says the function is not there yet', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    expect((await savePaystackKey('test', KEY)).message).toBe(
      'This part is not on the database yet.',
    );
  });

  it('refuses someone who is not a super admin without calling the database', async () => {
    who.isSuperAdmin = false;
    expect((await savePaystackKey('test', KEY)).ok).toBe(false);
    expect((await removePaystackKey('test', 'rotating')).ok).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('refuses an empty value or an unknown mode', async () => {
    expect((await savePaystackKey('test', '   ')).message).toBe('Paste the key first.');
    expect((await savePaystackKey('both', KEY)).message).toBe('Choose test or live.');
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe('marking a problem reviewed', () => {
  it('goes through the Paystack screen’s own function, for the database to allow', async () => {
    /* Full Finance, not a super admin: the database decides. */
    who.isSuperAdmin = false;
    db.rpc.mockResolvedValue({ data: { ok: true }, error: null });

    expect(await reviewPaystackProblem(42, '  Paid by hand  ')).toEqual({
      ok: true,
      message: 'Marked reviewed.',
    });
    expect(db.rpc).toHaveBeenCalledWith('rpc_finance_paystack_problem_review', {
      p_event_id: 42,
      p_note: 'Paid by hand',
    });
    expect(revalidate).toHaveBeenCalledWith('/finance/paystack');

    await reviewPaystackProblem(43, ' ');
    expect(db.rpc).toHaveBeenLastCalledWith('rpc_finance_paystack_problem_review', {
      p_event_id: 43,
    });
  });

  it('passes a refusal on, and asks nothing about no event', async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Somebody else has to review your own actions.' },
    });
    expect(await reviewPaystackProblem(42, '')).toEqual({
      ok: false,
      message: 'Somebody else has to review your own actions.',
    });
    db.rpc.mockClear();
    expect((await reviewPaystackProblem(1.5, '')).ok).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe('removing a Paystack key', () => {
  it('needs a reason', async () => {
    expect((await removePaystackKey('live', ' ')).message).toBe(
      'Say why this key is being removed.',
    );
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('removes with the reason, and says when there was nothing', async () => {
    db.rpc.mockResolvedValueOnce({ data: { ok: true, removed: true }, error: null });
    expect(await removePaystackKey('live', ' rotating ')).toEqual({
      ok: true,
      message: 'Removed the live key.',
    });
    expect(db.rpc).toHaveBeenCalledWith('rpc_paystack_key_remove', {
      p_mode: 'live',
      p_reason: 'rotating',
    });
    db.rpc.mockResolvedValueOnce({ data: { ok: true, removed: false }, error: null });
    expect((await removePaystackKey('live', 'again')).message).toBe(
      'There was no live key to remove.',
    );
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
