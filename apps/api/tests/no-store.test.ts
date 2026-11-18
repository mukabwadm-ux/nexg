import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Key checks, token spends and a merchant's own records must come from the
 * database every time. Next 14 keeps fetch answers in its Data Cache (for a
 * route's revalidate seconds, or with no expiry), which let one cached key
 * check and token spend answer for minutes on the public read endpoints: a
 * revoked key kept working, and repeated requests spent no tokens. Every
 * client that does those things must fetch with cache: 'no-store'.
 */

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { authenticate, enforceRateLimit } from '../lib/auth';
import { catalogueClient } from '../lib/catalogue';
import { noStoreFetch } from '../lib/no-store';
import { orderReader, orderWriter, sandboxMover } from '../lib/orders';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
  vi.stubEnv('API_TRUSTED_PROXY_IP_HEADER', '');
  createClient.mockReturnValue({
    rpc: async (name: string) =>
      name === 'fn_api_key_lookup'
        ? {
            data: [
              {
                key_id: '11111111-1111-4111-8111-111111111111',
                merchant_id: null,
                scopes: ['public_read'],
                rate_limit: 60,
                environment: 'live',
              },
            ],
            error: null,
          }
        : { data: [{ allowed: true, retry_after: 0, remaining: 59 }], error: null },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('database calls that must never come from a cache', () => {
  it('asks fetch neither to store nor to reuse the answer', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await noStoreFetch('https://example.supabase.co/rest/v1/rpc/fn_api_key_lookup', {
      method: 'POST',
      body: '{}',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/fn_api_key_lookup',
      { method: 'POST', body: '{}', cache: 'no-store' },
    );
  });

  it('is used for the key check and the token spend', async () => {
    const request = new Request('https://api.test/v1/zones', { headers: { 'x-api-key': 'a-key' } });
    const credential = await authenticate(request);
    await enforceRateLimit(credential, request, 'public_read');

    expect(createClient).toHaveBeenCalledTimes(2);
    for (const [, , options] of createClient.mock.calls) {
      expect(options).toMatchObject({ global: { fetch: noStoreFetch } });
    }
  });

  it('is used for orders, test bookings and the merchant’s catalogue', () => {
    orderReader();
    orderWriter();
    sandboxMover();
    catalogueClient();

    expect(createClient).toHaveBeenCalledTimes(4);
    for (const [, , options] of createClient.mock.calls) {
      expect(options).toMatchObject({ global: { fetch: noStoreFetch } });
    }
  });
});
