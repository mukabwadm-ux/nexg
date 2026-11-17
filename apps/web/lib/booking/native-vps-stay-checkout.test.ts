import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
vi.mock('./native-stay-customer', () => ({ resolveVerifiedStayCustomer: auth }));
import { nativeVpsStayCheckout } from './native-vps-stay-checkout';
const u = (v: number) => '01a12345-168a-4456-8b79-' + String(v).padStart(12, '0');
const merchantId = u(1),
  actorId = u(2),
  quoteId = u(3),
  bookingId = u(4);
const contact = { name: 'Test Guest', email: 'verified@example.test' };
const quote = {
  propertyId: u(5),
  unitId: u(6),
  checkIn: '2030-01-02',
  checkOut: '2030-01-04',
  adults: 2,
  children: 0,
};
const expiresAt = '2030-01-01T12:00:00.000Z';
const held = {
  quoteId,
  id: bookingId,
  expiresAt,
  totalMinor: 24000,
  currency: 'KES',
  status: 'held',
};
const hold = { quoteId, firstName: 'Guest', expectedTotalMinor: 24000 };
const request = (data?: object, key = quoteId) =>
  new Request('https://nexg.example.test/checkout', {
    method: data ? 'POST' : 'GET',
    ...(data ? { body: JSON.stringify(data) } : {}),
    headers: { 'Idempotency-Key': key, Authorization: 'Bearer app-token' },
  });
const call = (r: Request, ...path: string[]) => nativeVpsStayCheckout(r, { merchantId, path });
const fetcher = vi.fn();
describe('native VPS Stays bridge', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXG_NATIVE_STAYS_SYNTHETIC_FIXTURE', 'true');
    vi.stubEnv('NEXG_NATIVE_STAYS_PILOT_MERCHANT_IDS', merchantId);
    vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.example.test');
    vi.stubEnv('BOOKING_BRIDGE_SECRET', 'fixture-only-stays-bridge-secret-123456789');
    vi.stubGlobal('fetch', fetcher);
    fetcher.mockReset();
    auth.mockReset();
    auth.mockResolvedValue({ ok: true, userId: actorId, contact });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('cannot activate in production or without explicit synthetic fixture mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await call(request(quote), 'quote');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'STAY_ENGINE_DISABLED' });
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXG_NATIVE_STAYS_SYNTHETIC_FIXTURE', 'false');
    expect((await call(request(quote), 'quote')).status).toBe(503);
    expect(auth).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('is off by default, before auth or network', async () => {
    vi.stubEnv('NEXG_NATIVE_STAYS_PILOT_MERCHANT_IDS', '');
    expect((await call(request(quote), 'quote')).status).toBe(404);
    expect(auth).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('signs verified actor, preserves exact quote scope and never advertises unsupported payment', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({
        ...quote,
        quoteId,
        offeringId: u(7),
        nights: 2,
        nightlyMinor: 12000,
        totalMinor: 24000,
        expiresAt,
        currency: 'KES',
      }),
    );
    const result = await call(request(quote, u(8)), 'quote');
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      ...quote,
      quoteId,
      totalMinor: 24000,
      paymentMethods: [],
      checkoutPaymentReady: false,
    });
    const [url, opts] = fetcher.mock.calls[0]!;
    expect(url.pathname).toBe('/v1/stays/' + merchantId + '/quote');
    const headers = new Headers(opts.headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('idempotency-key')).toBe(u(8));
    expect(
      JSON.parse(Buffer.from(headers.get('x-nexg-booking-context')!, 'base64url').toString()),
    ).toMatchObject({
      businessId: merchantId,
      userId: actorId,
      role: 'customer',
      staysCustomer: { purpose: 'nexg.stays.customer.v1', verified: true, customer: contact },
    });
    expect(JSON.parse(opts.body)).toEqual(quote);
  });
  it('binds hold to quote and expected total, without allowing supplied actor data', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ ...held, guest: contact }));
    expect(await (await call(request(hold), 'holds')).json()).toEqual({
      operationId: quoteId,
      stayId: bookingId,
      holdExpiresAt: expiresAt,
      totalMinor: 24000,
      currency: 'KES',
      status: 'held',
      paymentStatus: 'unpaid',
      refundDue: false,
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
      quoteId,
      requestId: quoteId,
      expectedTotalMinor: 24000,
    });
    expect((await call(request({ ...hold, userId: actorId }), 'holds')).status).toBe(422);
    expect((await call(request(hold, u(99)), 'holds')).status).toBe(422);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('requires verified payment and no refund before reporting booked', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json({ ...held, status: 'confirmed' }))
      .mockResolvedValueOnce(
        Response.json({ ...held, status: 'confirmed', paymentStatus: 'paid', refundDue: false }),
      );
    expect((await call(request(), 'holds', quoteId)).status).toBe(503);
    expect(await (await call(request(), 'holds', quoteId)).json()).toMatchObject({
      status: 'booked',
      paymentStatus: 'paid',
    });
  });
  it('preserves unresolved money after expiry and refuses contradictory paid confirmation', async () => {
    fetcher
      .mockResolvedValueOnce(
        Response.json({ ...held, status: 'expired', paymentReconciliationRequired: true }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...held,
          status: 'confirmed',
          paymentStatus: 'paid',
          refundDue: false,
          paymentReconciliationRequired: true,
        }),
      );
    expect(await (await call(request(), 'holds', quoteId)).json()).toMatchObject({
      status: 'expired',
      paymentStatus: 'pending',
      paymentReconciliationRequired: true,
    });
    expect((await call(request(), 'holds', quoteId)).status).toBe(503);
  });
  it('has no Supabase booking fallback or payment dispatch on outage', async () => {
    fetcher.mockRejectedValueOnce(new Error('engine offline'));
    expect((await call(request(quote), 'quote')).status).toBe(503);
    const response = await call(
      request({ method: 'mpesa_stk', phone: '254712345678' }),
      'holds',
      quoteId,
      'payment',
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'PAYMENT_UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  const query = new URLSearchParams({
    ...quote,
    adults: String(quote.adults),
    children: String(quote.children),
  }).toString();
  const availability = (suffix = '') =>
    new Request('https://nexg.example.test/availability?' + query + suffix, {
      headers: { Authorization: 'Bearer app-token' },
    });
  const availabilityDto = () => ({
    ...quote,
    contractVersion: 1,
    authority: 'nexg-booking-engine',
    held: false,
    offeringId: u(7),
    nights: 2,
    available: true,
    nightlyMinor: 12000,
    totalMinor: 24000,
    currency: 'KES',
    observedAt: new Date().toISOString(),
  });
  it('rejects a subtotal that does not represent exactly the requested nights', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ ...availabilityDto(), nights: 1, totalMinor: 12000 }),
    );
    expect((await call(availability(), 'availability')).status).toBe(503);
  });
  it('returns exact fresh advisory availability as no hold, without guest or legacy data', async () => {
    const expected = availabilityDto();
    fetcher.mockResolvedValueOnce(Response.json({ ...expected, guest: contact }));
    const result = await call(availability(), 'availability');
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(expected);
    const [url, opts] = fetcher.mock.calls[0]!;
    expect(url.pathname).toBe('/v1/stays/' + merchantId + '/availability');
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...quote, adults: '2', children: '0' });
    expect(opts.method).toBe('GET');
    expect(opts.body).toBeUndefined();
  });
  it('rejects duplicate requests, stale results and wrong units instead of inferring availability', async () => {
    expect((await call(availability('&adults=3'), 'availability')).status).toBe(422);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher
      .mockResolvedValueOnce(
        Response.json({
          ...availabilityDto(),
          observedAt: new Date(Date.now() - 61000).toISOString(),
        }),
      )
      .mockResolvedValueOnce(Response.json({ ...availabilityDto(), unitId: u(44) }));
    expect((await call(availability(), 'availability')).status).toBe(503);
    expect((await call(availability(), 'availability')).status).toBe(503);
  });
  it('returns only complete fresh engine Search with exact scope and reviewed night totals', async () => {
    const input = {
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      adults: 2,
      children: 0,
      propertyId: quote.propertyId,
    };
    const query = new URLSearchParams(
      Object.entries(input).map(([key, value]) => [key, String(value)]),
    );
    const searchRequest = (suffix = '') =>
      new Request('https://nexg.example.test/search?' + query + suffix);
    const item = {
      propertyId: quote.propertyId,
      unitId: quote.unitId,
      offeringId: u(7),
      nights: 2,
      nightlyMinor: 12000,
      totalMinor: 24000,
      currency: 'KES',
    };
    const envelope = {
      contractVersion: 1,
      authority: 'nexg-booking-engine',
      scope: 'business',
      businessId: merchantId,
      complete: true,
      request: input,
      observedAt: new Date().toISOString(),
      checkedUnits: 1,
      items: [item],
    };
    fetcher.mockResolvedValueOnce(
      Response.json({ ...envelope, items: [{ ...item, internalId: 3 }] }),
    );
    const response = await call(searchRequest(), 'search');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(envelope);
    expect(fetcher.mock.calls[0]![0].pathname).toBe('/v1/stays/' + merchantId + '/search');
    expect(Object.fromEntries(fetcher.mock.calls[0]![0].searchParams)).toEqual(
      Object.fromEntries(query),
    );
    expect(fetcher.mock.calls[0]![1].method).toBe('GET');
    expect(fetcher.mock.calls[0]![1].body).toBeUndefined();
    for (const bad of [
      { ...envelope, complete: false },
      { ...envelope, businessId: u(99) },
      { ...envelope, request: { ...input, adults: 3 } },
      { ...envelope, checkedUnits: 0 },
      { ...envelope, checkedUnits: 201 },
      { ...envelope, checkedUnits: 2, items: [item, item] },
      { ...envelope, items: [{ ...item, propertyId: u(99) }] },
      { ...envelope, items: [{ ...item, totalMinor: 1 }] },
      { ...envelope, observedAt: new Date(Date.now() - 61000).toISOString() },
    ]) {
      fetcher.mockResolvedValueOnce(Response.json(bad));
      expect((await call(searchRequest(), 'search')).status).toBe(503);
    }
    const count = fetcher.mock.calls.length;
    expect((await call(searchRequest('&adults=3'), 'search')).status).toBe(422);
    expect((await call(searchRequest('&userId=' + u(99)), 'search')).status).toBe(422);
    expect(fetcher).toHaveBeenCalledTimes(count);
    fetcher.mockResolvedValueOnce(
      Response.json({
        ...envelope,
        request: { ...input, propertyId: null },
        checkedUnits: 0,
        items: [],
      }),
    );
    query.delete('propertyId');
    expect(await (await call(searchRequest(), 'search')).json()).toMatchObject({
      complete: true,
      checkedUnits: 0,
      items: [],
    });
  });
  it('reads only the complete signed tenant Activity list and strips private fields', async () => {
    const record = {
      ...quote,
      kind: 'stay',
      id: 'stay:' + bookingId,
      source: 'nexg-booking-engine',
      bookingId,
      bookingReference: bookingId,
      quoteId,
      offeringId: u(7),
      status: 'confirmed',
      paymentStatus: 'paid',
      startTime: expiresAt,
      endTime: expiresAt,
      timeZone: 'Africa/Nairobi',
      nights: 2,
      totalMinor: 24000,
      currency: 'KES',
    };
    const envelope = {
      source: 'nexg-booking-engine',
      scope: 'tenant',
      businessId: merchantId,
      complete: true,
      items: [record],
    };
    fetcher.mockResolvedValueOnce(
      Response.json({ ...envelope, items: [{ ...record, guest: contact }] }),
    );
    const response = await call(request(), 'activity');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(envelope);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, opts] = fetcher.mock.calls[0]!;
    expect(url.pathname).toBe('/v1/stays/' + merchantId + '/activity');
    expect(opts.method).toBe('GET');
    expect(opts.body).toBeUndefined();
    const signed = new Headers(opts.headers).get('x-nexg-booking-context')!;
    expect(JSON.parse(Buffer.from(signed, 'base64url').toString())).toMatchObject({
      businessId: merchantId,
      userId: actorId,
      role: 'customer',
    });
    for (const bad of [
      { ...envelope, businessId: u(99) },
      { ...envelope, complete: false },
      { ...envelope, items: [record, record] },
      { ...envelope, items: [{ ...record, paymentStatus: 'unpaid' }] },
      { ...envelope, items: [{ ...record, id: 'stay:' + u(99) }] },
      { ...envelope, items: Array(1001).fill(record) },
    ]) {
      fetcher.mockResolvedValueOnce(Response.json(bad));
      expect((await call(request(), 'activity')).status).toBe(503);
    }
    fetcher.mockResolvedValueOnce(Response.json({ ...envelope, items: [] }));
    expect(await (await call(request(), 'activity')).json()).toEqual({ ...envelope, items: [] });
    fetcher.mockResolvedValueOnce(Response.json({ ...envelope, padding: 'x'.repeat(1024 * 1024) }));
    expect((await call(request(), 'activity')).status).toBe(503);
  });
  it('refuses Activity list query overrides, unsigned requests, production and outages without fallback', async () => {
    expect(
      (await call(new Request('https://nexg.example.test/activity?userId=' + u(99)), 'activity'))
        .status,
    ).toBe(422);
    expect((await call(request(), 'activity', 'extra')).status).toBe(404);
    expect((await call(request({}), 'activity')).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    auth.mockResolvedValueOnce({ ok: false, reason: 'sign_in' });
    expect((await call(request(), 'activity')).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRejectedValueOnce(new Error('engine offline'));
    expect((await call(request(), 'activity')).status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.stubEnv('NODE_ENV', 'production');
    expect(await (await call(request(), 'activity')).json()).toMatchObject({
      code: 'STAY_ENGINE_DISABLED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reads one confirmed Activity by booking ID and rejects mismatched or unpaid data', async () => {
    const record = {
      ...quote,
      kind: 'stay',
      id: 'stay:' + bookingId,
      source: 'nexg-booking-engine',
      bookingId,
      bookingReference: bookingId,
      quoteId,
      offeringId: u(7),
      status: 'confirmed',
      paymentStatus: 'paid',
      startTime: expiresAt,
      endTime: expiresAt,
      timeZone: 'Africa/Nairobi',
      nights: 2,
      totalMinor: 24000,
      currency: 'KES',
    };
    fetcher
      .mockResolvedValueOnce(Response.json({ ...record, guest: contact }))
      .mockResolvedValueOnce(Response.json({ ...record, paymentStatus: 'unpaid' }));
    const found = await call(request(), 'holds', bookingId, 'activity');
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(record);
    expect(fetcher.mock.calls[0]![0].pathname).toBe(
      '/v1/stays/' + merchantId + '/holds/' + bookingId + '/activity',
    );
    expect((await call(request(), 'holds', bookingId, 'activity')).status).toBe(503);
  });
});
