import { beforeEach, describe, it, expect, vi } from 'vitest';
import { merchantContext } from '../components/merchant/frame';

const mocks = vi.hoisted(() => ({ requireMerchant: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/partner', () => ({
  requireMerchant: (...args: unknown[]) => mocks.requireMerchant(...args),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from: mocks.from }) }));
beforeEach(() => {
  mocks.requireMerchant.mockReset();
  mocks.from.mockReset();
  mocks.requireMerchant.mockResolvedValue({
    id: 'merchant',
    userId: 'actor',
    kind: 'merchant',
    home: '/merchant',
    access: { state: 'approved', setup: true, operations: true },
  });
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            id: 'merchant',
            trading_name: 'Acacia Kitchen',
            status: 'under_review',
            contact_name: 'Amina',
          },
          error: null,
        }),
      }),
    }),
  });
});
describe('managed Home and setup source boundaries', () => {
  it('loads only a safe merchant summary for approved managed Home', async () => {
    const result = await merchantContext({ setup: true });
    expect(result.m?.name).toBe('Acacia Kitchen');
    expect(mocks.from).toHaveBeenCalledWith('merchant');
    expect(mocks.from).not.toHaveBeenCalledWith('merchant_home_v');
  });
  it('keeps setup editor framing away from operational aggregates', async () => {
    await merchantContext({ draft: true });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith('merchant');
  });
});
