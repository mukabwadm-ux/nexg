import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, createClient } = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { authenticate, enforceRateLimit, requireScope, trustedAnonymousIp } from '../lib/auth';
import { jsonError } from '../lib/http';
import { GET as orders } from '../app/v1/orders/route';
import { GET as services } from '../app/v1/services/route';

const keyRow = {
  key_id: '11111111-1111-4111-8111-111111111111',
  merchant_id: '22222222-2222-4222-8222-222222222222',
  scopes: ['public_read', 'merchant_read'],
  rate_limit: 60,
};
const keyedRequest = () =>
  new Request('https://api.test/v1/orders', { headers: { 'x-api-key': 'existing-consumer-key' } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
  vi.stubEnv('API_TRUSTED_PROXY_IP_HEADER', '');
  createClient.mockReturnValue({ rpc });
});
afterEach(() => vi.unstubAllEnvs());

describe('API credential boundary', () => {
  it('preserves an existing valid key and its merchant scope', async () => {
    rpc.mockResolvedValue({ data: [keyRow], error: null });
    const credential = await authenticate(keyedRequest());
    expect(credential).toEqual({
      keyId: '11111111-1111-4111-8111-111111111111',
      rawKey: 'existing-consumer-key',
      merchantId: '22222222-2222-4222-8222-222222222222',
      scopes: ['public_read', 'merchant_read'],
      rateLimit: 60,
      anonymous: false,
    });
    expect(() => requireScope(credential, 'merchant_write')).toThrow(
      'This credential does not have the scope for that.',
    );
  });

  it.each([[], null])('rejects unusable keys without revealing why', async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(authenticate(keyedRequest())).rejects.toMatchObject({
      status: 401,
      code: 'not_found',
    });
  });

  it('rejects conflicting headers and blank supplied credentials', async () => {
    await expect(
      authenticate(
        new Request('https://api.test', {
          headers: {
            'x-api-key': 'key-a',
            authorization: 'Bearer key-b',
          },
        }),
      ),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_request' });
    await expect(
      authenticate(new Request('https://api.test', { headers: { 'x-api-key': '' } })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('fails closed on unknown scope or lookup outage', async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...keyRow, scopes: ['invented_admin'] }], error: null });
    await expect(authenticate(keyedRequest())).rejects.toMatchObject({ status: 503 });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'private backend error' } });
    await expect(authenticate(keyedRequest())).rejects.toMatchObject({
      status: 503,
      message: 'The API key could not be checked.',
    });
  });
});

describe('fleet rate limit boundary', () => {
  it('counts anonymous reads and ignores spoofed forwarding headers by default', async () => {
    const request = new Request('https://api.test/v1/zones', {
      headers: { 'x-forwarded-for': '192.0.2.44' },
    });
    const credential = await authenticate(request);
    expect(credential.anonymous).toBe(true);
    rpc.mockResolvedValue({
      data: [{ allowed: false, retry_after: 2, remaining: 0 }],
      error: null,
    });
    await expect(enforceRateLimit(credential, request)).rejects.toMatchObject({
      status: 429,
      retryAfter: 2,
    });
    expect(rpc.mock.calls[0]).toEqual([
      'fn_api_request_spend',
      {
        p_raw_key: null,
        p_anonymous_ip: null,
        p_operation: 'public_read',
      },
    ]);
  });

  it('uses only one validated ingress address and canonicalizes IPv6', () => {
    vi.stubEnv('API_TRUSTED_PROXY_IP_HEADER', 'x-nexg-client-ip');
    expect(
      trustedAnonymousIp(
        new Request('https://api.test', {
          headers: { 'x-nexg-client-ip': '2001:0db8:0:0:0:0:0:1' },
        }),
      ),
    ).toBe('2001:db8::1');
    expect(
      trustedAnonymousIp(
        new Request('https://api.test', {
          headers: { 'x-nexg-client-ip': '192.0.2.1, 192.0.2.2' },
        }),
      ),
    ).toBe(null);
    expect(
      trustedAnonymousIp(
        new Request('https://api.test', { headers: { 'x-nexg-client-ip': 'untrusted' } }),
      ),
    ).toBe(null);
  });

  it('fails closed when the limiter is unavailable or malformed', async () => {
    const request = new Request('https://api.test/v1/zones');
    const credential = await authenticate(request);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection unavailable' } });
    await expect(enforceRateLimit(credential, request)).rejects.toMatchObject({ status: 503 });
    rpc.mockResolvedValueOnce({ data: [{ allowed: true, retry_after: 'unknown' }], error: null });
    await expect(enforceRateLimit(credential, request)).rejects.toMatchObject({ status: 503 });
  });

  it('returns Retry-After and no-store on the actual services route', async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, retry_after: 4, remaining: 0 }],
      error: null,
    });
    const response = await services(new Request('https://api.test/v1/services'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('4');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
  });
});

describe('private orders response', () => {
  it('charges merchant-read work and never caches merchant orders', async () => {
    rpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === 'fn_api_key_lookup'
          ? [keyRow]
          : name === 'fn_api_request_spend'
            ? [{ allowed: true, retry_after: 0, remaining: 57 }]
            : { ok: true, items: [{ id: 'order-one' }], next_cursor: null },
    }));
    const response = await orders(keyedRequest(), { params: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { items: [{ id: 'order-one' }], next_cursor: null },
      meta: { api_version: 'v1', limit: 25 },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(rpc.mock.calls.find(([name]) => name === 'fn_api_request_spend')).toEqual([
      'fn_api_request_spend',
      { p_raw_key: 'existing-consumer-key', p_anonymous_ip: null, p_operation: 'merchant_read' },
    ]);
  });

  it('returns a private 401 for current-state denied credentials', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const response = await orders(keyedRequest(), { params: {} });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'not_found', message: 'That API key is not valid.' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps the v1 error envelope and emits a safe request identifier', async () => {
    const response = jsonError('rate_limited', 'Try again later.', {
      status: 429,
      retryAfter: 1.1,
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('2');
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'rate_limited', message: 'Try again later.' },
      meta: { api_version: 'v1' },
    });
  });
});
