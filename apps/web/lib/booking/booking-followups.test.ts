import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordAppBooking } from './app-session';
import { allowedBookingPath } from './bridge';
import { forgetEngineCustomer, settleEngineBookingPayment } from './platform';

const merchantId = '12345678-1234-4234-8234-123456789abc';
const userId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

function decode(headers: Record<string, string>) {
  return JSON.parse(Buffer.from(headers['x-nexg-booking-context']!, 'base64url').toString('utf8'));
}

describe('the shop checks a booking code', () => {
  it('opens the code look-up and check-in to the business only', () => {
    expect(allowedBookingPath(['codes', 'K7QM4X'], 'GET', 'merchant')).toBe(true);
    expect(allowedBookingPath(['codes', 'K7QM4X', 'arrive'], 'POST', 'merchant')).toBe(true);
    expect(allowedBookingPath(['codes', 'K7QM4X', 'arrive'], 'GET', 'merchant')).toBe(false);
    expect(allowedBookingPath(['codes', 'K7QM4X', 'confirm'], 'POST', 'merchant')).toBe(false);
    expect(allowedBookingPath(['codes', 'K7QM4X'], 'GET', 'customer')).toBe(false);
    expect(allowedBookingPath(['codes', 'K7QM4X', 'arrive'], 'POST', 'customer')).toBe(false);
  });
});

describe('the saved app booking', () => {
  it('keeps the code, the name, the reference and what is left to pay', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient;
    await recordAppBooking(
      client,
      merchantId,
      ['bookings'],
      'POST',
      {
        booking: {
          id: 'bk1',
          offeringId: 'off1',
          offeringName: 'Braids',
          status: 'held',
          startTime: '2030-01-02T06:00:00.000Z',
          endTime: '2030-01-02T07:00:00.000Z',
          priceMinor: 150000,
          bookingCode: 'K7QM4X',
          customer: { name: 'Wanjiru' },
          paymentState: 'awaiting_payment',
          paidMinor: 0,
          expiresAt: '2030-01-01T00:15:00.000Z',
          pricing: { totalDueMinor: 150000 },
        },
        customerToken: 't'.repeat(43),
      },
      null,
      `app_guest_${userId}`,
    );
    expect(upsert.mock.calls[0]![0]).toMatchObject({
      merchant_id: merchantId,
      engine_booking_id: 'bk1',
      customer_ref: `app_guest_${userId}`,
      booking_code: 'K7QM4X',
      reservation_name: 'Wanjiru',
      payment_state: 'awaiting_payment',
      amount_due_cents: 150000,
      hold_expires_at: '2030-01-01T00:15:00.000Z',
      status: 'held',
    });
  });

  it('clears the deadline and the amount once paid', async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: eq2 })) }));
    const client = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;
    await recordAppBooking(
      client,
      merchantId,
      ['bookings', 'bk1'],
      'GET',
      {
        id: 'bk1',
        status: 'confirmed',
        paymentState: 'provider_verified',
        paidMinor: 150000,
        priceMinor: 150000,
        pricing: { totalDueMinor: 150000 },
      },
      null,
    );
    expect(update.mock.calls[0]![0]).toMatchObject({
      status: 'confirmed',
      payment_state: 'provider_verified',
      amount_due_cents: 0,
      hold_expires_at: null,
    });
  });

  it('mirrors the code the engine shows: set once paid, cleared once used', async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: eq2 })) }));
    const client = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;
    const read = (bookingCode: string | null) =>
      recordAppBooking(
        client,
        merchantId,
        ['bookings', 'bk1'],
        'GET',
        { id: 'bk1', status: 'confirmed', bookingCode },
        null,
      );
    await read('K7QM4X');
    expect(
      (update.mock.calls[0] as unknown as [{ booking_code: string | null }])[0].booking_code,
    ).toBe('K7QM4X');
    await read(null);
    expect(
      (update.mock.calls[1] as unknown as [{ booking_code: string | null }])[0].booking_code,
    ).toBeNull();
  });

  it('ignores a booking code that is not one', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient;
    await recordAppBooking(
      client,
      merchantId,
      ['bookings'],
      'POST',
      { booking: { id: 'bk1', bookingCode: 'O0I1L!' }, customerToken: 't'.repeat(43) },
      null,
    );
    expect(upsert.mock.calls[0]![0].booking_code).toBeNull();
  });
});

describe('NexG platform calls to the engine', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('BOOKING_BRIDGE_SECRET', 's'.repeat(40));
    vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.example.test');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('forgets a customer at one business, signed as the platform', async () => {
    fetchMock.mockResolvedValue(Response.json({ forgotten: 2 }));
    const result = await forgetEngineCustomer(merchantId, `account_${userId}`);
    expect(result).toEqual({ ok: true, value: { forgotten: 2 } });
    const [target, init] = fetchMock.mock.calls[0]!;
    expect(String(target)).toBe('https://booking.example.test/v1/platform/customers/forget');
    expect(JSON.parse(init.body)).toEqual({ ref: `account_${userId}` });
    expect(decode(init.headers)).toMatchObject({ businessId: merchantId, role: 'platform' });
    expect(init.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a website cookie guest or a malformed reference', async () => {
    expect((await forgetEngineCustomer(merchantId, 'guest_abc')).ok).toBe(false);
    expect((await forgetEngineCustomer('bad id', `account_${userId}`)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the engine refusing, and no connection', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ type: 'urn:nexg:booking:forbidden' }, { status: 403 }),
    );
    expect(await forgetEngineCustomer(merchantId, `account_${userId}`)).toEqual({
      ok: false,
      status: 403,
      code: 'forbidden',
    });
    vi.stubEnv('BOOKING_ENGINE_URL', '');
    expect((await forgetEngineCustomer(merchantId, `account_${userId}`)).ok).toBe(false);
  });

  it('settles a paid booking with the provider reference as its operation key', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'bk1', status: 'confirmed' }));
    const result = await settleEngineBookingPayment({
      merchantId,
      bookingId: 'bk1',
      amountMinor: 150000,
      provider: 'mpesa',
      reference: 'QWE123',
    });
    expect(result.ok).toBe(true);
    const [target, init] = fetchMock.mock.calls[0]!;
    expect(String(target)).toBe('https://booking.example.test/v1/platform/bookings/bk1/settle');
    expect(JSON.parse(init.body)).toEqual({
      amountMinor: 150000,
      provider: 'mpesa',
      reference: 'QWE123',
    });
    expect(init.headers['idempotency-key']).toBe('settle:mpesa:QWE123');
    expect(
      (
        await settleEngineBookingPayment({
          merchantId,
          bookingId: 'bk1',
          amountMinor: 0,
          provider: 'mpesa',
          reference: 'x',
        })
      ).ok,
    ).toBe(false);
  });
});
