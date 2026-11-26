import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TOKEN = 'ci-only-server-token-0123456789abcdef';
const ENV_TEST = 'sk_test_ci_only_env_0123456789';
const ENV_LIVE = 'sk_live_ci_only_env_0123456789';
const VAULT_TEST = 'sk_test_ci_only_vault_0123456789';
const VAULT_LIVE = 'sk_live_ci_only_vault_0123456789';
/* 12:00:30 UTC, half way through a minute. */
const NOW = Date.UTC(2026, 10, 26, 12, 0, 30);

const answers = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const both = () => answers({ test: VAULT_TEST, live: VAULT_LIVE });
const refused = () => answers({ code: '42501', message: 'Not allowed.' }, 401);

const database = vi.fn();
const warn = vi.fn();

/* A server that has just started: nothing loaded. */
async function server() {
  vi.resetModules();
  return { ...(await import('./paystack-keys')), ...(await import('./paystack')) };
}

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  database.mockReset().mockImplementation(async () => both());
  warn.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(warn);
  vi.stubGlobal('fetch', database);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ci-anon-key');
  vi.stubEnv('PAYSTACK_KEYS_TOKEN', TOKEN);
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', ENV_TEST);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', ENV_LIVE);
  vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('without PAYSTACK_KEYS_TOKEN', () => {
  it('reads the environment keys and asks the database nothing', async () => {
    for (const unset of ['', '  \n']) {
      vi.stubEnv('PAYSTACK_KEYS_TOKEN', unset);
      const s = await server();
      expect(s.paystackProof('test')).toBe(ENV_TEST);
      await s.loadPaystackKeys();
      await s.refreshPaystackKeys();
      expect(s.paystackProof('live')).toBe(ENV_LIVE);
    }
    expect(database).not.toHaveBeenCalled();
  });
});

describe('with PAYSTACK_KEYS_TOKEN', () => {
  it('asks anonymously, uncached, with a proof for this minute', async () => {
    vi.stubEnv('PAYSTACK_KEYS_TOKEN', `  ${TOKEN}\n`);
    const s = await server();
    await s.loadPaystackKeys();

    expect(database).toHaveBeenCalledTimes(1);
    const [url, init] = database.mock.calls[0]!;
    expect(String(url)).toBe('https://db.example.test/rest/v1/rpc/rpc_paystack_server_keys');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init.headers);
    expect(headers.get('apikey')).toBe('ci-anon-key');
    expect(headers.get('authorization')).toBe('Bearer ci-anon-key');
    expect(headers.get('cookie')).toBeNull();
    const minute = Math.floor(NOW / 60_000);
    expect(JSON.parse(init.body)).toEqual({
      p_minute: minute,
      p_proof: crypto.createHmac('sha256', TOKEN).update(`paystack-keys:${minute}`).digest('hex'),
    });
  });

  it('has no key before a load, and only the database keys after it', async () => {
    const s = await server();
    expect(s.paystackConfigured()).toBe(false);
    expect(s.paystackMode()).toBeNull();
    await s.loadPaystackKeys();
    expect(s.paystackProof('test')).toBe(VAULT_TEST);
    expect(s.paystackProof('live')).toBe(VAULT_LIVE);
    expect(s.paystackMode()).toBe('test');
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    expect(s.paystackMode()).toBe('live');
  });

  it('never falls back to an environment key for one that is not saved', async () => {
    database.mockImplementation(async () => answers({ test: VAULT_TEST, live: null }));
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    const s = await server();
    await s.loadPaystackKeys();
    expect(s.paystackProof('live')).toBeNull();
    expect(s.paystackMode()).toBe('test');
  });

  it('refuses a database key in the wrong slot', async () => {
    database.mockImplementation(async () => answers({ test: VAULT_LIVE, live: VAULT_TEST }));
    const s = await server();
    await s.loadPaystackKeys();
    expect(s.paystackConfigured()).toBe(false);
  });

  it.each([
    ['the database refuses', async () => refused()],
    ['the function is not there', async () => answers({ code: 'PGRST202' }, 404)],
    ['the network is down', async () => Promise.reject(new TypeError('offline'))],
    ['the answer is not two keys', async () => answers({ test: VAULT_TEST })],
    ['the answer is empty', async () => answers(null)],
  ])('has no key when %s, and does not throw', async (_name, answer) => {
    database.mockImplementation(answer);
    const s = await server();
    await expect(s.loadPaystackKeys()).resolves.toBeUndefined();
    expect(s.paystackConfigured()).toBe(false);
    expect(s.paystackProof('test')).toBeNull();
    expect(s.paystackMode()).toBeNull();
  });

  it('has no key when this server has no Supabase address', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const s = await server();
    await expect(s.loadPaystackKeys()).resolves.toBeUndefined();
    expect(s.paystackConfigured()).toBe(false);
    expect(database).not.toHaveBeenCalled();
  });

  it('logs the error code only: never the token, a proof or a key', async () => {
    database.mockImplementation(async () =>
      answers({ code: '42501', message: `Not allowed ${TOKEN} ${VAULT_TEST}` }, 401),
    );
    const s = await server();
    await s.loadPaystackKeys();
    expect(warn.mock.calls).toEqual([['Paystack keys could not be loaded', { code: '42501' }]]);
  });

  it('keeps the keys for 30 seconds, then asks again', async () => {
    const s = await server();
    await s.loadPaystackKeys();
    later(29_999);
    await s.loadPaystackKeys();
    expect(database).toHaveBeenCalledTimes(1);

    database.mockImplementation(async () => answers({ test: null, live: null }));
    later(1);
    await s.loadPaystackKeys();
    expect(database).toHaveBeenCalledTimes(2);
    /* Removed in the console: gone here too. */
    expect(s.paystackConfigured()).toBe(false);
  });

  it('makes one fetch for loads that arrive together', async () => {
    const s = await server();
    await Promise.all([s.loadPaystackKeys(), s.loadPaystackKeys(), s.loadPaystackKeys()]);
    expect(database).toHaveBeenCalledTimes(1);
    expect(s.paystackProof('test')).toBe(VAULT_TEST);
  });

  it('drops expired keys when they cannot be fetched again', async () => {
    const s = await server();
    await s.loadPaystackKeys();
    database.mockImplementation(async () => refused());
    later(30_000);
    await s.loadPaystackKeys();
    expect(s.paystackConfigured()).toBe(false);

    database.mockImplementation(async () => both());
    await s.loadPaystackKeys();
    expect(s.paystackProof('test')).toBe(VAULT_TEST);
  });

  it('stops reading keys two minutes after the last fetch, load or no load', async () => {
    const s = await server();
    await s.loadPaystackKeys();
    later(119_999);
    expect(s.paystackProof('test')).toBe(VAULT_TEST);
    later(1);
    expect(s.paystackProof('test')).toBeNull();
  });

  it('refreshes early at most once every 5 seconds', async () => {
    const s = await server();
    await s.loadPaystackKeys();
    database.mockImplementation(async () => answers({ test: null, live: VAULT_LIVE }));

    await s.refreshPaystackKeys();
    expect(database).toHaveBeenCalledTimes(2);
    expect(s.paystackProof('test')).toBeNull();

    later(4_999);
    await s.refreshPaystackKeys();
    expect(database).toHaveBeenCalledTimes(2);
    later(1);
    await s.refreshPaystackKeys();
    expect(database).toHaveBeenCalledTimes(3);
  });

  it('shares an early refresh with whoever asks while it runs', async () => {
    const s = await server();
    await s.loadPaystackKeys();
    database.mockImplementation(async () => answers({ test: null, live: VAULT_LIVE }));
    const seen = await Promise.all(
      [1, 2].map(async () => {
        await s.refreshPaystackKeys();
        return s.paystackProof('test');
      }),
    );
    expect(seen).toEqual([null, null]);
    expect(database).toHaveBeenCalledTimes(2);
  });

  it('keeps keys that are still fresh when an early refresh fails', async () => {
    const s = await server();
    await s.loadPaystackKeys();
    database.mockImplementation(async () => refused());
    later(10_000);
    await s.refreshPaystackKeys();
    expect(s.paystackProof('test')).toBe(VAULT_TEST);
    later(20_000);
    await s.loadPaystackKeys();
    expect(s.paystackProof('test')).toBeNull();
  });
});
