import { beforeEach, describe, expect, it, vi } from 'vitest';

const stub = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  prompt: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ auth: { getUser: stub.getUser }, rpc: stub.rpc }),
}));
vi.mock('@/lib/mpesa-prompt', () => ({ sendMpesaPrompt: stub.prompt }));
import {
  stayHold,
  stayPayment,
  stayPaymentById,
  stayQuote,
  stayStatus,
} from './native-stay-checkout';

/* Safaricom connected and Paystack not live: production on 23 Nov 2026. */
function darajaOnly() {
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  for (const [k, v] of Object.entries({
    DARAJA_CONSUMER_KEY: 'k',
    DARAJA_CONSUMER_SECRET: 's',
    DARAJA_SHORTCODE: '174379',
    DARAJA_PASSKEY: 'p',
    DARAJA_CALLBACK_SECRET: 'c',
  }))
    vi.stubEnv(k, v);
}

const quoteId = '01a12345-168a-4456-8b79-012345678910';
const stayId = '01a12345-168a-4456-8b79-012345678911';
const unitId = '01a12345-168a-4456-8b79-012345678912';
const propertyId = '01a12345-168a-4456-8b79-012345678913';
const expiresAt = '2030-01-01T09:10:00.000Z';
const quoteRequest = {
  propertyId,
  unitId,
  checkIn: '2030-01-04',
  checkOut: '2030-01-06',
  adults: 1,
  children: 1,
};
const hold = {
  operationId: quoteId,
  stayId,
  holdExpiresAt: expiresAt,
  totalMinor: 1400000,
  currency: 'KES',
  status: 'held',
  paymentStatus: 'unpaid',
  refundDue: false,
};

function request(body?: object, headers?: Record<string, string>) {
  return new Request('https://www.nexgapp.com/api/customer/checkout/stays', {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer access.token', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('native stay checkout routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    stub.getUser.mockResolvedValue({
      data: { user: { email: 'fixture@example.test' } },
      error: null,
    });
  });

  it('needs a sign-in, an account or a temporary guest session', async () => {
    expect((await stayQuote(request(quoteRequest, { Authorization: '' }))).status).toBe(401);
    stub.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await stayQuote(request(quoteRequest))).status).toBe(401);
    expect(stub.rpc).not.toHaveBeenCalled();
    stub.getUser.mockResolvedValue({
      data: { user: { id: 'guest', is_anonymous: true } },
      error: null,
    });
    stub.rpc.mockResolvedValue({ data: null, error: { code: 'NX001', message: 'x' } });
    expect((await stayQuote(request(quoteRequest))).status).toBe(409);
    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });

  it('exposes an exact backend quote without computing an alternative rate', async () => {
    stub.rpc.mockResolvedValue({
      error: null,
      data: {
        ...quoteRequest,
        quoteId,
        expiresAt,
        nights: 2,
        currency: 'KES',
        nightlyMinor: 700000,
        roomSubtotalMinor: 1400000,
        taxesMinor: 0,
        totalMinor: 1400000,
      },
    });
    const response = await stayQuote(request(quoteRequest));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ...quoteRequest,
      quoteId,
      totalMinor: 1400000,
      paymentMethods: [],
    });
    expect(stub.rpc).toHaveBeenCalledWith('rpc_native_stay_quote', {
      p_property_id: propertyId,
      p_unit_id: unitId,
      p_check_in: quoteRequest.checkIn,
      p_check_out: quoteRequest.checkOut,
      p_adults: 1,
      p_children: 1,
    });
  });

  it('uses the quote as the idempotency key and preserves explicit rejection states', async () => {
    const body = { quoteId, firstName: 'Amina' };
    expect((await stayHold(request(body, { 'Idempotency-Key': stayId }))).status).toBe(422);
    expect(stub.rpc).not.toHaveBeenCalled();
    stub.rpc.mockResolvedValue({ data: null, error: { code: 'NX003', message: 'internal' } });
    expect(
      await (await stayHold(request(body, { 'Idempotency-Key': quoteId }))).json(),
    ).toMatchObject({ code: 'PRICE_CHANGED' });
    stub.rpc.mockResolvedValue({ data: null, error: { code: 'NX002', message: 'internal' } });
    const terminal = await stayStatus(request(), quoteId);
    expect(terminal.status).toBe(410);
    expect(terminal.headers.get('content-type')).toBe('application/problem+json');
    expect(await terminal.json()).toMatchObject({ code: 'QUOTE_EXPIRED' });
  });

  it('reads status straight from the backend', async () => {
    stub.rpc.mockResolvedValue({ data: hold, error: null });
    expect(await (await stayStatus(request(), quoteId)).json()).toEqual(hold);
    expect(stub.rpc).toHaveBeenCalledWith('rpc_native_stay_status', { p_operation_id: quoteId });
  });

  it('says when a booked stay was cancelled and when its money went back', async () => {
    const cancelled = {
      ...hold,
      status: 'cancelled',
      paymentStatus: 'paid',
      refundDue: true,
      refunded: true,
      cancelledAfterBooking: true,
      reference: 'NXP-S',
    };
    stub.rpc.mockResolvedValue({ data: cancelled, error: null });
    expect(await (await stayStatus(request(), quoteId)).json()).toEqual(cancelled);
    stub.rpc.mockResolvedValue({ data: { ...cancelled, refunded: 'yes' }, error: null });
    expect((await stayStatus(request(), quoteId)).status).toBe(503);
  });

  it('keeps payment closed until Paystack is switched on, without touching the hold', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    stub.rpc.mockResolvedValue({ data: hold, error: null });
    const response = await stayPayment(
      request({ method: 'mpesa_stk', phone: '+254712000000' }),
      quoteId,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'PAYMENT_UNAVAILABLE' });
    expect(stub.rpc).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('pays a held stay through Paystack, for the total the backend holds', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', 'sk_test_ci_only_0123456789');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.nexgapp.com');
    stub.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rpc_native_stay_status') return { data: hold, error: null };
      if (fn === 'rpc_payment_begin_stay')
        return { data: { reference: 'NXP-S', amount_cents: 1400000 }, error: null };
      if (fn === 'rpc_payment_paystack_attempt')
        return {
          data: {
            attempt_reference: 'NXP-S-1',
            channel: 'card',
            amount_cents: 1400000,
            is_test: true,
            reused: false,
          },
          error: null,
        };
      return { data: { ok: true }, error: null };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: true,
            data: { authorization_url: 'https://checkout.paystack.com/s1', access_code: 's1' },
          }),
        ),
      ),
    );
    const response = await stayPayment(request({ method: 'card' }), quoteId);
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXP-S',
      url: 'https://checkout.paystack.com/s1',
      test: true,
    });
    expect(stub.rpc).toHaveBeenCalledWith('rpc_payment_begin_stay', { p_stay_id: stayId });

    // Already paid: says so, starts nothing.
    stub.rpc.mockReset().mockResolvedValue({
      data: { ...hold, status: 'booked', paymentStatus: 'paid', reference: 'NXP-S' },
      error: null,
    });
    expect(await (await stayPayment(request({ method: 'card' }), quoteId)).json()).toEqual({
      status: 'paid',
      reference: 'NXP-S',
    });
    expect(stub.rpc).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("a host Paystack pays directly: the prompt and the card page carry the database's split", async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', 'sk_test_ci_only_0123456789');
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
    vi.stubEnv('DARAJA_CONSUMER_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.nexgapp.com');
    /* KES 14,000 at 15%: the host's sub-account gets 11,900, NexG keeps 2,100. */
    const split = { subaccount: 'ACCT_host123', transaction_charge: 210000, bearer: 'account' };
    let channel = 'mpesa';
    stub.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rpc_payment_begin_stay')
        return { data: { reference: 'NXP-H', amount_cents: 1400000 }, error: null };
      if (fn === 'rpc_payment_paystack_attempt')
        return {
          data: {
            attempt_reference: 'NXP-H-' + channel,
            channel,
            amount_cents: 1400000,
            is_test: true,
            reused: false,
            split,
          },
          error: null,
        };
      return { data: { ok: true }, error: null };
    });
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            status: true,
            data: {
              status: 'pay_offline',
              authorization_url: 'https://checkout.paystack.com/h1',
              access_code: 'h1',
            },
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const sent = (call: number) =>
      JSON.parse(String((fetch.mock.calls[call]![1] as RequestInit).body)) as Record<
        string,
        unknown
      >;

    const prompted = await stayPaymentById(
      request({ method: 'mpesa_stk', phone: '0712 000 000' }),
      stayId,
    );
    expect(await prompted.json()).toMatchObject({ status: 'pending', reference: 'NXP-H' });
    expect(String(fetch.mock.calls[0]![0])).toMatch(/\/charge$/);
    expect(sent(0)).toMatchObject({
      reference: 'NXP-H-mpesa',
      amount: 1400000,
      subaccount: 'ACCT_host123',
      transaction_charge: 210000,
      bearer: 'account',
    });
    expect(stub.prompt).not.toHaveBeenCalled();

    channel = 'card';
    const carded = await stayPaymentById(request({ method: 'card' }), stayId);
    expect(await carded.json()).toMatchObject({ url: 'https://checkout.paystack.com/h1' });
    expect(String(fetch.mock.calls[1]![0])).toMatch(/\/transaction\/initialize$/);
    expect(sent(1)).toMatchObject({
      subaccount: 'ACCT_host123',
      transaction_charge: 210000,
      bearer: 'account',
    });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('the website pays a held stay by its id: M-Pesa straight to Safaricom while Paystack is off', async () => {
    darajaOnly();
    stub.rpc.mockImplementation(async (fn: string) =>
      fn === 'rpc_payment_begin_stay'
        ? {
            data: { reference: 'NXS-1', amount_cents: 1400000, expires_at: expiresAt },
            error: null,
          }
        : { data: null, error: { code: 'XX000', message: 'unexpected ' + fn } },
    );
    stub.prompt.mockResolvedValue({ ok: true, message: 'Check your phone.' });
    const response = await stayPaymentById(
      request({ method: 'mpesa_stk', phone: '0712 000 000' }),
      stayId,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXS-1',
      retryAfterSeconds: 60,
      expiresAt,
    });
    expect(stub.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'NXS-1',
        amountCents: 1400000,
        phone: '254712000000',
        description: 'NexG stay',
      }),
    );
    vi.unstubAllEnvs();
  });

  it("the apps' operation route takes the same Safaricom path for its stay", async () => {
    darajaOnly();
    stub.rpc.mockImplementation(async (fn: string) =>
      fn === 'rpc_native_stay_status'
        ? { data: hold, error: null }
        : fn === 'rpc_payment_begin_stay'
          ? { data: { reference: 'NXS-2', amount_cents: 1400000 }, error: null }
          : { data: null, error: { code: 'XX000', message: 'unexpected ' + fn } },
    );
    stub.prompt.mockResolvedValue({ ok: true, message: 'Check your phone.' });
    const response = await stayPayment(
      request({ method: 'mpesa_stk', phone: '+254712000000' }),
      quoteId,
    );
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXS-2',
      retryAfterSeconds: 60,
    });
    expect(stub.rpc).toHaveBeenCalledWith('rpc_payment_begin_stay', { p_stay_id: stayId });
    vi.unstubAllEnvs();
  });

  it("a stay that is not the caller's is refused by the database", async () => {
    darajaOnly();
    stub.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'No such order.' } });
    const response = await stayPaymentById(
      request({ method: 'mpesa_stk', phone: '0712000000' }),
      stayId,
    );
    expect(response.status).toBe(404);
    expect(stub.prompt).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('refuses a malformed stay id', async () => {
    const response = await stayPaymentById(
      request({ method: 'mpesa_stk', phone: '0712000000' }),
      'x',
    );
    expect(response.status).toBe(422);
  });
});
