import { describe, expect, it } from 'vitest';

import {
  customersCsv,
  deltaOf,
  hasPoints,
  merchantsCsv,
  opsCsv,
  opsTypeRows,
  parseCustomers,
  parseRiders,
  pointsMove,
  ridersCsv,
  seriesRows,
  trendPoints,
} from './finance-reports';
import type { PerfMerchant } from './performance';

describe('reading the riders report', () => {
  it('makes numbers of what the database sends, and keeps a missing average missing', () => {
    const r = parseRiders({
      kpis: {
        active_riders: { now: 2, before: 1 },
        deliveries: { now: '4', before: 1 },
        earnings_cents: { now: 78000, before: 10000 },
        tips_cents: { now: 5000, before: 0 },
        cash_collected_cents: { now: 200000, before: 0 },
        avg_per_delivery_cents: { now: 19500, before: null },
      },
      series: [{ day: '2020-02-04', earnings_cents: 55000, deliveries: 2 }],
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
    });
    expect(r.kpis.deliveries).toEqual({ now: 4, before: 1 });
    expect(r.kpis.avg_per_delivery_cents).toEqual({ now: 19500, before: null });
    expect(r.series[0]).toEqual({ day: '2020-02-04', earnings_cents: 55000, deliveries: 2 });
    expect(r.riders[0]!.name).toBe('Kevin Otieno');
  });

  it('reads nothing as zeros and empty lists, never invented rows', () => {
    const r = parseRiders(null);
    expect(r.kpis.earnings_cents).toEqual({ now: 0, before: 0 });
    expect(r.kpis.avg_per_delivery_cents).toEqual({ now: null, before: null });
    expect(r.series).toEqual([]);
    expect(r.riders).toEqual([]);
  });
});

describe('reading the customers report', () => {
  it('keeps the masked label and the spend split', () => {
    const c = parseCustomers({
      kpis: {
        customers: { now: 3, before: 1 },
        repeat_rate_pct: { now: 33.3, before: 0 },
        avg_spend_cents: { now: null, before: null },
      },
      series: [{ day: '2020-02-06', new: 1, returning: 0 }],
      top: [{ label: 'Customer ···401', payments: 2, spend_cents: 1150000, first_paid_at: null }],
      by_intent: [{ intent: 'stay', payments: 1, spend_cents: 900000 }],
    });
    expect(c.kpis.customers).toEqual({ now: 3, before: 1 });
    expect(c.kpis.new_customers).toEqual({ now: 0, before: 0 });
    expect(c.kpis.repeat_rate_pct).toEqual({ now: 33.3, before: 0 });
    expect(c.kpis.avg_spend_cents).toEqual({ now: null, before: null });
    expect(c.series[0]).toEqual({ day: '2020-02-06', new: 1, returning: 0 });
    expect(c.top[0]!.label).toBe('Customer ···401');
    expect(c.by_intent[0]).toEqual({ intent: 'stay', payments: 1, spend_cents: 900000 });
  });
});

describe('how a figure moved', () => {
  it('is a percentage change, or nothing when there was nothing before', () => {
    expect(deltaOf(150, 100)).toEqual({ value: 50, upIsBad: false });
    expect(deltaOf(50, 100, true)).toEqual({ value: -50, upIsBad: true });
    expect(deltaOf(10, 0)).toBeNull();
    expect(deltaOf(null, 10)).toBeNull();
  });

  it('moves a rate in points, not as a percentage of itself', () => {
    expect(pointsMove(24, 21.5)).toEqual({ text: '+2.5 pts', up: true });
    expect(pointsMove(20, 22)).toEqual({ text: '−2 pts', up: false });
    expect(pointsMove(20, null)).toBeNull();
  });
});

describe('trend points', () => {
  it('puts each per-day line against its day', () => {
    expect(seriesRows('2026-11-01', '2026-11-03', { orders: [1, 2, 3], bookings: [0, 1] })).toEqual(
      [
        { day: '2026-11-01', orders: 1, bookings: 0 },
        { day: '2026-11-02', orders: 2, bookings: 1 },
        { day: '2026-11-03', orders: 3, bookings: 0 },
      ],
    );
  });

  it('has one point per day, money in whole shillings, and nothing outside the period', () => {
    const t = trendPoints(
      [
        { day: '2026-11-01', gmv: 125_050, orders: 2 },
        { day: '2026-11-03', gmv: 10_000, orders: 1 },
        { day: '2026-10-31', gmv: 99_900, orders: 9 },
      ],
      '2026-11-01',
      '2026-11-03',
      ['gmv', 'orders'],
      ['gmv'],
    );
    expect(t.step).toBe('day');
    expect(t.points).toEqual([
      { day: '2026-11-01', gmv: 1251, orders: 2 },
      { day: '2026-11-02', gmv: 0, orders: 0 },
      { day: '2026-11-03', gmv: 100, orders: 1 },
    ]);
    expect(hasPoints(t, ['gmv'])).toBe(true);
  });

  it('folds a period longer than three months into months', () => {
    const t = trendPoints(
      [
        { day: '2026-01-05', n: 1 },
        { day: '2026-01-20', n: 2 },
        { day: '2026-04-30', n: 4 },
      ],
      '2026-01-01',
      '2026-04-30',
      ['n'],
    );
    expect(t.step).toBe('month');
    expect(t.points).toEqual([
      { day: '2026-01-01', n: 3 },
      { day: '2026-02-01', n: 0 },
      { day: '2026-03-01', n: 0 },
      { day: '2026-04-01', n: 4 },
    ]);
  });

  it('says when there is nothing to draw', () => {
    expect(hasPoints(trendPoints([], '2026-11-01', '2026-11-02', ['n']), ['n'])).toBe(false);
  });
});

describe('operations by type', () => {
  it('adds up each type and the total, and leaves a type that failed as unknown', () => {
    const { rows, total } = opsTypeRows([
      { ongoing: 2, pending: 1, completed: 5, cancelled: 1 },
      null,
      { ongoing: 0, pending: 3, completed: 0, cancelled: 0 },
      { ongoing: 1, pending: 0, completed: 2, cancelled: 0 },
      { ongoing: 0, pending: 0, completed: 0, cancelled: 0 },
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      'Food & Deliveries',
      'Stays',
      'Experiences',
      'Transfers',
      'Services',
    ]);
    expect(rows[0]).toMatchObject({ total: 9, ongoing: 2, completed: 5 });
    expect(rows[1]).toMatchObject({ total: null, ongoing: null, cancelled: null });
    expect(total).toEqual({
      label: 'Total',
      total: 15,
      ongoing: 3,
      pending: 4,
      completed: 7,
      cancelled: 1,
    });
    expect(opsCsv(rows, total)[0]).toEqual([
      'Type',
      'Orders/Bookings',
      'Ongoing',
      'Pending',
      'Completed',
      'Cancelled',
    ]);
    expect(opsCsv(rows, total)[6]).toEqual(['Total', 15, 3, 4, 7, 1]);
  });
});

describe('CSV rows', () => {
  it('writes money in whole shillings under a header', () => {
    const merchant: PerfMerchant = {
      id: 'm1',
      name: 'Urban Bistro',
      category_key: 'restaurants_food',
      category_label: 'Restaurants & Food',
      photo_path: null,
      gmv: 1_234_560,
      commission: 98_760,
      orders: 12,
      prev_gmv: 0,
      rating: null,
      ratings: 0,
    };
    expect(merchantsCsv([merchant])).toEqual([
      ['Merchant', 'Category', 'GMV (KES)', 'Commission ex VAT (KES)', 'Orders', 'Rating'],
      ['Urban Bistro', 'Restaurants & Food', 12346, 988, 12, ''],
    ]);
    expect(
      ridersCsv([
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
      ])[1],
    ).toEqual(['Kevin Otieno', 2, 550, 50, 35, 35, 1200]);
  });

  it('dates a customer by the Nairobi day they first paid, and never names them', () => {
    expect(
      customersCsv([
        {
          label: 'Customer ···401',
          payments: 2,
          spend_cents: 1_150_000,
          first_paid_at: '2020-01-14T21:30:00Z',
        },
      ]),
    ).toEqual([
      ['Customer', 'Payments', 'Spend (KES)', 'First Paid'],
      ['Customer ···401', 2, 11500, '2020-01-15'],
    ]);
  });
});
