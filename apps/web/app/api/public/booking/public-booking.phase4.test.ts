import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './[businessId]/[...path]/route';
const mock = vi.hoisted(() => ({ access: vi.fn(), forward: vi.fn() }));
vi.mock('../../../../lib/booking/public-access', () => ({ publicMerchantBookingAccess: mock.access }));
vi.mock('../../../../lib/booking/bridge', async importOriginal => ({ ...await importOriginal<object>(), forwardBookingRequest: mock.forward }));
const businessId = '12345678-1234-4234-8234-123456789abc';
beforeEach(() => {
  mock.access.mockReset(); mock.forward.mockReset();
  vi.stubEnv('BOOKING_BRIDGE_SECRET', 's'.repeat(40));
});
afterEach(() => vi.unstubAllEnvs());
describe('public booking proxy publication', () => {
  it.each(['not_found', 'unavailable'])('does not forward an unpublished or unavailable merchant: %s', async result => {
    mock.access.mockResolvedValue(result);
    const response = await POST(new Request(`https://merchant.test/api/public/booking/${businessId}/bookings`, {
      method: 'POST', headers: { origin: 'https://merchant.test' } }), { params: { businessId, path: ['bookings'] } });
    expect(response.status).toBe(result === 'not_found' ? 404 : 503);
    expect(await response.json()).toMatchObject({ type: result === 'not_found' ? 'urn:nexg:booking:not_found' : 'urn:nexg:booking:publication_unavailable' });
    expect(mock.forward).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('forwards a published merchant catalog through the existing customer identity', async () => {
    mock.access.mockResolvedValue('available');
    mock.forward.mockResolvedValue(Response.json({ business: { id: businessId }, offerings: [] }));
    const response = await GET(new Request(`https://merchant.test/api/public/booking/${businessId}/catalog`),
      { params: { businessId, path: ['catalog'] } });
    expect(await response.json()).toEqual({ business: { id: businessId }, offerings: [] });
    expect(response.headers.get('set-cookie')).toContain('nexg_booking_session=');
    expect(mock.forward.mock.calls[0]?.[2]).toMatchObject({ businessId, role: 'customer' });
  });
});
