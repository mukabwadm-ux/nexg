import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const stub = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  row: vi.fn(),
  forward: vi.fn(),
  settle: vi.fn(),
}));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({
    auth: { getUser: stub.getUser },
    rpc: stub.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: stub.row }) }) }),
  }),
}));
vi.mock('@/lib/booking/bridge', () => ({ forwardBookingRequest: stub.forward }));
vi.mock('@/lib/booking/platform', () => ({ settleEngineBookingPayment: stub.settle }));

import {
  readBookingPayment,
  settleBookings,
  startBookingPayment,
  stepFor,
} from './booking-payment';

const TEST = 'sk_test_ci_only_0123456789';
const BOOKING = '01a12345-168a-4456-8b79-0123456789bb';
const REF = 'account_01a12345-168a-4456-8b79-0123456789cc';
const row = {
  id: BOOKING,
  merchant_id: '01a12345-168a-4456-8b79-0123456789dd',
  engine_booking_id: 'bk_123',
  customer_token: 'token-that-is-long-enough',
  customer_ref: REF,
};
const held = {
  status: 'held',
  paidMinor: 0,
  expiresAt: '2030-01-01T00:15:00.000Z',
  pricing: { totalDueMinor: 150000, dueNowMinor: 50000 },
};

function post(body: object) {
  return new Request(`https://www.nexgapp.com/api/customer/checkout/bookings/${BOOKING}/payment`, {
    method: 'POST',
    headers: { Authorization: 'Bearer access.token' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  stub.getUser.mockResolvedValue({
    data: { user: { id: 'u', email: 'k@example.com' } },
    error: null,
  });
  stub.row.mockResolvedValue({ data: row, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('what a booking owes now', () => {
  it('a deposit confirms a held booking, unless the customer pays in full', () => {
    expect(stepFor(held, false)).toEqual({
      step: 'deposit',
      amount: 50000,
      expiresAt: held.expiresAt,
    });
    expect(stepFor(held, true)).toEqual({
      step: 'full',
      amount: 150000,
      expiresAt: held.expiresAt,
    });
  });
  it('with no deposit, the whole amount; once confirmed with a deposit paid, the balance', () => {
    expect(
      stepFor({ ...held, pricing: { totalDueMinor: 150000, dueNowMinor: 150000 } }, false),
    ).toMatchObject({
      step: 'full',
      amount: 150000,
    });
    expect(stepFor({ ...held, status: 'confirmed', paidMinor: 50000 }, false)).toEqual({
      step: 'balance',
      amount: 100000,
      expiresAt: null,
    });
  });
  it('a quote is reserved with half of its top, then pays its final price less the deposit', () => {
    const quote = {
      ...held,
      model: 'REQUEST_QUOTE',
      pricing: { totalDueMinor: 24000000, dueNowMinor: 12000000 },
    };
    expect(stepFor(quote, false)).toMatchObject({ step: 'deposit', amount: 12000000 });
    // Never paid to the top of the range.
    expect(stepFor(quote, true)).toMatchObject({ step: 'deposit', amount: 12000000 });
    const waiting = { ...quote, status: 'pending', paidMinor: 12000000 };
    expect(stepFor(waiting, false)).toBe('nothing');
    const accepted = {
      ...waiting,
      status: 'accepted',
      pricing: { totalDueMinor: 20000000, dueNowMinor: 8000000, finalMinor: 20000000 },
    };
    expect(stepFor(accepted, false)).toEqual({ step: 'balance', amount: 8000000, expiresAt: null });
    for (const status of ['in_progress', 'completed'])
      expect(stepFor({ ...accepted, status }, false)).toMatchObject({
        step: 'balance',
        amount: 8000000,
      });
    const lower = {
      ...accepted,
      pricing: { totalDueMinor: 10000000, dueNowMinor: 0, finalMinor: 10000000 },
    };
    expect(stepFor(lower, false)).toBe('nothing');
  });
  it('nothing once paid in full; closed when expired or cancelled', () => {
    expect(stepFor({ ...held, status: 'confirmed', paidMinor: 150000 }, false)).toBe('nothing');
    expect(stepFor({ ...held, status: 'expired' }, false)).toBe('closed');
    expect(stepFor({ status: 'held' }, false)).toBe('closed');
  });
});

describe('paying for a booking', () => {
  it('charges the deposit the engine says is due, never an amount from the phone', async () => {
    stub.forward.mockResolvedValue(new Response(JSON.stringify(held)));
    stub.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rpc_payment_begin_engine_booking')
        return { data: { reference: 'NXP-B', amount_cents: 50000 }, error: null };
      if (fn === 'rpc_payment_paystack_attempt')
        return {
          data: {
            attempt_reference: 'NXP-B-1',
            channel: 'mpesa',
            amount_cents: 50000,
            is_test: true,
            reused: false,
          },
          error: null,
        };
      return { data: { ok: true }, error: null };
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: true, data: { status: 'pay_offline' } })),
      );
    vi.stubGlobal('fetch', fetch);

    const response = await startBookingPayment(
      post({ method: 'mpesa_stk', phone: '+254712345678' }),
      BOOKING,
    );
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXP-B',
      retryAfterSeconds: 180,
      test: true,
    });
    expect(stub.forward).toHaveBeenCalledWith(
      expect.any(Request),
      ['bookings', 'bk_123'],
      { businessId: row.merchant_id, userId: REF, role: 'customer' },
      'customer',
      { appSession: true, customerToken: row.customer_token },
    );
    expect(stub.rpc).toHaveBeenCalledWith('rpc_payment_begin_engine_booking', {
      p_booking: BOOKING,
      p_amount_cents: 50000,
      p_step: 'deposit',
      p_expires_at: held.expiresAt,
      p_proof: TEST,
    });
    expect(
      JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string).amount,
    ).toBe(50000);
  });

  it('says so when the booking is already paid, or can no longer be paid', async () => {
    stub.forward.mockResolvedValue(
      new Response(JSON.stringify({ ...held, status: 'confirmed', paidMinor: 150000 })),
    );
    const paid = await startBookingPayment(post({ method: 'card' }), BOOKING);
    expect(paid.status).toBe(409);
    expect((await paid.json()).code).toBe('NOTHING_TO_PAY');
    stub.row.mockResolvedValue({ data: null, error: null });
    expect((await startBookingPayment(post({ method: 'card' }), BOOKING)).status).toBe(404);
  });
});

describe('settling paid bookings in the engine', () => {
  it('settles each paid payment, and records a refusal for Finance', async () => {
    stub.rpc.mockImplementation(async (fn: string) =>
      fn === 'rpc_payment_engine_due'
        ? {
            data: [
              {
                reference: 'NXP-1',
                merchant_id: 'm1',
                engine_booking_id: 'b1',
                amount_cents: 50000,
                is_test: true,
              },
              {
                reference: 'NXP-2',
                merchant_id: 'm2',
                engine_booking_id: 'b2',
                amount_cents: 9000,
                is_test: false,
              },
            ],
            error: null,
          }
        : { data: { ok: true }, error: null },
    );
    stub.settle
      .mockResolvedValueOnce({ ok: true, value: {} })
      .mockResolvedValueOnce({ ok: false, status: 409, code: 'hold_expired' });
    const client = { rpc: stub.rpc } as never;
    expect(await settleBookings(client)).toEqual({ settled: 1, refused: 1 });
    expect(stub.settle).toHaveBeenCalledWith({
      merchantId: 'm1',
      bookingId: 'b1',
      amountMinor: 50000,
      provider: 'paystack_test',
      reference: 'NXP-1',
    });
    expect(stub.rpc).toHaveBeenCalledWith('rpc_payment_engine_settled', {
      p_reference: 'NXP-2',
      p_ok: false,
      p_refusal: 'hold_expired',
      p_proof: TEST,
    });
  });

  it('leaves it for the next try when the engine cannot be reached', async () => {
    stub.rpc.mockImplementation(async (fn: string) =>
      fn === 'rpc_payment_engine_due'
        ? {
            data: [
              {
                reference: 'NXP-3',
                merchant_id: 'm',
                engine_booking_id: 'b',
                amount_cents: 1,
                is_test: true,
              },
            ],
            error: null,
          }
        : { data: { ok: true }, error: null },
    );
    stub.settle.mockResolvedValue({ ok: false, status: 503, code: 'service_unavailable' });
    expect(await settleBookings({ rpc: stub.rpc } as never)).toEqual({ settled: 0, refused: 0 });
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_engine_settled',
      expect.objectContaining({ p_ok: false, p_refusal: null }),
    );
  });
});

describe('reading what a booking owes', () => {
  it('says the deposit due now, by the engine id the app knows the booking by', async () => {
    stub.forward.mockResolvedValue(new Response(JSON.stringify(held)));
    stub.rpc.mockResolvedValue({ data: { status: 'unpaid' }, error: null });
    const response = await readBookingPayment(
      new Request('https://www.nexgapp.com/api/customer/checkout/bookings/bk_123/payment', {
        headers: { Authorization: 'Bearer access.token' },
      }),
      'bk_123',
    );
    expect(await response.json()).toEqual({
      status: 'unpaid',
      due: {
        step: 'deposit',
        amountMinor: 50000,
        totalMinor: 150000,
        holdExpiresAt: held.expiresAt,
      },
    });
  });
});
