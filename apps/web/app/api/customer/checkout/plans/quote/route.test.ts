import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), send: vi.fn(), publication: vi.fn() }));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/booking/public-access', () => ({ publicMerchantBookingAccess: mocks.publication }));
vi.mock('@/lib/booking/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/booking/bridge')>()),
  forwardBookingRequest: mocks.send,
}));

import { POST } from './route';

const merchantId = '12345678-1234-4123-a123-123456789abc';
const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const stop = {
  id: 'stop-1',
  merchantId,
  startsAt: `${date}T12:00:00.000Z`,
  endsAt: `${date}T13:00:00.000Z`,
  quantity: 2,
};
const request = (stops: object[], token: string | null = 'access-token') =>
  new Request('https://www.nexgapp.com/api/customer/checkout/plans/quote', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ stops }),
  });

describe('native plan review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-id' } }, error: null });
    mocks.publication.mockResolvedValue('available');
    mocks.send.mockImplementation((_request, parts: string[]) => {
      if (parts[0] === 'catalog')
        return Response.json({
          business: { id: merchantId },
          offerings: [{ id: 'service-1', name: 'Table for two' }],
        });
      if (parts[0] === 'availability')
        return Response.json({ slots: [{ start: stop.startsAt, end: stop.endsAt }] });
      return Response.json({
        currency: 'KES',
        binding: true,
        sourceRequired: false,
        totalMinor: 34500,
        dueNowMinor: 12000,
      });
    });
  });
  it('requires a signed-in customer before using booking inventory', async () => {
    expect((await POST(request([stop], null))).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('asks for a published offering and checks the exact slot before quoting', async () => {
    const options = await (await POST(request([stop]))).json();
    expect(options).toMatchObject({
      status: 'needs_selection',
      stops: [{ id: stop.id, offerings: [{ id: 'service-1' }] }],
    });
    const result = await (await POST(request([{ ...stop, offeringId: 'service-1' }]))).json();
    expect(result).toMatchObject({ status: 'ready', totalMinor: 34500, dueNowMinor: 12000 });
    expect(mocks.send).toHaveBeenLastCalledWith(
      expect.any(Request),
      ['quote'],
      { businessId: merchantId, userId: 'customer-id', role: 'customer' },
      'customer',
    );
  });
  it('does not offer a total or quote when the owner did not confirm the requested slot', async () => {
    const result = await (
      await POST(request([{ ...stop, offeringId: 'service-1', endsAt: `${date}T14:00:00Z` }]))
    ).json();
    expect(result.status).toBe('unavailable');
    expect(result.totalMinor).toBeUndefined();
    expect(mocks.send.mock.calls.map(([, parts]) => parts[0])).toEqual(['catalog', 'availability']);
  });
});
