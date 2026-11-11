import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicMerchantBookingAccess } from './public-access';
const mock = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }));
const merchantId = '12345678-1234-4234-8234-123456789abc';
const request = (host = 'merchant.test') =>
  new Request(`http://${host}/api/public/booking/${merchantId}/catalog`);
let result: { data: unknown; error: unknown };
let legacyResult: { data: unknown; error: unknown };
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXG_BOOKING_SANDBOX', '');
  vi.stubEnv('BOOKING_ENGINE_MERCHANT_IDS', '');
  result = { data: { id: merchantId, status: 'live' }, error: null };
  legacyResult = { data: [], error: null };
  mock.createClient.mockReset();
  mock.createClient.mockImplementation((_url, _key, options) => {
    if (
      options.auth.persistSession !== false ||
      options.auth.autoRefreshToken !== false ||
      options.auth.detectSessionInUrl !== false
    )
      throw new Error('Public lookup must not inherit an owner session.');
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq(key: string, value: unknown) {
        filters[key] = value;
        return query;
      },
      maybeSingle: async () => {
        if (result.error) return result;
        const row = result.data as { id?: string; status?: string } | null;
        return {
          data:
            filters.id === merchantId && row?.id === merchantId && row.status === 'live'
              ? { id: row.id }
              : null,
          error: null,
        };
      },
      limit: async (limit: number) => {
        if (filters.merchant_id !== merchantId || filters.active !== true || limit !== 1)
          throw new Error('Legacy capacity lookup must be scoped to the active merchant.');
        return legacyResult;
      },
    };
    return {
      from: (table: string) => {
        if (!['merchant_public', 'bookable_resource'].includes(table))
          throw new Error('Wrong publication owner.');
        return query;
      },
    };
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('public booking publication', () => {
  it('blocks new engine intake while a production merchant still offers Supabase resources', async () => {
    vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.example.test');
    vi.stubEnv('BOOKING_BRIDGE_SECRET', 's'.repeat(40));
    vi.stubEnv('BOOKING_ENGINE_MERCHANT_IDS', merchantId);
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('available');
    legacyResult.data = [{ id: 'old-resource' }];
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('not_found');
    await expect(publicMerchantBookingAccess(request(), merchantId, false)).resolves.toBe(
      'available',
    );
    legacyResult = { data: null, error: { message: 'Unavailable' } };
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('unavailable');
  });
  it('requires the anonymously visible live merchant rather than an authenticated owner draft', async () => {
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('available');
    result.data = { id: merchantId, status: 'under_review' };
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('not_found');
    result.data = null;
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('not_found');
  });
  it('fails closed for missing configuration and database/transport failures', async () => {
    result = { data: null, error: { message: 'Unavailable' } };
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('unavailable');
    mock.createClient.mockImplementation(() => {
      throw new Error('Connection failed');
    });
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('unavailable');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    await expect(publicMerchantBookingAccess(request(), merchantId)).resolves.toBe('unavailable');
  });
  it('permits only the explicit loopback development fixture and has no production/non-UUID bypass', async () => {
    vi.stubEnv('NEXG_BOOKING_SANDBOX', '1');
    await expect(
      publicMerchantBookingAccess(request('localhost'), 'local-booking-business'),
    ).resolves.toBe('not_found');
    vi.stubEnv('NODE_ENV', 'development');
    await expect(
      publicMerchantBookingAccess(request('localhost'), 'local-booking-business'),
    ).resolves.toBe('available');
    await expect(
      publicMerchantBookingAccess(request('merchant.test'), 'local-booking-business'),
    ).resolves.toBe('not_found');
    await expect(
      publicMerchantBookingAccess(
        new Request('http://localhost/api/public/booking/local-booking-business/catalog', {
          headers: { host: 'merchant.test' },
        }),
        'local-booking-business',
      ),
    ).resolves.toBe('not_found');
    await expect(
      publicMerchantBookingAccess(request('localhost'), 'arbitrary-business'),
    ).resolves.toBe('not_found');
    result.data = null;
    await expect(publicMerchantBookingAccess(request('localhost'), merchantId)).resolves.toBe(
      'not_found',
    );
  });
});
