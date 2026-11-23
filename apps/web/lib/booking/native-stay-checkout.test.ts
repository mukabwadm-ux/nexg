import { beforeEach, describe, expect, it, vi } from 'vitest';

const stub = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ auth: { getUser: stub.getUser }, rpc: stub.rpc }),
}));
import { stayHold, stayPayment, stayQuote, stayStatus } from './native-stay-checkout';

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
});
