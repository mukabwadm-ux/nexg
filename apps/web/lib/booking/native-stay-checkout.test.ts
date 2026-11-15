import { beforeEach, describe, expect, it, vi } from 'vitest';

const stub = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  ready: vi.fn(),
  send: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ auth: { getUser: stub.getUser }, rpc: stub.rpc }),
}));
vi.mock('@/lib/daraja', () => ({
  callbackOrigin: () => 'https://www.nexgapp.com',
  normalisePhone: (phone: string) => (phone === '0712000000' ? '254712000000' : null),
}));
vi.mock('@/lib/mpesa-prompt', () => ({
  mpesaDispatchIsReady: stub.ready,
  reconcileMpesaPrompts: stub.reconcile,
  sendMpesaPrompt: stub.send,
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
    stub.ready.mockResolvedValue(true);
    stub.reconcile.mockResolvedValue(false);
  });

  it('requires a signed-in email account and a configured payment method before offering checkout', async () => {
    expect((await stayQuote(request(quoteRequest, { Authorization: '' }))).status).toBe(401);
    stub.ready.mockResolvedValue(false);
    const response = await stayQuote(request(quoteRequest));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'PAYMENT_UNAVAILABLE' });
    expect(stub.rpc).not.toHaveBeenCalled();
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
      paymentMethods: ['mpesa_stk'],
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

  it('never re-dispatches a payment after the provider response was lost', async () => {
    const pending = { ...hold, paymentStatus: 'pending', reference: 'PAY-FIXTURE' };
    stub.rpc
      .mockResolvedValueOnce({ data: hold, error: null })
      .mockResolvedValueOnce({
        data: {
          checkout: pending,
          dispatch: true,
          reference: pending.reference,
          amountMinor: pending.totalMinor,
        },
        error: null,
      })
      .mockResolvedValue({ data: pending, error: null });
    stub.send.mockRejectedValueOnce(new Error('provider response lost'));
    const pay = () => stayPayment(request({ method: 'mpesa_stk', phone: '0712000000' }), quoteId);
    expect(await (await pay()).json()).toEqual(pending);
    expect(await (await pay()).json()).toEqual(pending);
    expect(stub.send).toHaveBeenCalledTimes(1);
    expect(stub.send).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 1400000, phone: '254712000000' }),
    );
  });

  it('only reconciles M-Pesa when reading status and returns the backend booking outcome', async () => {
    const pending = {
      ...hold,
      paymentStatus: 'pending',
      reference: 'PAY-FIXTURE',
      providerPending: true,
    };
    const booked = {
      ...hold,
      status: 'booked',
      paymentStatus: 'paid',
      reference: pending.reference,
    };
    stub.rpc
      .mockResolvedValueOnce({ data: pending, error: null })
      .mockResolvedValueOnce({ data: booked, error: null });
    stub.reconcile.mockResolvedValue(true);
    expect(await (await stayStatus(request(), quoteId)).json()).toEqual(booked);
    expect(stub.reconcile).toHaveBeenCalledTimes(1);
    expect(stub.send).not.toHaveBeenCalled();
    expect(stub.rpc.mock.calls.map(([name]) => name)).toEqual([
      'rpc_native_stay_status',
      'rpc_native_stay_status',
    ]);
  });
});
