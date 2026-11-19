import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './[businessId]/[...path]/route';

const mock = vi.hoisted(() => ({
  access: vi.fn(),
  forward: vi.fn(),
  session: vi.fn(),
  token: vi.fn(),
  record: vi.fn(),
}));
vi.mock('../../../../lib/booking/public-access', () => ({
  publicMerchantBookingAccess: mock.access,
}));
vi.mock('../../../../lib/booking/bridge', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  forwardBookingRequest: mock.forward,
}));
vi.mock('../../../../lib/booking/app-session', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  appBookingSession: mock.session,
  savedCustomerToken: mock.token,
  recordAppBooking: mock.record,
}));

const businessId = '12345678-1234-4234-8234-123456789abc';
const userId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const itemId = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const client = { from: vi.fn() };
const url = (path: string) => `https://nexg.test/api/public/booking/${businessId}/${path}`;
const bearer = { authorization: 'Bearer ' + 'x'.repeat(40) };

beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset();
  mock.access.mockResolvedValue('available');
  mock.token.mockResolvedValue(null);
  vi.stubEnv('BOOKING_BRIDGE_SECRET', 's'.repeat(40));
  vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.example.test');
});
afterEach(() => vi.unstubAllEnvs());

describe('booking from the app with its sign-in', () => {
  it('refuses an expired or forged sign-in', async () => {
    mock.session.mockResolvedValue({ kind: 'invalid' });
    const response = await GET(new Request(url('catalog'), { headers: bearer }), {
      params: { businessId, path: ['catalog'] },
    });
    expect(response.status).toBe(401);
    expect(mock.forward).not.toHaveBeenCalled();
  });

  it('books as the account, with no cookie and no website origin, and saves the booking', async () => {
    mock.session.mockResolvedValue({ kind: 'signed_in', userId, anonymous: false, client });
    const body = { booking: { id: 'bk1', status: 'confirmed' }, customerToken: 't'.repeat(43) };
    mock.forward.mockResolvedValue(Response.json(body, { status: 201 }));
    const response = await POST(
      new Request(url(`bookings?catalogueItemId=${itemId}`), {
        method: 'POST',
        headers: { ...bearer, 'content-type': 'application/json' },
        body: '{}',
      }),
      { params: { businessId, path: ['bookings'] } },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toBeNull();
    const [, parts, identity, audience, options] = mock.forward.mock.calls[0]!;
    expect(parts).toEqual(['bookings']);
    expect(identity).toEqual({ businessId, userId: `account_${userId}`, role: 'customer' });
    expect(audience).toBe('customer');
    expect(options).toEqual({ appSession: true, customerToken: null });
    expect(mock.record).toHaveBeenCalledWith(
      client,
      businessId,
      ['bookings'],
      'POST',
      body,
      itemId,
      `account_${userId}`,
    );
  });

  it('sends the engine only the name to reserve under, never an email or phone', async () => {
    mock.session.mockResolvedValue({ kind: 'signed_in', userId, anonymous: false, client });
    mock.forward.mockResolvedValue(Response.json({ booking: { id: 'bk1' } }, { status: 201 }));
    await POST(
      new Request(url('bookings'), {
        method: 'POST',
        headers: { ...bearer, 'content-type': 'application/json' },
        body: JSON.stringify({
          offeringId: 'off1',
          startTime: '2030-01-02T09:00:00+03:00',
          customer: { name: 'Wanjiru', email: 'w@example.test', phone: '+254700000000' },
        }),
      }),
      { params: { businessId, path: ['bookings'] } },
    );
    const forwarded = mock.forward.mock.calls[0]![0] as Request;
    expect(await forwarded.json()).toEqual({
      offeringId: 'off1',
      startTime: '2030-01-02T09:00:00+03:00',
      customer: { name: 'Wanjiru' },
    });
  });

  it('strips contact details on the website cookie path too', async () => {
    mock.session.mockResolvedValue({ kind: 'none' });
    mock.forward.mockResolvedValue(Response.json({ booking: { id: 'bk1' } }, { status: 201 }));
    await POST(
      new Request(url('bookings'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://nexg.test' },
        body: JSON.stringify({ offeringId: 'off1', customer: { name: 'A', email: 'a@b.test' } }),
      }),
      { params: { businessId, path: ['bookings'] } },
    );
    const forwarded = mock.forward.mock.calls[0]![0] as Request;
    expect(await forwarded.json()).toEqual({ offeringId: 'off1', customer: { name: 'A' } });
    expect(forwarded.headers.get('origin')).toBe('https://nexg.test');
  });

  it('refuses a booking body that is not JSON', async () => {
    mock.session.mockResolvedValue({ kind: 'signed_in', userId, anonymous: false, client });
    const response = await POST(
      new Request(url('bookings'), { method: 'POST', headers: bearer, body: 'not json' }),
      { params: { businessId, path: ['bookings'] } },
    );
    expect(response.status).toBe(400);
    expect(mock.forward).not.toHaveBeenCalled();
  });

  it('lets a temporary (guest) session book, and saves it under the guest reference', async () => {
    mock.session.mockResolvedValue({ kind: 'signed_in', userId, anonymous: true, client });
    mock.forward.mockResolvedValue(Response.json({ offerings: [] }));
    const look = await GET(new Request(url('catalog'), { headers: bearer }), {
      params: { businessId, path: ['catalog'] },
    });
    expect(look.status).toBe(200);
    expect(mock.forward.mock.calls[0]![2].userId).toBe(`app_guest_${userId}`);
    const body = { booking: { id: 'bk2', status: 'held' }, customerToken: 't'.repeat(43) };
    mock.forward.mockResolvedValue(Response.json(body, { status: 201 }));
    const book = await POST(
      new Request(url('bookings'), {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({ customer: { name: 'Guest' } }),
      }),
      { params: { businessId, path: ['bookings'] } },
    );
    expect(book.status).toBe(201);
    expect(mock.forward.mock.calls[1]![2].userId).toBe(`app_guest_${userId}`);
    expect(mock.record).toHaveBeenCalledWith(
      client,
      businessId,
      ['bookings'],
      'POST',
      body,
      null,
      `app_guest_${userId}`,
    );
  });

  it('opens a saved booking with its saved private token', async () => {
    mock.session.mockResolvedValue({ kind: 'signed_in', userId, anonymous: false, client });
    mock.token.mockResolvedValue('saved-token-value-1234567890');
    mock.forward.mockResolvedValue(Response.json({ id: 'bk1', status: 'confirmed' }));
    await GET(new Request(url('bookings/bk1'), { headers: bearer }), {
      params: { businessId, path: ['bookings', 'bk1'] },
    });
    expect(mock.token).toHaveBeenCalledWith(client, businessId, 'bk1');
    expect(mock.forward.mock.calls[0]![4]).toEqual({
      appSession: true,
      customerToken: 'saved-token-value-1234567890',
    });
    expect(mock.record).toHaveBeenCalled();
  });

  it('leaves the website cookie path as it was', async () => {
    mock.session.mockResolvedValue({ kind: 'none' });
    mock.forward.mockResolvedValue(Response.json({ offerings: [] }));
    const response = await GET(new Request(url('catalog')), {
      params: { businessId, path: ['catalog'] },
    });
    expect(response.headers.get('set-cookie')).toContain('nexg_booking_session=');
    expect(mock.forward.mock.calls[0]![2].userId).toMatch(/^guest_/);
    expect(mock.forward.mock.calls[0]![4]).toBeUndefined();
  });
});
