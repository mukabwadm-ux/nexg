import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* The webhook with PAYSTACK_KEYS_TOKEN set: keys saved in the console. */

vi.mock('server-only', () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({ rpc }) }));

const ENV_KEY = 'sk_test_ci_only_env_0123456789';
const OLD = 'sk_test_ci_only_old_0123456789';
const NEW = 'sk_test_ci_only_new_0123456789';
const body = '{"event":"charge.success","data":{"reference":"NXP-1-1","amount":150000}}';
const sign = (key: string) => crypto.createHmac('sha512', key).update(body).digest('hex');

/* What the database answers when asked for the keys. */
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
type Route = Awaited<ReturnType<typeof route>>;

function call({ POST }: Route, signature: string | null) {
  return POST(
    new Request('https://www.nexgapp.com/api/payments/paystack/webhook', {
      method: 'POST',
      headers: signature ? { 'x-paystack-signature': signature } : {},
      body,
    }),
  );
}

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 10, 26, 12, 0, 30));
  rpc.mockReset().mockResolvedValue({ data: { ok: true, state: 'paid' }, error: null });
  keys.mockReset().mockImplementation(async () => saved(OLD));
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

describe('Paystack webhook with keys saved in the console', () => {
  it('loads the keys first, then takes a body signed with one of them', async () => {
    const r = await route();
    expect((await call(r, sign(OLD))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('rpc_payment_paystack_webhook', {
      p_raw_body: body,
      p_signature: sign(OLD),
    });
    expect(keys).toHaveBeenCalledTimes(1);
  });

  it('answers 503 and touches nothing when the keys cannot be fetched', async () => {
    keys.mockImplementation(async () => refused());
    const r = await route();
    /* The environment key is ignored, even though it signed this body. */
    expect((await call(r, sign(ENV_KEY))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    expect(await (await r.GET()).json()).toMatchObject({ configured: false });
  });

  it('says it is configured once the keys load', async () => {
    const r = await route();
    expect(await (await r.GET()).json()).toMatchObject({ configured: true });
  });

  it('never accepts the environment key', async () => {
    const r = await route();
    expect((await call(r, sign(ENV_KEY))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fetches again for a key just changed in the console', async () => {
    const r = await route();
    expect((await call(r, sign(OLD))).status).toBe(200);
    keys.mockImplementation(async () => saved(NEW));
    later(1_000);
    expect((await call(r, sign(NEW))).status).toBe(200);
    expect(keys).toHaveBeenCalledTimes(2);
    /* The old key is no longer taken. */
    expect((await call(r, sign(OLD))).status).toBe(401);
  });

  it('refuses forged calls, fetching early at most once every 5 seconds', async () => {
    const r = await route();
    const forged = sign('sk_test_someone_else_0123456789');
    expect((await call(r, forged)).status).toBe(401);
    expect(keys).toHaveBeenCalledTimes(2);
    later(4_000);
    expect((await call(r, forged)).status).toBe(401);
    expect((await call(r, null)).status).toBe(401);
    expect(keys).toHaveBeenCalledTimes(2);
    later(1_000);
    expect((await call(r, forged)).status).toBe(401);
    expect(keys).toHaveBeenCalledTimes(3);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('answers 503 once old keys expire and cannot be fetched again', async () => {
    const r = await route();
    expect((await call(r, sign(OLD))).status).toBe(200);
    keys.mockImplementation(async () => refused());
    later(30_000);
    rpc.mockClear();
    expect((await call(r, sign(OLD))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('answers 503 when the console has removed the keys', async () => {
    const r = await route();
    expect((await call(r, sign(OLD))).status).toBe(200);
    keys.mockImplementation(async () => saved(null));
    later(30_000);
    expect((await call(r, sign(OLD))).status).toBe(503);
  });
});
