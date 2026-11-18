import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomersReport, MerchantsReport, OperationsReport, RidersReport } from './report-tabs';

/* The readers answer from here; the charts and the CSV button say what they were given. */
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ rpc }) }));
vi.mock('@/components/charts', () => ({
  TrendArea: ({ series, data }: { series: { key: string }[]; data: unknown[] }) => (
    <div data-trend={series.map((s) => s.key).join(',')} data-points={data.length} />
  ),
  ShareDonut: ({ data, centre }: { data: { label: string; value: number }[]; centre: string }) => (
    <div data-donut={data.map((s) => `${s.label}:${s.value}`).join('|')} data-centre={centre} />
  ),
}));
vi.mock('./report-export', () => ({
  ReportExport: ({ filename, rows }: { filename: string; rows: unknown[][] }) => (
    <button type="button" data-file={filename} data-rows={rows.length}>
      Export
    </button>
  ),
}));

const period = { from: '2026-11-01', to: '2026-11-07' };
const before = { from: '2026-10-25', to: '2026-10-31' };
const week = (n: number) => Array.from({ length: 7 }, () => n);

/* A block, not an arrow's value: vitest calls a function returned from beforeEach as teardown. */
beforeEach(() => {
  rpc.mockReset();
});

describe('Operations', () => {
  const overview = (ongoing: number) => ({
    kpis: {
      orders: { value: 14, delta: 40, series: week(2) },
      bookings: { value: 7, delta: null, series: week(1) },
      deliveries: { value: 3, delta: -12.5, series: week(1) },
      guests: { value: 5, delta: 10, series: [2, 2, 2, 2, 2, 3, 3] },
      incidents: { value: 1, delta: null, series: [0, 0, 1, 0, 0, 0, 0] },
    },
    buckets: { ongoing, pending: 1, completed: 4, cancelled: 1 },
  });

  it('reads each type once and adds them up, with the period’s KPIs', async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_tab: string }) => ({
      data: overview(args.p_tab === 'food' ? 3 : 0),
      error: null,
    }));
    const html = renderToStaticMarkup(await OperationsReport({ period, before }));

    expect(rpc.mock.calls.map((c) => c[1].p_tab)).toEqual([
      'food',
      'stays',
      'experiences',
      'transfers',
      'services',
    ]);
    expect(html).toContain('Total Orders');
    expect(html).toContain('Bookings &amp; Reservations');
    /* Deliveries finished in the period (7), not the live count (3). */
    expect(html).toMatch(/>7<\/span><span[^>]*>Deliveries Completed/);
    expect(html).toContain('2.3');
    expect(html).toContain('Incidents Raised');
    expect(html).toContain('Food &amp; Deliveries');
    /* Food 3+1+4+1, the other four 0+1+4+1 each: 9 + 24 = 33. */
    expect(html).toMatch(/Total<\/th><td[^>]*>33</);
    expect(html).toContain('data-rows="7"');
    expect(html).toContain('finance-operations-by-type-2026-11-01-to-2026-11-07.csv');
    expect(html).toContain('data-trend="orders,bookings"');
  });

  it('says what failed and leaves that type unknown, not zero', async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_tab: string }) =>
      args.p_tab === 'stays'
        ? { data: null, error: { message: 'Choose a period of 400 days or less.' } }
        : { data: overview(0), error: null },
    );
    const html = renderToStaticMarkup(await OperationsReport({ period, before }));
    expect(html).toContain('This report could not be loaded in full: Choose a period');
    expect(html).toMatch(/Stays<\/th><td[^>]*>—</);
  });
});

describe('Merchants', () => {
  it('shows sales in shillings and a dash for a merchant with no rating', async () => {
    rpc.mockResolvedValue({
      data: {
        kpis: {
          gmv: { now: 1_234_560, before: 1_000_000 },
          commission: { now: 98_760, before: 0 },
          orders: { now: 12, before: 10 },
          active: { now: 4, before: 4 },
          rating: { now: null, before: null, count: 0 },
        },
        series: [{ day: '2026-11-02', gmv: 1_234_560, commission: 98_760 }],
        categories: [],
        merchants: [
          {
            id: 'm1',
            name: 'Urban Bistro',
            category_key: 'restaurants_food',
            category_label: 'Restaurants & Food',
            gmv: 1_234_560,
            commission: 98_760,
            orders: 12,
            prev_gmv: 0,
            rating: null,
            ratings: 0,
          },
          {
            id: 'm2',
            name: 'Quiet Shop',
            category_key: 'groceries_essentials',
            category_label: 'Groceries',
            gmv: 0,
            commission: 0,
            orders: 0,
            prev_gmv: 5000,
            rating: null,
            ratings: 0,
          },
        ],
      },
      error: null,
    });
    const html = renderToStaticMarkup(await MerchantsReport({ period, before }));
    expect(html).toContain('KES 12,346');
    expect(html).toContain('GMV (Total Sales)');
    expect(html).toContain('No ratings yet');
    expect(html).toContain('Urban Bistro');
    /* Sold nothing in the period: not on the leaderboard. */
    expect(html).not.toContain('Quiet Shop');
    expect(html).toContain('data-rows="2"');
  });

  it('never shows invented zeros when the reader fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Only people who reach Finance' } });
    const html = renderToStaticMarkup(await MerchantsReport({ period, before }));
    expect(html).toContain('could not be loaded in full');
    expect(html).not.toContain('KES 0');
    expect(html).toContain('No merchant sold anything in this period.');
    expect(html).not.toContain('data-file');
  });
});

describe('Riders', () => {
  it('shows earnings per rider in shillings and the average per delivery', async () => {
    rpc.mockResolvedValue({
      data: {
        kpis: {
          active_riders: { now: 2, before: 1 },
          deliveries: { now: 4, before: 1 },
          earnings_cents: { now: 78000, before: 10000 },
          tips_cents: { now: 5000, before: 0 },
          cash_collected_cents: { now: 200000, before: 0 },
          avg_per_delivery_cents: { now: 19500, before: 10000 },
        },
        series: [{ day: '2026-11-04', earnings_cents: 55000, deliveries: 2 }],
        riders: [
          {
            id: 'r1',
            name: 'Kevin Otieno',
            deliveries: 2,
            earnings_cents: 55000,
            tips_cents: 5000,
            bonus_cents: 3500,
            penalty_cents: 3500,
            cash_collected_cents: 120000,
          },
        ],
      },
      error: null,
    });
    const html = renderToStaticMarkup(await RidersReport({ period, before }));
    expect(rpc).toHaveBeenCalledWith('rpc_finance_report_riders', {
      p_from: '2026-11-01',
      p_to: '2026-11-07',
    });
    expect(html).toContain('KES 780');
    expect(html).toContain('KES 195');
    expect(html).toContain('Average per Delivery');
    expect(html).toContain('+95%');
    expect(html).toContain('Kevin Otieno');
    expect(html).toContain('1,200');
    expect(html).toContain('finance-riders-2026-11-01-to-2026-11-07.csv');
  });
});

describe('Customers', () => {
  it('shows customers masked, the repeat rate in points and payments nobody can be named for', async () => {
    rpc.mockResolvedValue({
      data: {
        kpis: {
          customers: { now: 3, before: 1 },
          new_customers: { now: 1, before: 1 },
          returning_customers: { now: 2, before: 0 },
          repeat_rate_pct: { now: 33.3, before: 30.8 },
          avg_spend_cents: { now: 466667, before: 50000 },
          total_paid_cents: { now: 1440000, before: 50000 },
          unidentified_payments: { now: 1, before: 0 },
        },
        series: [{ day: '2026-11-04', new: 0, returning: 1 }],
        top: [
          {
            label: 'Customer ···401',
            payments: 2,
            spend_cents: 1150000,
            first_paid_at: '2026-10-15T09:00:00Z',
          },
        ],
        by_intent: [
          { intent: 'order', payments: 4, spend_cents: 540000 },
          { intent: 'stay', payments: 1, spend_cents: 900000 },
        ],
      },
      error: null,
    });
    const html = renderToStaticMarkup(await CustomersReport({ period, before }));
    expect(html).toContain('Customer ···401');
    expect(html).toContain('Oct 15, 2026');
    expect(html).toContain('33.3%');
    expect(html).toContain('+2.5 pts vs Oct');
    expect(html).toContain('KES 14,400');
    expect(html).toContain('data-donut="Orders:5400|Stays:9000"');
    expect(html).toContain('1 paid payment carries no guest or phone');
  });

  it('says so when nobody paid, with nothing to export', async () => {
    rpc.mockResolvedValue({
      data: { kpis: {}, series: [], top: [], by_intent: [] },
      error: null,
    });
    const html = renderToStaticMarkup(await CustomersReport({ period, before }));
    expect(html).toContain('No customer paid for an order or a stay in this period.');
    expect(html).toContain('No paid orders or stays in this period.');
    expect(html).not.toContain('data-file');
  });
});
