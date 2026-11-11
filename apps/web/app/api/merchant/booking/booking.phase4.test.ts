import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './[...path]/route';
import { MerchantAccessError } from '../../../../lib/merchant-access';
const mock = vi.hoisted(() => ({
  identity: vi.fn(),
  bootstrap: vi.fn(),
  forward: vi.fn(),
  workAllowed: vi.fn(),
  bootstrapIdentity: vi.fn(),
  legacy: vi.fn(),
}));
vi.mock('../../../../lib/booking/identity', () => ({
  merchantBookingIdentity: mock.identity,
  merchantBookingWorkAllowed: mock.workAllowed,
}));
vi.mock('../../../../lib/booking/bridge', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  bootstrapMerchantBooking: mock.bootstrap,
  forwardBookingRequest: mock.forward,
}));
vi.mock('../../../../lib/booking/onboarding-bootstrap', () => ({
  merchantBookingBootstrapIdentity: mock.bootstrapIdentity,
}));
vi.mock('../../../../lib/booking/board-data', () => ({ legacyBookingState: mock.legacy }));
vi.mock('../../../../lib/supabase/server', () => ({ createClient: () => ({}) }));
beforeEach(() => {
  mock.identity.mockReset();
  mock.bootstrap.mockReset();
  mock.forward.mockReset();
  mock.workAllowed.mockReturnValue(true);
  mock.bootstrapIdentity.mockReset();
  mock.bootstrapIdentity.mockImplementation(async (identity) => identity);
  mock.legacy.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe('merchant booking route entry', () => {
  it('keeps new merchant bookings with the existing source while Supabase work is active', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.example.test');
    vi.stubEnv('BOOKING_BRIDGE_SECRET', 'a'.repeat(32));
    const businessId = '12345678-1234-4234-8234-123456789abc';
    mock.identity.mockResolvedValue({ businessId, userId: 'user-1', role: 'owner' });
    mock.legacy.mockResolvedValue('legacy');
    const response = await POST(
      new Request('https://merchant.test/api/merchant/booking/bookings', {
        method: 'POST',
        headers: { origin: 'https://merchant.test' },
      }),
      { params: { path: ['bookings'] } },
    );
    expect(response.status).toBe(409);
    expect(mock.legacy).toHaveBeenCalledWith({}, businessId);
    expect(mock.forward).not.toHaveBeenCalled();
  });
  it('returns approval denial before any engine request or bootstrap', async () => {
    mock.identity.mockRejectedValue(new MerchantAccessError('Approval required.', 403));
    const response = await GET(
      new Request('https://merchant.test/api/merchant/booking/workspace'),
      { params: { path: ['workspace'] } },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      type: 'urn:nexg:booking:approval_required',
      status: 403,
    });
    expect(mock.forward).not.toHaveBeenCalled();
    expect(mock.bootstrap).not.toHaveBeenCalled();
    expect(mock.bootstrapIdentity).not.toHaveBeenCalled();
  });
  it.each(['owner', 'manager'])(
    'forwards an authorized %s GET without invoking explicit bootstrap',
    async (role) => {
      mock.identity.mockResolvedValue({ businessId: 'merchant-1', userId: 'user-1', role });
      mock.forward.mockResolvedValue(Response.json({ businessId: 'merchant-1' }));
      const response = await GET(
        new Request('https://merchant.test/api/merchant/booking/workspace'),
        { params: { path: ['workspace'] } },
      );
      expect(await response.json()).toEqual({ businessId: 'merchant-1' });
      expect(mock.bootstrap).not.toHaveBeenCalled();
      expect(mock.bootstrapIdentity).not.toHaveBeenCalled();
    },
  );
  it('rejects foreign-origin explicit bootstrap without writing engine setup', async () => {
    mock.identity.mockResolvedValue({ businessId: 'merchant-1', userId: 'user-1', role: 'owner' });
    const response = await POST(
      new Request('https://merchant.test/api/merchant/booking/bootstrap', {
        method: 'POST',
        headers: { origin: 'https://other.test' },
      }),
      { params: { path: ['bootstrap'] } },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      type: 'urn:nexg:booking:invalid_origin',
      status: 403,
    });
    expect(mock.bootstrap).not.toHaveBeenCalled();
    expect(mock.bootstrapIdentity).not.toHaveBeenCalled();
  });
  it('returns owner setup required for managed manager import without sending an engine write', async () => {
    mock.identity.mockResolvedValue({
      businessId: 'merchant-1',
      userId: 'user-1',
      role: 'manager',
    });
    mock.bootstrapIdentity.mockResolvedValue(null);
    const response = await POST(
      new Request('https://merchant.test/api/merchant/booking/bootstrap', {
        method: 'POST',
        headers: { origin: 'https://merchant.test' },
      }),
      { params: { path: ['bootstrap'] } },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ type: 'urn:nexg:booking:owner_setup_required' });
    expect(mock.bootstrap).not.toHaveBeenCalled();
  });
  it('uses the validated seed only for explicit same-origin POST bootstrap', async () => {
    const identity = { businessId: 'merchant-1', userId: 'user-1', role: 'owner' };
    const seed = { ...identity, subcategoryId: 'restaurant', answers: { Q_AVG_PREP_TIME: 0 } };
    mock.identity.mockResolvedValue(identity);
    mock.bootstrapIdentity.mockResolvedValue(seed);
    const response = await POST(
      new Request('https://merchant.test/api/merchant/booking/bootstrap', {
        method: 'POST',
        headers: { origin: 'https://merchant.test' },
      }),
      { params: { path: ['bootstrap'] } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mock.bootstrap).toHaveBeenCalledWith(seed);
    expect(mock.forward).not.toHaveBeenCalled();
  });
  it('fails closed before writing engine setup when saved application validation fails', async () => {
    mock.identity.mockResolvedValue({ businessId: 'merchant-1', userId: 'user-1', role: 'owner' });
    mock.bootstrapIdentity.mockRejectedValue(new Error('Invalid saved scope'));
    const response = await POST(
      new Request('https://merchant.test/api/merchant/booking/bootstrap', {
        method: 'POST',
        headers: { origin: 'https://merchant.test' },
      }),
      { params: { path: ['bootstrap'] } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      type: 'urn:nexg:booking:onboarding_import_unavailable',
    });
    expect(mock.bootstrap).not.toHaveBeenCalled();
  });
  it('rejects pre-activation booking work before the engine receives the command', async () => {
    mock.identity.mockResolvedValue({ businessId: 'merchant-1', userId: 'user-1', role: 'owner' });
    mock.workAllowed.mockReturnValue(false);
    const response = await POST(
      new Request('https://merchant.test/api/merchant/booking/bookings', {
        method: 'POST',
        headers: { origin: 'https://merchant.test' },
      }),
      { params: { path: ['bookings'] } },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ type: 'urn:nexg:booking:activation_required' });
    expect(mock.forward).not.toHaveBeenCalled();
  });
});
