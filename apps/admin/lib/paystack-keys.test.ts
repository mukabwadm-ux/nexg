import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The console with PAYSTACK_KEYS_TOKEN set: the key loader, and every action
 * that reaches a Paystack key, on a server that has just started.
 */

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/staff', () => ({
  requireStaff: async () => ({ displayName: 'Fixture finance' }),
  requireModule: () => ({ level: 'full' }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => db }));

const TOKEN = 'ci-only-server-token-0123456789abcdef';
const ENV_TEST = 'sk_test_ci_only_env_0123456789';
const KEY = 'sk_test_ci_only_vault_0123456789';
const LIVE = 'sk_live_ci_only_vault_0123456789';
const ID = '5b0d8a52-1f3c-4b8e-9c1a-2d3e4f5a6b7c';
const CODE = 'ACCT_unit1234';
const NOW = Date.UTC(2026, 10, 26, 12, 0, 30);

/* The database's key function and Paystack's API, behind one fetch. */
const database = vi.fn();
const paystack = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const refuseKeys = () => database.mockImplementation(async () => json({ code: '42501' }, 401));

const keys = () => import('@/lib/paystack-keys');
const lib = () => import('@/lib/paystack');
const bearer = () => expect(new Headers(paystack.mock.calls[0]![1].headers).get('authorization'));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  database.mockImplementation(async () => json({ test: KEY, live: null }));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) =>
    String(input).startsWith('https://api.paystack.co/')
      ? paystack(input, init)
      : database(input, init),
  );
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ci-anon-key');
  vi.stubEnv('PAYSTACK_KEYS_TOKEN', TOKEN);
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', ENV_TEST);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('loading the keys on the console', () => {
  it('uses the environment, and asks nothing, without the token', async () => {
    vi.stubEnv('PAYSTACK_KEYS_TOKEN', '');
    await (await keys()).loadPaystackKeys();
    expect((await lib()).paystackProof('test')).toBe(ENV_TEST);
    expect(database).not.toHaveBeenCalled();
  });

  it('asks anonymously and uncached, never with the staff session', async () => {
    await (await keys()).loadPaystackKeys();
    const [url, init] = database.mock.calls[0]!;
    expect(String(url)).toBe('https://db.example.test/rest/v1/rpc/rpc_paystack_server_keys');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer ci-anon-key');
    expect(new Headers(init.headers).get('cookie')).toBeNull();
    const minute = Math.floor(NOW / 60_000);
    expect(JSON.parse(init.body)).toEqual({
      p_minute: minute,
      p_proof: crypto.createHmac('sha256', TOKEN).update(`paystack-keys:${minute}`).digest('hex'),
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('has the database keys only, and none before a load or after a failed one', async () => {
    const { loadPaystackKeys } = await keys();
    const { paystackProof, payoutMode } = await lib();
    expect(payoutMode()).toBeNull();
    await loadPaystackKeys();
    expect(paystackProof('test')).toBe(KEY);
    refuseKeys();
    vi.setSystemTime(NOW + 30_000);
    await loadPaystackKeys();
    expect(paystackProof('test')).toBeNull();
    expect(payoutMode()).toBeNull();
  });

  it('pays out live only with the switch on, which may carry spaces', async () => {
    database.mockImplementation(async () => json({ test: KEY, live: LIVE }));
    await (await keys()).loadPaystackKeys();
    const { payoutMode } = await lib();
    expect(payoutMode()).toBe('test');
    vi.stubEnv('NEXG_PAYSTACK_LIVE', ' 1\n');
    expect(payoutMode()).toBe('live');
  });
});

describe('refunding through Paystack', () => {
  const press = async () =>
    (await import('@/app/orders/paystack-refunds')).refundThroughPaystack('order', ID);
  const answers = () =>
    db.rpc
      .mockResolvedValueOnce({
        data: {
          sent: false,
          reference: 'NXR-unit00000001',
          transaction: '4242',
          amount_cents: 500,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, state: 'pending' }, error: null });

  it('loads the keys first and uses the saved one throughout', async () => {
    answers();
    paystack.mockImplementation(async () => json({ status: true, data: { status: 'pending' } }));
    expect((await press()).ok).toBe(true);
    bearer().toBe(`Bearer ${KEY}`);
    expect(db.rpc.mock.calls.map((c) => c[1].p_proof)).toEqual([KEY, KEY]);
  });

  it('records the answer with the key that opened it, however slow Paystack is', async () => {
    answers();
    paystack.mockImplementation(async () => {
      vi.setSystemTime(NOW + 300_000);
      return json({ status: true, data: { status: 'pending' } });
    });
    await press();
    expect(db.rpc.mock.calls[1]![1].p_proof).toBe(KEY);
  });

  it('sends and opens nothing without the keys', async () => {
    refuseKeys();
    expect(await press()).toEqual({
      ok: false,
      message: 'Paystack is not connected on the console.',
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(paystack).not.toHaveBeenCalled();
  });
});

describe('paying a rider through Paystack', () => {
  const press = async () =>
    (await import('@/app/finance/paystack-transfers')).payEarlyThroughPaystack(ID);

  it('loads the keys first and sends with the saved one', async () => {
    db.rpc
      .mockResolvedValueOnce({
        data: {
          reference: 'NXT-abc12345',
          sent: false,
          amount_cents: 50000,
          test: true,
          recipient_code: 'RCP_unit1',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, state: 'pending' }, error: null });
    paystack.mockImplementation(async () => json({ status: true, data: { status: 'pending' } }));
    expect((await press()).ok).toBe(true);
    bearer().toBe(`Bearer ${KEY}`);
    expect(db.rpc.mock.calls[0]![1].p_proof).toBe(KEY);
  });

  it('does nothing without the keys', async () => {
    refuseKeys();
    expect(await press()).toEqual({ ok: false, message: 'Paystack is unavailable at the moment.' });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(paystack).not.toHaveBeenCalled();
  });
});

describe('looking up a sub-account', () => {
  const input = { code: CODE, schedule: 'weekly', note: '' };
  const presses = [
    [
      'a merchant request',
      async () => (await import('@/app/merchants/subaccount-actions')).requestSubaccount(ID, input),
    ],
    [
      'a merchant approval',
      async () =>
        (await import('@/app/merchants/subaccount-actions')).decideSubaccount(
          ID,
          ID,
          CODE,
          true,
          '',
        ),
    ],
    [
      'a host request',
      async () =>
        (await import('@/app/hotels/host-paystack-actions')).requestHostSubaccount(ID, input),
    ],
    [
      'a host approval',
      async () =>
        (await import('@/app/hotels/host-paystack-actions')).decideHostSubaccount(
          ID,
          CODE,
          true,
          '',
        ),
    ],
  ] as const;

  it.each(presses)('%s loads the keys and asks Paystack with the saved one', async (_n, press) => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    paystack.mockImplementation(async () =>
      json({ status: true, data: { subaccount_code: CODE } }),
    );
    expect((await press()).ok).toBe(true);
    bearer().toBe(`Bearer ${KEY}`);
  });

  it.each(presses)('%s does nothing without the keys', async (_n, press) => {
    refuseKeys();
    expect(await press()).toEqual({ ok: false, message: 'Paystack is unavailable at the moment.' });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(paystack).not.toHaveBeenCalled();
  });
});
