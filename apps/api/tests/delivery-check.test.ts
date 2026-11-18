import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * POST /v1/delivery/check: "can you deliver here?". Supabase is replaced by
 * a fake that answers the key lookup, the rate limiter and the check, and
 * records what was called. The rules themselves live in the database and
 * are tested there (supabase/tests/105_api_delivery_check.sql).
 */

const { rpc, createClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { POST as check } from '../app/v1/delivery/check/route';

type Result = { data: unknown; error: unknown };

const TRIP = {
  pickup_lat: -1.2648,
  pickup_lng: 36.8027,
  dropoff_lat: -1.2921,
  dropoff_lng: 36.7865,
};
const DELIVERABLE = {
  deliverable: true,
  reason: null,
  message: null,
  city_slug: 'nairobi',
  city_name: 'Nairobi',
  pickup: { served: true, zone_id: '8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', zone_name: 'Westlands' },
  dropoff: {
    served: true,
    zone_id: '7f1e2d3c-4b5a-4968-8776-655443322110',
    zone_name: 'Kilimani',
    paused: false,
  },
  distance_km: 3.5,
  max_distance_km: 15,
  eta_min: 20,
  eta_max: 30,
  delivery_fee_cents: 15500,
  currency: 'KES',
};
const PAUSED = {
  ...DELIVERABLE,
  deliverable: false,
  reason: 'dropoff_paused',
  message: 'Deliveries into Kilimani are paused right now · Heavy rain.',
  dropoff: { ...DELIVERABLE.dropoff, paused: true },
  eta_min: null,
  eta_max: null,
  delivery_fee_cents: null,
};
const KEY = {
  key_id: '11111111-1111-4111-8111-111111111111',
  merchant_id: null,
  scopes: ['public_read'],
  rate_limit: 60,
  environment: 'live',
};

/** The key the lookup returns, and the check's answer. */
function answer(result: Result) {
  rpc.mockImplementation(async (name: string) => {
    if (name === 'fn_api_key_lookup') return { data: [KEY], error: null };
    if (name === 'fn_api_request_spend') {
      return { data: [{ allowed: true, retry_after: 0, remaining: 59 }], error: null };
    }
    if (name === 'rpc_delivery_check') return result;
    throw new Error(`unexpected rpc ${name}`);
  });
}
const calls = (name: string) => rpc.mock.calls.filter(([n]) => n === name);

const post = (body: unknown, headers: Record<string, string> = {}) =>
  check(
    new Request('https://api.test/v1/delivery/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
  vi.stubEnv('API_TRUSTED_PROXY_IP_HEADER', '');
  createClient.mockReturnValue({ rpc });
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe('POST /v1/delivery/check', () => {
  it('answers without a key, from the check, never cached', async () => {
    answer({ data: DELIVERABLE, error: null });

    const res = await post(TRIP);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: DELIVERABLE, meta: { api_version: 'v1' } });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('nexg-environment')).toBeNull();
    expect(calls('rpc_delivery_check')[0]?.[1]).toEqual({
      p_pickup_lat: -1.2648,
      p_pickup_lng: 36.8027,
      p_dropoff_lat: -1.2921,
      p_dropoff_lng: 36.7865,
    });
    expect(calls('fn_api_key_lookup')).toHaveLength(0);
    expect(calls('fn_api_request_spend')[0]?.[1]).toMatchObject({
      p_raw_key: null,
      p_operation: 'public_read',
    });
  });

  it('asks the database with the anonymous key and a fetch that never caches', async () => {
    answer({ data: DELIVERABLE, error: null });

    await post(TRIP);

    const checkClient = createClient.mock.calls.find(([, key]) => key === 'test-anon-key');
    expect(checkClient?.[2]?.global?.fetch).toBeTypeOf('function');
    expect(createClient.mock.calls.some(([, key]) => key === 'test-server-key')).toBe(true);
  });

  it('spends a key’s own tokens and says which environment answered', async () => {
    answer({ data: DELIVERABLE, error: null });

    const res = await post(TRIP, { 'x-api-key': 'a-public-key' });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('nexg-environment')).toBe('live');
    expect(res.headers.get('ratelimit-remaining')).toBe('59');
    expect(calls('fn_api_request_spend')[0]?.[1]).toMatchObject({
      p_raw_key: 'a-public-key',
      p_operation: 'public_read',
    });
  });

  it('answers a trip NexG cannot take with 200 and the reason', async () => {
    answer({ data: PAUSED, error: null });

    const res = await post(TRIP);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deliverable).toBe(false);
    expect(body.data.reason).toBe('dropoff_paused');
    expect(body.data.delivery_fee_cents).toBeNull();
  });

  it('refuses a body that is not JSON, before asking the database', async () => {
    answer({ data: DELIVERABLE, error: null });

    const res = await post('pickup=here');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.fields.body).toContain('pickup_lat');
    expect(calls('rpc_delivery_check')).toHaveLength(0);
  });

  it('names a missing or out-of-range coordinate, and a field it does not take', async () => {
    answer({ data: DELIVERABLE, error: null });

    const res = await post({
      pickup_lat: 91,
      pickup_lng: 36.8027,
      dropoff_lat: '-1.29',
      address: 'Kilimani',
    });

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe('invalid_request');
    expect(Object.keys(error.fields).sort()).toEqual([
      'address',
      'dropoff_lat',
      'dropoff_lng',
      'pickup_lat',
    ]);
    expect(calls('rpc_delivery_check')).toHaveLength(0);
  });

  it('passes on a coordinate the database refuses', async () => {
    answer({
      data: null,
      error: { code: '22023', message: 'The pickup and the drop-off each need a latitude…' },
    });

    const res = await post(TRIP);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
  });

  it('answers 500 without the database’s words when the check fails', async () => {
    answer({ data: null, error: { code: 'XX000', message: 'relation "zone" is broken' } });

    const res = await post(TRIP);

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('internal_error');
    expect(text).not.toContain('broken');
  });

  it('answers 500 when the database’s answer does not match the contract', async () => {
    answer({ data: { ...DELIVERABLE, delivery_fee_cents: 155.5 }, error: null });

    const res = await post(TRIP);

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('internal_error');
  });
});
