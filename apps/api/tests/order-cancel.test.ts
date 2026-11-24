import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * POST /v1/orders/{id}/cancel: cancelling an API booking. Supabase is
 * replaced by a fake that answers the key lookup, the rate limiter and the
 * cancel function, and records what was called. The rules live in the
 * database and are tested there (supabase/tests/191_api_order_cancel.sql).
 */

const { rpc, createClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { POST as cancel } from '../app/v1/orders/[id]/cancel/route';

type Result = { data: unknown; error: unknown };

const ORDER_ID = '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b';
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
const ORDER = { order_id: ORDER_ID, status: 'cancelled', stage: 'cancelled' };
const KEY = {
  key_id: '11111111-1111-4111-8111-111111111111',
  merchant_id: MERCHANT_ID,
  scopes: ['public_read', 'merchant_read', 'merchant_write'],
  rate_limit: 60,
  environment: 'live',
};

function answer(result: Result, key: object = KEY) {
  rpc.mockImplementation(async (name: string) => {
    if (name === 'fn_api_key_lookup') return { data: [key], error: null };
    if (name === 'fn_api_request_spend') {
      return { data: [{ allowed: true, retry_after: 0, remaining: 55 }], error: null };
    }
    if (name === 'rpc_order_cancel_api') return result;
    throw new Error(`unexpected rpc ${name}`);
  });
}
const calls = (name: string) => rpc.mock.calls.filter(([n]) => n === name);
const spentAs = () =>
  (rpc.mock.calls.find(([n]) => n === 'fn_api_request_spend')?.[1] as { p_operation?: string })
    ?.p_operation;

const post = (body?: string, id = ORDER_ID) =>
  cancel(
    new Request(`https://api.test/v1/orders/${id}/cancel`, {
      method: 'POST',
      headers: { 'x-api-key': 'a-booking-key', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body }),
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

describe('POST /v1/orders/{id}/cancel', () => {
  it('cancels the booking and answers with it', async () => {
    answer({
      data: { ok: true, cancelled: true, order: ORDER, previous_status: 'requested' },
      error: null,
    });

    const res = await post(JSON.stringify({ reason: 'Flight moved.' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { order: ORDER, cancelled: true, previous_status: 'requested' },
      meta: { api_version: 'v1' },
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(calls('rpc_order_cancel_api')[0]?.[1]).toEqual({
      p_api_key: 'a-booking-key',
      p_order_id: ORDER_ID,
      p_reason: 'Flight moved.',
    });
    expect(spentAs()).toBe('merchant_write');
  });

  it('takes no body at all', async () => {
    answer({
      data: { ok: true, cancelled: false, order: ORDER, previous_status: 'cancelled' },
      error: null,
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect((await res.json()).data.cancelled).toBe(false);
    expect(calls('rpc_order_cancel_api')[0]?.[1]).toMatchObject({ p_reason: null });
  });

  it('refuses a malformed request before asking the database', async () => {
    answer({ data: null, error: null });

    expect((await post(undefined, 'not-an-id')).status).toBe(400);
    expect((await post('reason=late')).status).toBe(400);
    const extra = await post(JSON.stringify({ reason: 'x', refund: true }));
    expect((await extra.json()).error.fields).toEqual({
      refund: 'Not a field this endpoint takes: only reason.',
    });
    const long = await post(JSON.stringify({ reason: 'x'.repeat(501) }));
    expect((await long.json()).error.fields).toEqual({ reason: 'Up to 500 characters.' });

    expect(calls('rpc_order_cancel_api')).toHaveLength(0);
  });

  it('answers 409 conflict once a rider has the booking', async () => {
    answer({
      data: null,
      error: {
        code: 'P0004',
        message:
          'A rider has taken this booking, so it can no longer be cancelled through the API. Contact NexG support.',
      },
    });

    const res = await post();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: 'conflict',
      message: expect.stringMatching(/^A rider has taken this booking/),
    });
  });

  it('answers 404 for a booking that is not this merchant’s API booking', async () => {
    answer({ data: null, error: { code: 'P0002', message: 'That order does not exist.' } });
    const res = await post();
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('refuses a key without merchant_write, and one bound to no merchant', async () => {
    answer({ data: null, error: null }, { ...KEY, scopes: ['public_read', 'merchant_read'] });
    expect((await post()).status).toBe(403);
    expect(calls('fn_api_request_spend')).toHaveLength(0);

    answer({ data: null, error: null }, { ...KEY, merchant_id: null });
    const unbound = await post();
    expect(unbound.status).toBe(403);
    expect((await unbound.json()).error.message).toMatch(/not bound to a merchant/);

    expect(calls('rpc_order_cancel_api')).toHaveLength(0);
  });

  it('passes key refusals on and hides other database failures', async () => {
    answer({ data: null, error: { code: '42501', message: 'That API key is not valid.' } });
    expect((await post()).status).toBe(401);

    answer({ data: null, error: { code: 'XX000', message: 'relation is broken' } });
    const failed = await post();
    expect(failed.status).toBe(500);
    const text = await failed.text();
    expect(text).toContain('The booking could not be cancelled.');
    expect(text).not.toContain('broken');
  });
});
