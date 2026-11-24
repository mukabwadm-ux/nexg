import { describe, expect, it } from 'vitest';

import { toHostCommission, toHostSplitOverview } from './host-paystack';

describe('host commission read', () => {
  it('is null for an error or an odd shape, so the panel leaves the card out', () => {
    expect(toHostCommission(null)).toBeNull();
    expect(toHostCommission([])).toBeNull();
    expect(toHostCommission('nope')).toBeNull();
    expect(toHostCommission({ viewer: 'merchant' })).toBeNull();
  });

  it('fills what is missing and drops terms it cannot show', () => {
    const card = toHostCommission({
      viewer: 'staff',
      host_id: 'h1',
      charged_now: { pct: '12.5', agreed: true, preset_pct: 15 },
      preset_pct: 15,
      in_force: { id: 't1', starts_on: '2026-11-24', ends_on: null },
      today: '2026-11-24',
      can_request: true,
      terms: [
        { id: 't1', pct: 12.5, starts_on: '2026-11-24', status: 'approved', in_force: true },
        { id: 't2', pct: 10, starts_on: '2026-12-01', status: 'unknown' },
        null,
      ],
    });
    expect(card?.charged_now).toEqual({ pct: 12.5, agreed: true, preset_pct: 15 });
    expect(card?.can_decide).toBe(false);
    expect(card?.terms.map((t) => [t.id, t.pct, t.in_force])).toEqual([['t1', 12.5, true]]);
    expect(toHostCommission({ viewer: 'host' })?.terms).toEqual([]);
  });
});

describe('host split overview', () => {
  it('is null for an error or an odd shape', () => {
    expect(toHostSplitOverview(undefined)).toBeNull();
    expect(toHostSplitOverview({ viewer: 'nobody' })).toBeNull();
  });

  it('reads missing lists as empty and keeps only rows it can show', () => {
    expect(toHostSplitOverview({ viewer: 'staff' })).toEqual({
      viewer: 'staff',
      canRecord: false,
      subaccounts: [],
      stays: [],
    });
    const o = toHostSplitOverview({
      viewer: 'staff',
      canRecord: true,
      subaccounts: [
        { id: 's1', code: 'ACCT_abcd', test: true, schedule: 'auto', status: 'active' },
        { id: 's2' },
      ],
      stays: [{ stayId: 'x', totalCents: '1000000', toHostCents: 850000 }, { reference: 'R' }],
    });
    expect(o?.subaccounts.map((s) => [s.id, s.details.account_last4])).toEqual([['s1', null]]);
    expect(o?.stays).toHaveLength(1);
    expect(o?.stays[0]?.totalCents).toBe(1000000);
  });
});
