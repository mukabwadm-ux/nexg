import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './[businessId]/[...path]/route';
const mock = vi.hoisted(() => ({ access: vi.fn(), forward: vi.fn() }));
vi.mock('../../../../lib/booking/public-access', () => ({
  publicMerchantBookingAccess: mock.access,
}));
vi.mock('../../../../lib/booking/bridge', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  forwardBookingRequest: mock.forward,
}));
const businessId = '12345678-1234-4234-8234-123456789abc';
beforeEach(() => {
  mock.access.mockReset();
  mock.forward.mockReset();
  vi.stubEnv('BOOKING_BRIDGE_SECRET', 's'.repeat(40));
  vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.example.test');
});
afterEach(() => vi.unstubAllEnvs());
describe('public booking proxy publication', () => {
  it.each(['not_found', 'unavailable'])(
    'does not forward an unpublished or unavailable merchant: %s',
    async (result) => {
      mock.access.mockResolvedValue(result);
      const response = await POST(
        new Request(`https://merchant.test/api/public/booking/${businessId}/bookings`, {
          method: 'POST',
          headers: { origin: 'https://merchant.test' },
        }),
        { params: { businessId, path: ['bookings'] } },
      );
      expect(response.status).toBe(result === 'not_found' ? 404 : 503);
      expect(await response.json()).toMatchObject({
        type:
          result === 'not_found'
            ? 'urn:nexg:booking:not_found'
            : 'urn:nexg:booking:publication_unavailable',
      });
      expect(mock.forward).not.toHaveBeenCalled();
      expect(response.headers.get('set-cookie')).toBeNull();
    },
  );
  it('forwards a published merchant catalog through the existing customer identity', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mock.access.mockResolvedValue('available');
    mock.forward.mockResolvedValue(Response.json({ business: { id: businessId }, offerings: [] }));
    const response = await GET(
      new Request(`https://merchant.test/api/public/booking/${businessId}/catalog`),
      { params: { businessId, path: ['catalog'] } },
    );
    expect(await response.json()).toEqual({ business: { id: businessId }, offerings: [], engineOnlyHandoff: true });
    expect(response.headers.get('set-cookie')).toContain('nexg_booking_session=');
    expect(mock.forward.mock.calls[0]?.[2]).toMatchObject({ businessId, role: 'customer' });
  });
});

it('marks only exact successful catalogue and preserves no-store plus customer session cookie', async () => {
  mock.access.mockResolvedValue('available');
  mock.forward.mockResolvedValue(Response.json({ business: { id: businessId }, offerings: [{ id: 'offering' }] }, {
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', etag: 'old-body' },
  }));
  const response = await GET(new Request(`https://merchant.test/api/public/booking/${businessId}/catalog`), { params: { businessId, path: ['catalog'] } });
  expect((await response.json()).engineOnlyHandoff).toBe(true);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('etag')).toBeNull();
  expect(response.headers.get('set-cookie')).toContain('nexg_booking_session=');
  expect(mock.access).toHaveBeenCalledWith(expect.any(Request), businessId, true);
});

it.each([
  { status: 503, body: { detail: 'unavailable' } },
  { status: 200, body: { business: { id: 'other-business' }, offerings: [] } },
  { status: 200, body: { business: { id: businessId }, offerings: [{}] } },
])('never marks an error or malformed/mismatched catalogue', async ({ status, body }) => {
  mock.access.mockResolvedValue('available'); mock.forward.mockResolvedValue(Response.json(body, { status }));
  const response = await GET(new Request(`https://merchant.test/api/public/booking/${businessId}/catalog`), { params: { businessId, path: ['catalog'] } });
  expect(response.status).toBe(status); expect(await response.json()).toEqual(body);
});

it('does not mark availability or POST responses and does not override coexistence refusal', async () => {
  mock.access.mockResolvedValue('available');
  for (const [method, route] of [['GET','availability'], ['POST','catalog']] as const) {
    const body = { business: { id: businessId }, offerings: [] };
    mock.forward.mockResolvedValue(Response.json(body));
    const response = await (method === 'GET' ? GET : POST)(new Request(`https://merchant.test/api/public/booking/${businessId}/${route}`, {method}), {params:{businessId,path:[route]}});
    expect(await response.json()).toEqual(body);
  }
  mock.forward.mockClear(); mock.access.mockResolvedValue('not_found');
  const response = await GET(new Request(`https://merchant.test/api/public/booking/${businessId}/catalog`), {params:{businessId,path:['catalog']}});
  expect(response.status).toBe(404);expect((await response.json()).engineOnlyHandoff).toBeUndefined();expect(mock.forward).not.toHaveBeenCalled();
});