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
    expect(html).not.toContain('NexG commission:');
  });

  it('states the commission agreed with the merchant, with its dates', async () => {
    from.mockImplementation(() => query([]));
    rpc.mockImplementation(async (name: string) =>
      name === 'rpc_merchant_commission_read'
        ? {
            data: {
              own_riders: false,
              charged_now: { pct: 20, agreed: true, preset_pct: 28 },
              in_force: { starts_on: '2026-11-24', ends_on: '2027-05-31' },
            },
            error: null,
          }
        : { data: [], error: null },
    );

    const html = renderToStaticMarkup(await MerchantMoney());
    expect(html).toContain(
      'NexG commission: 20% on orders a NexG rider delivers, the rate agreed with you from 24 Nov 2026 to 31 May 2027 (standard rate 28%).',
    );
  });

  describe('Paystack payouts line', () => {
    /** Every other read answers empty; the split overview answers `overview`. */
    async function moneyWith(overview: unknown) {
      from.mockImplementation(() => query([]));
      rpc.mockImplementation(async (name: string) =>
        name === 'rpc_merchant_split_overview'
          ? { data: overview, error: null }
          : { data: [], error: null },
      );
      return renderToStaticMarkup(await MerchantMoney());
    }

    it('shows no Paystack line to a merchant with no sub-account (every merchant on day one)', async () => {
      const html = await moneyWith({ subaccounts: [], orders: [], recoveries: [] });
      expect(html).not.toContain('Paystack pays you');
      expect(html).not.toContain('Paystack payouts are paused');
    });

    it('does not crash when the overview has no lists or is not an overview at all', async () => {
      for (const overview of [{}, null, [], 'unexpected']) {
        const html = await moneyWith(overview);
        expect(html).not.toContain('Paystack pays you');
      }
    });

    it('says how Paystack pays a merchant with an active sub-account', async () => {
      const html = await moneyWith({
        subaccounts: [
          {
            id: 's1',
            test: false,
            schedule: 'weekly',
            status: 'active',
            details: { settlement_bank: 'Equity', account_last4: '1234' },
          },
        ],
        orders: [],
        recoveries: [],
      });
      expect(html).toContain(
        'Paystack pays you directly for each order, every week, to Equity · ····1234',
      );
    });

    it('says payouts are paused, and falls back to the payout run, when it is paused', async () => {
      const html = await moneyWith({
        subaccounts: [{ id: 's1', test: false, schedule: 'auto', status: 'paused' }],
        orders: [],
        recoveries: [],
      });
      expect(html).toContain('Paystack payouts are paused');
      expect(html).not.toContain('Paystack pays you');
    });
  });
});
