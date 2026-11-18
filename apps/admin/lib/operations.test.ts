import { describe, expect, it } from 'vitest';

import {
  etaLabel,
  isBucket,
  isTab,
  ksh,
  parseOverview,
  parseRows,
  type OpsRow,
} from './operations';

const NOW = Date.parse('2026-11-18T09:00:00Z'); // 12:00 in Nairobi

const row = (over: Partial<OpsRow>): OpsRow => ({
  kind: 'food',
  id: 'r1',
  ref: 'NX-1',
  customer: 'A. Wanjiku',
  party: 'Urban Bistro',
  amount_cents: 234_000,
  status: 'preparing',
  status_label: 'Preparing',
  tone: 'amber',
  bucket: 'ongoing',
  starts_at: '2026-11-18T08:40:00Z',
  ends_at: null,
  eta_at: '2026-11-18T09:18:00Z',
  area: 'Westlands',
  href: '/orders',
  ...over,
});

describe('etaLabel', () => {
  it('counts an order down to its estimate, and says how late it is', () => {
    expect(etaLabel(row({}), NOW)).toBe('~ 18 min');
    expect(etaLabel(row({ eta_at: '2026-11-18T08:55:00Z' }), NOW)).toBe('5 min late');
    expect(etaLabel(row({ kind: 'transfer', eta_at: '2026-11-18T09:12:00Z' }), NOW)).toBe(
      'Arriving ~ 12 min',
    );
  });

  it('says which night a stay is on, or when it starts', () => {
    const stay = row({
      kind: 'stay',
      starts_at: '2026-11-16T11:00:00Z',
      ends_at: '2026-11-23T08:00:00Z',
      eta_at: null,
    });
    expect(etaLabel(stay, NOW)).toBe('Day 3 of 7');
    expect(etaLabel({ ...stay, bucket: 'pending', starts_at: '2026-11-20T11:00:00Z' }, NOW)).toBe(
      'In Nov 20, 14:00',
    );
  });

  it('gives an experience day its date only, since it has no time', () => {
    expect(
      etaLabel(
        row({
          kind: 'experience',
          bucket: 'pending',
          starts_at: '2026-11-19T21:00:00Z',
          eta_at: null,
          all_day: true,
        }),
        NOW,
      ),
    ).toBe('Nov 20');
  });

  it('gives a booked day its date and time in Nairobi', () => {
    expect(
      etaLabel(row({ kind: 'experience', starts_at: '2026-11-18T07:00:00Z', eta_at: null }), NOW),
    ).toBe('Nov 18, 10:00');
  });

  it('shows nothing for a cancelled operation', () => {
    expect(etaLabel(row({ bucket: 'cancelled' }), NOW)).toBe('—');
  });
});

describe('ksh', () => {
  it('writes shillings as the designs do', () => {
    expect(ksh(234_000)).toBe('KSh 2,340');
    expect(ksh(1_860_050)).toBe('KSh 18,600.5');
    expect(ksh(null)).toBe('—');
  });
});

describe('parsers', () => {
  it('turn the database JSON into numbers with safe defaults', () => {
    const o = parseOverview({
      kpis: { orders: { value: '12', delta: '12.5', series: ['1', 2] } },
      buckets: { ongoing: '3' },
      city: { id: 'c', name: 'Nairobi', lat: '-1.28', lng: '36.82' },
      points: [{ kind: 'stay', lat: '-1.3', lng: '36.8', label: 'Riverside' }],
    });
    expect(o.kpis.orders).toEqual({ value: 12, delta: 12.5, series: [1, 2] });
    expect(o.kpis.incidents).toEqual({ value: null, delta: null, series: [] });
    expect(o.buckets).toEqual({ ongoing: 3, pending: 0, completed: 0, cancelled: 0 });
    expect(o.city?.lat).toBe(-1.28);
    expect(o.points[0]?.lng).toBe(36.8);
    expect(parseRows({ total: '7', rows: [row({ amount_cents: '500' as never })] })).toMatchObject({
      total: 7,
      rows: [{ amount_cents: 500 }],
    });
    expect(parseRows(null)).toEqual({ total: 0, rows: [] });
  });

  it('accept only known tabs and statuses', () => {
    expect(isTab('stays')).toBe(true);
    expect(isTab('nope')).toBe(false);
    expect(isBucket('pending')).toBe(true);
    expect(isBucket('all')).toBe(false);
  });
});
