import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import MerchantMoney from './page';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/partner', () => ({ requireMerchant: async () => ({ id: 'merchant-1' }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from, rpc }) }));

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  return Object.assign(result, {
    select: () => result,
    eq: () => result,
    order: () => result,
    limit: () => result,
    maybeSingle: () => result,
  });
}

describe('live Money workspace', () => {
  it('renders Finance records and links to the existing order breakdown', async () => {
    const orderId = '743f4f20-8e8b-49cf-8750-0044a4550212';
    from.mockImplementation((table: string) =>
      query(
        table === 'merchant_home_v'
          ? { payout_rail: 'mpesa_till', earned_today_cents: 84725 }
          : [
              {
                id: 'statement-1',
                period_start: '2026-10-26',
                period_end: '2026-11-01',
                gross_kes: 2000,
                commission_kes: 250,
                adjustments_kes: 0,
                penalties_kes: 0,
                tax_withheld_kes: 0,
                net_kes: 1750,
                status: 'paid',
                paid_at: '2026-11-03T12:00:00Z',
                provider_ref: 'provider-1',
              },
            ],
      ),
    );
    rpc.mockResolvedValue({
      data: [
        {
          id: orderId,
          reference: 'ORDER-987',
          placed_at: '2026-11-03T09:00:00Z',
          payment_method: 'mpesa',
          payment_status: 'paid',
          settlement: 'paid',
          subtotal_cents: 12500,
          commission_cents: 2500,
          merchant_net_cents: 10000,
        },
      ],
      error: null,
    });

    const html = renderToStaticMarkup(await MerchantMoney());
    expect(html).toContain('ORDER-987');
    expect(html).toContain('KES 847.25');
    expect(html).toContain('KES 1,750');
    expect(html).toContain('href="/merchant/transactions/' + orderId + '"');
    expect(html).toContain('href="/merchant/transactions"');
  });
});
