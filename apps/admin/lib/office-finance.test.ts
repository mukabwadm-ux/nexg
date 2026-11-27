import { describe, expect, it } from 'vitest';

import {
  fromDayFirst,
  spelledDay,
  toDayFirst,
  budgetFor,
  byCategory,
  lastMonths,
  monthlySpend,
  monthsBetween,
  previousPeriod,
  spendBetween,
  utilisation,
  vsLabel,
} from './office-finance';

const rows = [
  { spent_on: '2026-11-03', category: 'rent_utilities', amount_cents: 100_000_000, status: 'paid' },
  {
    spent_on: '2026-11-10',
    category: 'salaries_wages',
    amount_cents: 83_500_000,
    status: 'approved',
  },
  {
    spent_on: '2026-11-12',
    category: 'office_supplies',
    amount_cents: 12_000_000,
    status: 'cancelled',
  },
  { spent_on: '2026-11-13', category: 'rent_utilities', amount_cents: 11_360_000, status: 'paid' },
  { spent_on: '2026-10-28', category: 'it_systems', amount_cents: 27_800_000, status: 'paid' },
  { spent_on: '2026-10-29', category: 'other', amount_cents: 5_000_000, status: 'rejected' },
];

describe('periods and months', () => {
  it('lists every month a period touches', () => {
    expect(monthsBetween('2026-11-03', '2026-12-02')).toEqual(['2026-11-01', '2026-12-01']);
    expect(monthsBetween('2026-11-01', '2026-11-16')).toEqual(['2026-11-01']);
    expect(monthsBetween('2026-12-20', '2027-01-05')).toEqual(['2026-12-01', '2027-01-01']);
  });

  it('counts back six months across a year end', () => {
    expect(lastMonths('2027-02-14', 4)).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
  });

  it('finds the period of the same length just before', () => {
    expect(previousPeriod('2026-11-01', '2026-11-16')).toEqual({
      from: '2026-10-16',
      to: '2026-10-31',
    });
  });

  it('names the month a KPI is compared with, or says prior period', () => {
    expect(vsLabel({ from: '2026-10-16', to: '2026-10-31' })).toBe('vs Oct');
    expect(vsLabel({ from: '2026-10-20', to: '2026-11-18' })).toBe('vs prior period');
  });
});

describe('spend', () => {
  it('counts recorded and paid expenses only', () => {
    expect(spendBetween(rows, '2026-11-01', '2026-11-30')).toBe(194_860_000);
    expect(spendBetween(rows, '2026-10-01', '2026-10-31')).toBe(27_800_000);
  });

  it('counts an expense still marked waiting from before approvals were dropped', () => {
    const old = {
      spent_on: '2026-11-12',
      category: 'other',
      amount_cents: 180_000,
      status: 'submitted',
    };
    expect(spendBetween([old], '2026-11-01', '2026-11-30')).toBe(180_000);
  });

  it('splits spend by category, largest first', () => {
    const cats = byCategory(rows.filter((r) => r.spent_on >= '2026-11-01'));
    expect(cats.map((c) => c.key)).toEqual(['rent_utilities', 'salaries_wages']);
    expect(cats[0]!.cents).toBe(111_360_000);
    expect(Math.round(cats[0]!.share)).toBe(57);
  });

  it('adds up each month', () => {
    expect(monthlySpend(rows, ['2026-10-01', '2026-11-01'])).toEqual([
      { month: '2026-10-01', cents: 27_800_000 },
      { month: '2026-11-01', cents: 194_860_000 },
    ]);
  });
});

describe('budgets', () => {
  const budgets = [
    { month: '2026-11-01', category: 'rent_utilities', amount_cents: 110_000_000 },
    { month: '2026-11-01', category: 'salaries_wages', amount_cents: 80_000_000 },
    { month: '2026-10-01', category: 'rent_utilities', amount_cents: 100_000_000 },
  ];

  it('totals the budget for the months shown, or one category', () => {
    expect(budgetFor(budgets, ['2026-11-01'])).toBe(190_000_000);
    expect(budgetFor(budgets, ['2026-10-01', '2026-11-01'], 'rent_utilities')).toBe(210_000_000);
  });

  it('measures spend against budget, and says nothing without one', () => {
    expect(utilisation(194_860_000, 190_000_000)).toBeCloseTo(102.56, 1);
    expect(utilisation(5, 0)).toBeNull();
  });
});

describe('day-first dates', () => {
  it('spells a date out in words', () => {
    expect(spelledDay('2026-11-03')).toBe('Tuesday, 3 November 2026');
    expect(spelledDay('03/11/2026')).toBeUndefined();
  });

  it('reads 03/11/2026 as 3 November, not 11 March', () => {
    expect(fromDayFirst('03/11/2026')).toBe('2026-11-03');
    expect(fromDayFirst('3-11-26')).toBe('2026-11-03');
    expect(fromDayFirst(' 3.11.2026 ')).toBe('2026-11-03');
  });

  it('turns away dates that do not exist or are not dates', () => {
    expect(fromDayFirst('31/11/2026')).toBeNull();
    expect(fromDayFirst('11/13/2026')).toBeNull();
    expect(fromDayFirst('2026-11-03')).toBeNull();
    expect(fromDayFirst('')).toBeNull();
  });

  it('writes an ISO date day first and back', () => {
    expect(toDayFirst('2026-11-03')).toBe('03/11/2026');
    expect(fromDayFirst(toDayFirst('2026-02-28'))).toBe('2026-02-28');
  });
});
