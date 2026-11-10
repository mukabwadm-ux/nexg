import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/partner', () => ({ requireMerchant: vi.fn(async () => ({ id: 'm-1' })) }));
vi.mock('@/components/merchant/booking/workspace', () => ({
  MerchantBookingWorkspace: () => null,
}));

import MerchantCalendarPage from './page';

describe('merchant Calendar', () => {
  beforeEach(() => {
    redirect.mockClear();
    vi.unstubAllEnvs();
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
});
