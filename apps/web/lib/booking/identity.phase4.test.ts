import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merchantBookingIdentity, merchantBookingWorkAllowed } from './identity';
import { bookingHeaders } from './bridge';
const mock = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('../supabase/server', () => ({ createClient: mock.createClient }));
let access: unknown;
let reads: string[];
let status: string;
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key');
  access = { state: 'legacy', setup: true, operations: true };
  reads = [];
  status = 'under_review';
  mock.createClient.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: async (name: string) => ({ data: name === 'fn_partner_home' ? { kind: 'merchant', id: 'merchant-1', name: 'Example' } : access, error: null }),
    from(table: string) {
      reads.push(table);
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === 'merchant_user'
        ? { merchant_id: 'merchant-1', role: 'owner', branches: null }
        : { subcategory: 'restaurant', answers: {}, status }, error: null }) };
      return query;
    } });
});
afterEach(() => vi.unstubAllEnvs());
describe('booking identity access', () => {
  it('resolves the existing current merchant identity without a request tenant', async () => {
    await expect(merchantBookingIdentity()).resolves.toMatchObject({ businessId: 'merchant-1', userId: 'user-1', role: 'owner' });
  });
  it('denies pending or unknown access before reading booking configuration metadata', async () => {
    access = { state: 'pending', setup: true, operations: false, expires_at: '2099-01-01T00:00:00Z' };
    await expect(merchantBookingIdentity()).rejects.toMatchObject({ status: 403 });
    expect(reads).toEqual([]);
    access = { state: 'unknown', setup: true, operations: true };
    await expect(merchantBookingIdentity()).rejects.toMatchObject({ status: 503 });
    expect(reads).toEqual([]);
  });
  it('denies approved new-flow work before activation while retaining draft setup, and keeps guard metadata private', async () => {
    access = { state: 'approved', setup: true, operations: true, review_state: 'approved', revision: 2,
      needs_resubmission: false, expires_at: '2099-01-01T00:00:00Z' };
    const identity = (await merchantBookingIdentity())!;
    expect(merchantBookingWorkAllowed(identity, 'POST', ['bookings'])).toBe(false);
    expect(merchantBookingWorkAllowed(identity, 'POST', ['bookings', 'booking-1', 'confirm'])).toBe(false);
    expect(merchantBookingWorkAllowed(identity, 'PUT', ['configuration'])).toBe(true);
    expect(merchantBookingWorkAllowed(identity, 'POST', ['resources'])).toBe(true);
    expect(merchantBookingWorkAllowed(identity, 'PATCH', ['offerings', 'offering-1'])).toBe(true);
    const payload = JSON.parse(Buffer.from(bookingHeaders(identity, 's'.repeat(40))['x-nexg-booking-context'], 'base64url').toString());
    expect(payload).toMatchObject({ businessId: 'merchant-1', businessStatus: 'under_review' });
    expect(Object.keys(payload).sort()).toEqual(['branches', 'businessId', 'businessName', 'businessStatus',
      'expiresAt', 'role', 'subcategoryId', 'userId'].sort());
    status = 'live';
    expect(merchantBookingWorkAllowed((await merchantBookingIdentity())!, 'POST', ['bookings'])).toBe(true);
  });
  it('retains legacy work access and fails closed for an identity without internal authorization metadata', async () => {
    expect(merchantBookingWorkAllowed((await merchantBookingIdentity())!, 'POST', ['bookings'])).toBe(true);
    expect(merchantBookingWorkAllowed({ businessId: 'unverified', userId: 'user-1', role: 'owner' }, 'POST', ['bookings'])).toBe(false);
  });
});
