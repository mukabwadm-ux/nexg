import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
);
const legacyBookingState = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/partner', () => ({
  requireMerchant: vi.fn(async () => ({ id: '12345678-1234-4234-8234-123456789abc' })),
}));
vi.mock('@/lib/booking/board-data', () => ({ legacyBookingState }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/components/merchant/booking/workspace', () => ({
  MerchantBookingWorkspace: () => null,
}));

import MerchantCalendarPage from './page';

describe('merchant Calendar', () => {
  beforeEach(() => {
    redirect.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'production');
    legacyBookingState.mockReset().mockResolvedValue('clear');
  });

  it('sends merchants to the Bookings board while the booking runtime is not connected', async () => {
    vi.stubEnv('BOOKING_ENGINE_URL', '');
    vi.stubEnv('BOOKING_BRIDGE_SECRET', '');
    await expect(MerchantCalendarPage()).rejects.toThrow('redirect:/merchant/bookings');
  });

  it('opens the calendar once the booking runtime is connected', async () => {
    vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.example.test');
    vi.stubEnv('BOOKING_BRIDGE_SECRET', 'a'.repeat(32));
    await expect(MerchantCalendarPage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
  it.each(['legacy', 'unavailable'])(
    'keeps the existing board for booking state %s',
    async (state) => {
      vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.example.test');
      vi.stubEnv('BOOKING_BRIDGE_SECRET', 'a'.repeat(32));
      legacyBookingState.mockResolvedValue(state);
      await expect(MerchantCalendarPage()).rejects.toThrow('redirect:/merchant/bookings');
    },
  );
});
