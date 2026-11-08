import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicMerchantBookingAccess } from './public-access';

const SANDBOX_ID = 'local-booking-business';
const sandbox = () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXG_BOOKING_SANDBOX', '1');
};
const request = (url: string, host?: string) =>
  new Request(url, host ? { headers: { host } } : undefined);

describe('publicMerchantBookingAccess', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it('admits the sandbox workspace when the browser used 127.0.0.1 and Next reports localhost', async () => {
    sandbox();
    await expect(
      publicMerchantBookingAccess(
        request(`http://localhost:3004/api/public/booking/${SANDBOX_ID}/catalog`, '127.0.0.1:3004'),
        SANDBOX_ID,
      ),
    ).resolves.toBe('available');
  });

  it("admits the acceptance scripts' local-* businesses only inside the sandbox", async () => {
    sandbox();
    const url = 'http://127.0.0.1:3004/api/public/booking/x/catalog';
    await expect(
      publicMerchantBookingAccess(
        request(url, '127.0.0.1:3004'),
        'local-space-acceptance-1a2b3c4d',
      ),
    ).resolves.toBe('available');
    await expect(
      publicMerchantBookingAccess(request(url, '127.0.0.1:3004'), 'local-workflow-tour-9f8e7d6c'),
    ).resolves.toBe('available');
    // Workflow model names carry underscores (linked_windows, production_due, service_job).
    await expect(
      publicMerchantBookingAccess(
        request(url, '127.0.0.1:3004'),
        'local-workflow-linked_windows-1a2b3c4d',
      ),
    ).resolves.toBe('available');
    vi.stubEnv('NEXG_BOOKING_SANDBOX', '0');
    await expect(
      publicMerchantBookingAccess(
        request(url, '127.0.0.1:3004'),
        'local-space-acceptance-1a2b3c4d',
      ),
    ).resolves.toBe('not_found');
  });

  it('never treats a public host as the sandbox, whatever the Host header claims', async () => {
    sandbox();
    await expect(
      publicMerchantBookingAccess(
        request(`https://nexgapp.com/api/public/booking/${SANDBOX_ID}/catalog`, '127.0.0.1'),
        SANDBOX_ID,
      ),
    ).resolves.toBe('not_found');
    await expect(
      publicMerchantBookingAccess(
        request(`http://127.0.0.1:3004/api/public/booking/${SANDBOX_ID}/catalog`, 'nexgapp.com'),
        SANDBOX_ID,
      ),
    ).resolves.toBe('not_found');
  });

  it('reports a missing Supabase configuration as unavailable for a real merchant id', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    await expect(
      publicMerchantBookingAccess(
        request('https://nexgapp.com/api/public/booking/x/catalog'),
        '12345678-1234-4234-8234-123456789abc',
      ),
    ).resolves.toBe('unavailable');
    await expect(
      publicMerchantBookingAccess(
        request('https://nexgapp.com/api/public/booking/x/catalog'),
        'not-a-merchant',
      ),
    ).resolves.toBe('not_found');
  });
});
