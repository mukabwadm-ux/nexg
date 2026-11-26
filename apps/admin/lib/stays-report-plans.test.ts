import { describe, expect, it } from 'vitest';

import { plansFrom, savedPeriodDates, savedPeriodLabel } from './stays-report-plans';

describe('saved report periods', () => {
  it('turns each preset into dates on a day', () => {
    expect(savedPeriodDates('this_month', '2026-11-26')).toEqual({
      from: '2026-11-01',
      to: '2026-11-26',
    });
    expect(savedPeriodDates('last_month', '2026-03-05')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(savedPeriodDates('last_month', '2027-01-10')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(savedPeriodDates('last_7', '2026-11-26')).toEqual({
      from: '2026-11-20',
      to: '2026-11-26',
    });
    expect(savedPeriodDates('last_30', '2026-11-26')).toEqual({
      from: '2026-10-28',
      to: '2026-11-26',
    });
    expect(savedPeriodDates('custom', '2026-11-26', '2026-01-01', '2026-01-31')).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('labels fixed dates and presets', () => {
    expect(savedPeriodLabel({ period: 'last_7', from_date: null, to_date: null })).toBe(
      'Last 7 days',
    );
    expect(
      savedPeriodLabel({ period: 'custom', from_date: '2026-01-01', to_date: '2026-01-31' }),
    ).toBe('2026-01-01 to 2026-01-31');
  });

  it('reads a missing reader as empty lists', () => {
    expect(plansFrom(null)).toEqual({ schedules: [], saved: [], recipients: [] });
  });
});
