import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { refundCinemaHold } from './refund';
import type { Rpc } from './service';

const TEST = 'sk_test_ci_only_0123456789';
const LIVE = 'sk_live_ci_only_0123456789';
const HOLD = '22222222-2222-4222-8222-222222222222';
const REF = 'NXR-0123456789abcdef0123456789abcdef';

const opened = (more: Record<string, unknown> = {}) => ({
  reference: REF,
  amount_cents: 130000,
  mode: 'test',
  paystack_transaction: '4099260516',
  state: 'opened',
  ...more,
});

function fakeDb(open: {
  data?: unknown;
  error?: { message: string; code?: string; hint?: string };
}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args = {}) => {
    calls.push({ fn, args });
    if (fn === 'fn_cinema_refund_open')
      return { data: open.data ?? null, error: open.error ?? null };
    return { data: { ok: true }, error: null };
  };
  return { rpc, calls };
}

const paystackSays = (status: number, body: object) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('refunding a cinema hold', () => {
  it('asks Paystack for the whole amount in test mode and records its answer', async () => {
    const db = fakeDb({ data: opened() });
    const fetch = paystackSays(200, { status: true, data: { status: 'pending', id: 7 } });
    vi.stubGlobal('fetch', fetch);

    expect(await refundCinemaHold(db.rpc, HOLD, 'confirm_refused')).toEqual({
      reference: REF,
      outcome: 'sent',
    });
    expect(db.calls[0]).toEqual({
      fn: 'fn_cinema_refund_open',
      args: { p_hold_id: HOLD, p_reason: 'confirm_refused' },
    });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/refund');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TEST}`);
    expect(JSON.parse(init.body as string)).toMatchObject({
      transaction: '4099260516',
      amount: 130000,
      reference: REF,
    });
    expect(db.calls[1]).toEqual({
      fn: 'fn_paystack_refund_answered_system',
      args: { p_reference: REF, p_answer: { status: true, data: { status: 'pending', id: 7 } } },
    });
  });

  it('does nothing more once processed, or while Paystack is already on it', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(
      await refundCinemaHold(fakeDb({ data: opened({ state: 'processed' }) }).rpc, HOLD, 'x'),
    ).toEqual({ reference: REF, outcome: 'processed' });
    expect(
      await refundCinemaHold(fakeDb({ data: opened({ state: 'pending' }) }).rpc, HOLD, 'x'),
    ).toEqual({ reference: REF, outcome: 'waiting' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never refunds live money until live Paystack is switched on: a person does', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', LIVE);
    const db = fakeDb({ data: opened({ mode: 'live' }) });
    expect(await refundCinemaHold(db.rpc, HOLD, 'x')).toMatchObject({
      reference: REF,
      outcome: 'needs_person',
      message: expect.stringMatching(/Live Paystack/),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(db.calls.map((c) => c.fn)).toEqual(['fn_cinema_refund_open']);
  });

  it('leaves the refund to a person when the database says live refunds are off', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const db = fakeDb({
      error: { message: 'Live refunds are switched off.', code: 'P0001', hint: 'live_refunds_off' },
    });
    expect(await refundCinemaHold(db.rpc, HOLD, 'x')).toEqual({
      outcome: 'needs_person',
      message: 'Live refunds are switched off.',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(db.calls.map((c) => c.fn)).toEqual(['fn_cinema_refund_open']);
  });

  it('records a refusal from Paystack once, and does not ask again', async () => {
    const db = fakeDb({ data: opened() });
    const fetch = paystackSays(400, {
      status: false,
      message: 'Transaction has been fully reversed',
    });
    vi.stubGlobal('fetch', fetch);
    expect(await refundCinemaHold(db.rpc, HOLD, 'x')).toEqual({
      reference: REF,
      outcome: 'refused',
      message: 'Transaction has been fully reversed',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(db.calls.map((c) => c.fn)).toEqual([
      'fn_cinema_refund_open',
      'fn_paystack_refund_answered_system',
    ]);
    expect(db.calls[1]).toMatchObject({ args: { p_reference: REF } });
  });

  it('records nothing when Paystack does not answer, so the next run asks again', async () => {
    const db = fakeDb({ data: opened() });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(refundCinemaHold(db.rpc, HOLD, 'x')).rejects.toThrow(/could not reach/);
    expect(db.calls.map((c) => c.fn)).toEqual(['fn_cinema_refund_open']);
  });

  it('records nothing when Paystack fails with a 503, so the refund stays opened', async () => {
    const db = fakeDb({ data: opened() });
    vi.stubGlobal(
      'fetch',
      paystackSays(503, { status: false, message: 'Service temporarily unavailable' }),
    );
    await expect(refundCinemaHold(db.rpc, HOLD, 'x')).rejects.toThrow(/temporarily unavailable/);
    expect(db.calls.map((c) => c.fn)).toEqual(['fn_cinema_refund_open']);
  });

  it('records nothing on a rate limit (429), so it is asked again next run', async () => {
    const db = fakeDb({ data: opened() });
    vi.stubGlobal('fetch', paystackSays(429, { status: false, message: 'Too many requests' }));
    await expect(refundCinemaHold(db.rpc, HOLD, 'x')).rejects.toThrow(/Too many requests/);
    expect(db.calls.map((c) => c.fn)).toEqual(['fn_cinema_refund_open']);
  });

  it('records nothing on a 409, since Paystack may already have this refund', async () => {
    const db = fakeDb({ data: opened() });
    const fetch = paystackSays(409, { status: false, message: 'Reference has already been used' });
    vi.stubGlobal('fetch', fetch);
    await expect(refundCinemaHold(db.rpc, HOLD, 'x')).rejects.toMatchObject({
      name: 'CinemaRefundError',
      message: 'Reference has already been used',
      reference: REF,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(db.calls.map((c) => c.fn)).toEqual(['fn_cinema_refund_open']);
  });

  it.each([401, 403])('records nothing on a key problem (%i)', async (status) => {
    const db = fakeDb({ data: opened() });
    vi.stubGlobal('fetch', paystackSays(status, { status: false, message: 'Invalid key' }));
    await expect(refundCinemaHold(db.rpc, HOLD, 'x')).rejects.toThrow(/Invalid key/);
    expect(db.calls.map((c) => c.fn)).toEqual(['fn_cinema_refund_open']);
  });

  it('records a 400 from Paystack as its answer', async () => {
    const db = fakeDb({ data: opened() });
    vi.stubGlobal('fetch', paystackSays(400, { status: false, message: 'Invalid transaction' }));
    expect(await refundCinemaHold(db.rpc, HOLD, 'x')).toMatchObject({ outcome: 'refused' });
    expect(db.calls[1]).toEqual({
      fn: 'fn_paystack_refund_answered_system',
      args: { p_reference: REF, p_answer: { status: false, message: 'Invalid transaction' } },
    });
  });

  it('hands a failed refund to a person, and asks Paystack nothing', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const db = fakeDb({ data: opened({ state: 'failed' }) });
    expect(await refundCinemaHold(db.rpc, HOLD, 'x')).toMatchObject({
      reference: REF,
      outcome: 'needs_person',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(db.calls.map((c) => c.fn)).toEqual(['fn_cinema_refund_open']);
  });

  it('stops when the database will not open the refund', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const db = fakeDb({ error: { message: 'That hold has no refund due.', code: '22023' } });
    await expect(refundCinemaHold(db.rpc, HOLD, 'x')).rejects.toThrow(/no refund due/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
