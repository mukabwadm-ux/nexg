import { describe, expect, it } from 'vitest';

import {
  daysBetween,
  humanize,
  invoiceBucket,
  PAYEE_GROUPS,
  payeeGroup,
  series,
  share,
  statusTotals,
  totalsBy,
  typeOf,
  type MovementSum,
} from './finance';

const row = (over: Partial<MovementSum>): MovementSum => ({
  day: '2026-11-03',
  source: 'payment',
  kind: 'customer',
  category: 'restaurants_food',
  channel: 'mpesa',
  direction: 'in',
  status: 'successful',
  n: 1,
  cents: 100_00,
  ...over,
});

const rows: MovementSum[] = [
  row({ cents: 320_000_00, n: 3 }),
  row({ day: '2026-11-04', status: 'pending', cents: 50_000_00 }),
  row({ day: '2026-11-04', status: 'failed', cents: 10_000_00, n: 2 }),
  row({ source: 'refund', kind: 'refund', direction: 'out', status: 'refunded', cents: 24_000_00 }),
  row({ source: 'refund', kind: 'refund', direction: 'out', status: 'void', cents: 9_999_00 }),
  row({
    day: '2026-11-05',
    source: 'payout',
    kind: 'merchant',
    category: 'merchant',
    direction: 'out',
    cents: 145_600_00,
  }),
];

describe('adding up movements', () => {
  it('totals by status and leaves out rows that moved no money', () => {
    expect(statusTotals(rows)).toEqual({
      total: 549_600_00,
      count: 8,
      successful: 465_600_00,
      pending: 50_000_00,
      failed: 10_000_00,
      refunded: 24_000_00,
    });
  });

  it('splits by any key, largest first, with shares', () => {
    const byKind = totalsBy(rows, (r) => r.kind);
    expect(byKind.map((k) => k.key)).toEqual(['customer', 'merchant', 'refund']);
    expect(byKind[0]!.cents).toBe(380_000_00);
    expect(Math.round(byKind[0]!.share)).toBe(69);
  });

  it('gives no share of nothing', () => {
    expect(share(5, 0)).toBeNull();
    expect(share(1, 4)).toBe(25);
  });
});

describe('trends', () => {
  it('lists every day of a period', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('adds shillings per day for each series, zero on quiet days', () => {
    const s = series(rows, '2026-11-03', '2026-11-06', {
      in: (r) => r.direction === 'in',
      out: (r) => r.direction === 'out',
    });
    expect(s.step).toBe('day');
    expect(s.points).toEqual([
      { day: '2026-11-03', in: 320_000, out: 24_000 },
      { day: '2026-11-04', in: 60_000, out: 0 },
      { day: '2026-11-05', in: 0, out: 145_600 },
      { day: '2026-11-06', in: 0, out: 0 },
    ]);
  });

  it('folds a long period into months', () => {
    const s = series(rows, '2026-06-01', '2026-11-30', { all: () => true });
    expect(s.step).toBe('month');
    expect(s.points).toHaveLength(6);
    expect(s.points.at(-1)).toEqual({ day: '2026-11-01', all: 549_600 });
  });
});

describe('words', () => {
  it('names each kind of row', () => {
    expect(typeOf({ source: 'payout', kind: 'merchant', category: 'host' }).label).toBe(
      'Host Payout',
    );
    expect(typeOf({ source: 'payment', kind: 'rider', category: 'rider_float' }).label).toBe(
      'Rider Float',
    );
    expect(typeOf({ source: 'b2c', kind: 'refund', category: 'return_excess' }).label).toBe(
      'Refund',
    );
    expect(
      typeOf({ source: 'payout', kind: 'merchant', category: 'experience_partner' }).label,
    ).toBe('Partner Payout');
  });

  it('puts experience partners with Partners & Others', () => {
    expect(payeeGroup('experience_partner')).toBe('other');
    expect(PAYEE_GROUPS[payeeGroup('experience_partner')].label).toBe('Partners & Others');
  });

  it('turns keys into words', () => {
    expect(humanize('restaurants_food')).toBe('Restaurants Food');
    expect(humanize('cost_of_sales')).toBe('Cost of Sales');
    expect(humanize(null)).toBe('—');
  });
});

describe('invoices', () => {
  it('works out overdue from the due date', () => {
    expect(invoiceBucket({ status: 'sent', due_at: '2026-11-10' }, '2026-11-16')).toBe('overdue');
    expect(invoiceBucket({ status: 'due', due_at: '2026-11-20' }, '2026-11-16')).toBe(
      'outstanding',
    );
    expect(invoiceBucket({ status: 'ready', due_at: null }, '2026-11-16')).toBe('outstanding');
    expect(invoiceBucket({ status: 'paid', due_at: '2026-01-01' }, '2026-11-16')).toBe('paid');
    expect(invoiceBucket({ status: 'draft', due_at: '2026-01-01' }, '2026-11-16')).toBe('draft');
  });
});
