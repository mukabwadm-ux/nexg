import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * POST /v1/test/orders/{id}/status: a test key moves a test booking to a
 * later status. Supabase is replaced by a fake that answers the key lookup,
 * the rate limiter and the sandbox function, and records what was called.
 */

const { rpc, createClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { POST as moveTestOrder } from '../app/v1/test/orders/[id]/status/route';
import { consoleMoves } from '../lib/sandbox';

type Result = { data: unknown; error: unknown };

const ORDER_ID = '7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7';
const SCOPES = ['public_read', 'merchant_read', 'merchant_write'];
const TEST_KEY = {
  key_id: '11111111-1111-4111-8111-111111111111',
  merchant_id: '22222222-2222-4222-8222-222222222222',
  scopes: SCOPES,
  rate_limit: 60,
  environment: 'test',
};
const MOVED_ORDER = {
  order_id: ORDER_ID,
  reference: 'TEST-261117-A1B2C3',
  service: 'airport_transfer',
  quantity: 2,
  status: 'confirmed',
  stage: 'confirmed',
  payment_method: 'on_account',
  payment_status: 'pending',
  currency: 'KES',
  total_cents: 200000,
  scheduled_for: null,
  pickup_label: 'JKIA Terminal 1A',
  dropoff_label: 'Woodvale Grove, Westlands, Nairobi',
  created_at: '2026-11-17T09:12:44.512+00:00',
};

/** The key the lookup returns, and the sandbox function's answer. */
function answer(
  move: (args: Record<string, unknown>) => Result,
  key: Record<string, unknown> = TEST_KEY,
) {
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'fn_api_key_lookup') return { data: [key], error: null };
    if (name === 'fn_api_request_spend') {
      return { data: [{ allowed: true, retry_after: 0, remaining: 40 }], error: null };
    }
    if (name === 'rpc_order_status_api_test') return move(args);
    throw new Error(`unexpected rpc ${name}`);
  });
}
const moved = () => ({
  data: { ok: true, order: MOVED_ORDER, previous_status: 'requested' },
  error: null,
});
const moveCalls = () => rpc.mock.calls.filter(([name]) => name === 'rpc_order_status_api_test');

const post = (body: unknown, id = ORDER_ID, headers: Record<string, string> = {}) =>
  moveTestOrder(
    new Request(`https://api.test/v1/test/orders/${id}/status`, {
      method: 'POST',
      headers: {
        'x-api-key': 'nexg_test_a-sandbox-key',
        'content-type': 'application/json',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: { id } },
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

describe('POST /v1/test/orders/{id}/status', () => {
  it('moves a test booking and answers with it and the status it had', async () => {
    answer(moved);

    const res = await post({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { order: MOVED_ORDER, previous_status: 'requested' },
      meta: { api_version: 'v1' },
    });
    expect(res.headers.get('nexg-environment')).toBe('test');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(moveCalls()).toHaveLength(1);
    expect(moveCalls()[0]?.[1]).toEqual({
      p_api_key: 'nexg_test_a-sandbox-key',
      p_order_id: ORDER_ID,
      p_status: 'confirmed',
    });
    const spend = rpc.mock.calls.find(([name]) => name === 'fn_api_request_spend')?.[1];
    expect(spend).toMatchObject({ p_operation: 'merchant_write' });
  });

  it('refuses a live key without asking the database to move anything', async () => {
    answer(moved, { ...TEST_KEY, environment: 'live' });

    const res = await post({ status: 'confirmed' });

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/^Only a test key/);
    expect(moveCalls()).toHaveLength(0);
  });

  it('refuses a key without merchant_write, and a key bound to no merchant', async () => {
    answer(moved, { ...TEST_KEY, scopes: ['public_read', 'merchant_read'] });
    expect((await post({ status: 'confirmed' })).status).toBe(403);

    answer(moved, { ...TEST_KEY, merchant_id: null });
    const unbound = await post({ status: 'confirmed' });
    expect(unbound.status).toBe(403);
    expect((await unbound.json()).error.message).toMatch(/not bound to a merchant/);

    expect(moveCalls()).toHaveLength(0);
  });

  it('refuses an id that is not a UUID, a body that is not JSON, and an unknown status', async () => {
    answer(moved);

    const badId = await post({ status: 'confirmed' }, 'TEST-261117-A1B2C3');
    expect(badId.status).toBe(400);
    expect((await badId.json()).error.fields).toHaveProperty('id');

    const notJson = await post('confirmed');
    expect(notJson.status).toBe(400);

    const unknown = await post({ status: 'shipped' });
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error.fields).toEqual({
      status: 'One of confirmed, in_progress, completed or cancelled.',
    });

    const extra = await post({ status: 'confirmed', stage: 'picked_up' });
    expect(extra.status).toBe(400);
    expect((await extra.json()).error.fields).toEqual({
      stage: 'Not a field this endpoint takes.',
    });

    expect(moveCalls()).toHaveLength(0);
  });

  it('answers a booking that cannot move there with 400 and the reason', async () => {
    answer(() => ({
      data: null,
      error: {
        code: '22023',
        message:
          'A test booking only moves forward. From in_progress it can go to completed, cancelled.',
      },
    }));

    const res = await post({ status: 'confirmed' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toBe(
      'A test booking only moves forward. From in_progress it can go to completed, cancelled.',
    );
  });

  it('answers 404 for a booking this merchant does not have', async () => {
    answer(() => ({ data: null, error: { code: 'P0002', message: 'That order does not exist.' } }));

    const res = await post({ status: 'completed' });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('answers a refused key with 401, other refusals with 403, and anything else with 500', async () => {
    answer(() => ({ data: null, error: { code: '42501', message: 'That API key is not valid.' } }));
    expect((await post({ status: 'confirmed' })).status).toBe(401);

    answer(() => ({
      data: null,
      error: {
        code: '42501',
        message: 'This key cannot move test bookings: it needs merchant_write.',
      },
    }));
    expect((await post({ status: 'confirmed' })).status).toBe(403);

    answer(() => ({ data: null, error: { code: 'XX000', message: 'boom' } }));
    const failed = await post({ status: 'confirmed' });
    expect(failed.status).toBe(500);
    expect((await failed.json()).error.message).toBe('The test booking could not be moved.');
  });

  it('answers 500 when the moved booking cannot be read back', async () => {
    answer(() => ({ data: { ok: true }, error: null }));

    const res = await post({ status: 'confirmed' });

    expect(res.status).toBe(500);
  });
});

describe('the console’s buttons', () => {
  it('offer the next step on, and cancel, until the booking is final', () => {
    expect(consoleMoves(['confirmed', 'in_progress', 'completed', 'cancelled'])).toEqual([
      'confirmed',
      'cancelled',
    ]);
    expect(consoleMoves(['in_progress', 'completed', 'cancelled'])).toEqual([
      'in_progress',
      'cancelled',
    ]);
    expect(consoleMoves(['completed', 'cancelled'])).toEqual(['completed', 'cancelled']);
    expect(consoleMoves([])).toEqual([]);
  });
});
