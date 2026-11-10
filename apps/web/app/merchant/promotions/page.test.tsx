import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MerchantFeatured from '../featured/page';
import MerchantPromotions from './page';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/partner', () => ({ requireMerchant: async () => ({ id: 'merchant-1' }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from, rpc }) }));
vi.mock('@/app/merchant/actions', () => ({ requestFeatured: vi.fn(), withdrawFeatured: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error('redirect:' + path);
  },
}));

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  return Object.assign(result, {
    select: () => result,
    eq: () => result,
    not: () => result,
    order: () => result,
    limit: () => result,
    maybeSingle: () => result,
  });
}

const placement = {
  id: 'placement-1',
  kind: 'homepage',
  category: null,
  position: 1,
  label: 'Nairobi homepage spot',
  description: null,
  city_id: 'city-1',
};

function sources(bookings: unknown[], eligible: boolean) {
  from.mockImplementation((table: string) => {
    if (table === 'merchant_home_v')
      return query({ name: 'Example Merchant', status: 'live', city_id: 'city-1' });
    if (table === 'catalogue_item' || table === 'merchant_promotion') return query([]);
    return query(table === 'featured_booking' ? bookings : [placement]);
  });
  rpc.mockImplementation(async (name: string) => ({
    data: name === 'fn_featured_eligibility' ? { passed: eligible } : 1200,
    error: null,
  }));
}

beforeEach(() => vi.clearAllMocks());

describe('live Promotions workspace', () => {
  it('preserves the existing Featured entry and presents an eligible city placement', async () => {
    sources([], true);

    expect(() => MerchantFeatured()).toThrow('redirect:/merchant/promotions');
    const html = renderToStaticMarkup(await MerchantPromotions());
    expect(html).toContain('Nairobi homepage spot');
    expect(html).toContain('KES 1,200');
    expect(html).toContain('Ask for it');
  });

  it('shows a pending request and lets the merchant withdraw after eligibility changes', async () => {
    sources(
      [
        {
          id: 'booking-1',
          placement_kind: 'homepage',
          status: 'requested',
          wanted_start: '2026-11-09',
          weeks: 1,
          quoted_price: null,
          requested_at: '2026-11-04T12:00:00Z',
          start_date: null,
          end_date: null,
        },
      ],
      false,
    );

    const html = renderToStaticMarkup(await MerchantPromotions());
    expect(html).toContain('Withdraw this request');
    expect(html).toContain('Requested week of');
  });
});
