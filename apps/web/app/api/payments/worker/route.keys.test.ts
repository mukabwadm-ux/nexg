import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* The Paystack sweep with PAYSTACK_KEYS_TOKEN set: keys saved in the console. */

const { sweepPaystack, settleBookings, sendRiderPayouts, settleDuePrompts, sendQueuedPayouts } =
  vi.hoisted(() => ({
    sweepPaystack: vi.fn(),
    settleBookings: vi.fn(),
    sendRiderPayouts: vi.fn(),
    settleDuePrompts: vi.fn(),
    sendQueuedPayouts: vi.fn(),
  }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/order-payment', () => ({ sweepPaystack }));
vi.mock('@/lib/booking-payment', () => ({ settleBookings }));
vi.mock('@/lib/rider-payouts', () => ({ sendRiderPayouts }));
vi.mock('@/lib/mpesa-prompt', () => ({ settleDuePrompts }));
vi.mock('@/lib/mpesa-payout', () => ({ sendQueuedPayouts }));
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({ rpc: vi.fn() }) }));

const ENV_KEY = 'sk_test_ci_only_env_0123456789';
const OLD = 'sk_test_ci_only_old_0123456789';
const NEW = 'sk_test_ci_only_new_0123456789';
const NOW = Date.UTC(2026, 10, 26, 12, 0, 30);

const keys = vi.fn();
const saved = (test: string | null) =>
  new Response(JSON.stringify({ test, live: null }), {
    headers: { 'Content-Type': 'application/json' },
  });
const refused = () => new Response(JSON.stringify({ code: '42501' }), { status: 401 });

async function route() {
  vi.resetModules();
  return import('./route');
}

const signed = (key: string) =>
  crypto
    .createHmac('sha256', key)
    .update(`paystack-sweep:${Math.floor(Date.now() / 60_000)}`)
    .digest('hex');

function sweep({ POST }: Awaited<ReturnType<typeof route>>, header: string) {
  return POST(
    new Request('https://www.nexgapp.com/api/payments/worker', {
      method: 'POST',
      headers: { 'x-paystack-worker': header },
      body: JSON.stringify({ action: 'paystack_sweep' }),
    }),
  );
}

const ranNothing = () => {
  expect(sweepPaystack).not.toHaveBeenCalled();
  expect(settleBookings).not.toHaveBeenCalled();
  expect(sendRiderPayouts).not.toHaveBeenCalled();
  expect(settleDuePrompts).not.toHaveBeenCalled();
  expect(sendQueuedPayouts).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.resetAllMocks();
  keys.mockImplementation(async () => saved(OLD));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', keys);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ci-anon-key');
  vi.stubEnv('PAYSTACK_KEYS_TOKEN', 'ci-only-server-token-0123456789abcdef');
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', ENV_KEY);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Paystack sweep with keys saved in the console', () => {
  it('loads the keys first, then runs a sweep signed with one of them', async () => {
    const r = await route();
    expect((await sweep(r, signed(OLD))).status).toBe(200);
    expect(sweepPaystack).toHaveBeenCalledTimes(1);
    expect(keys).toHaveBeenCalledTimes(1);
  });

  it('refuses every sweep when the keys cannot be fetched', async () => {
    keys.mockImplementation(async () => refused());
    const r = await route();
    for (const header of [signed(ENV_KEY), signed(OLD), 'ab'.repeat(32), '']) {
      expect((await sweep(r, header)).status).toBe(401);
    }
    ranNothing();
  });

  it('refuses the environment key and forged signatures, fetching early once', async () => {
    const r = await route();
    expect((await sweep(r, signed(ENV_KEY))).status).toBe(401);
    expect((await sweep(r, 'ab'.repeat(32))).status).toBe(401);
    expect(keys).toHaveBeenCalledTimes(2);
    ranNothing();
  });

  it('fetches again for a key just changed in the console', async () => {
    const r = await route();
    expect((await sweep(r, signed(OLD))).status).toBe(200);
    keys.mockImplementation(async () => saved(NEW));
    vi.setSystemTime(NOW + 1_000);
    expect((await sweep(r, signed(NEW))).status).toBe(200);
    expect(keys).toHaveBeenCalledTimes(2);
  });
});
