import { describe, expect, it } from 'vitest';

import {
  countFlags,
  factsOf,
  limitLabel,
  orderedLimits,
  parseOverview,
  sinceLabel,
  sortFlags,
  subjectLink,
  type FraudFlag,
} from './fraud';

const NOW = Date.parse('2026-11-17T12:00:00Z');

const flag = (over: Partial<FraudFlag>): FraudFlag => ({
  id: 'f1',
  kind: 'mpesa_code_reused',
  rule_label: 'One M-Pesa code on two records',
  subject_type: 'payment',
  subject_id: null,
  subject_label: 'M-Pesa QAB1CD2EF3',
  summary: 'M-Pesa code QAB1CD2EF3 is on 2 records',
  severity: 'high',
  details: {},
  order_reference: null,
  rider_id: null,
  amount_cents: null,
  status: 'open',
  detected_at: '2026-11-17T10:00:00Z',
  reviewed_at: null,
  reviewed_by: null,
  review_note: null,
  may_review: true,
  ...over,
});

describe('parseOverview', () => {
  it('turns the database JSON into numbers and safe defaults', () => {
    const o = parseOverview({
      scope: 'riders',
      can_change_rules: false,
      days: 90,
      last_run: {
        at: '2026-11-17T11:55:00Z',
        duration_ms: '41',
        raised: { riders: 1 },
        errors: {},
      },
      rules: [{ kind: 'gps_jump', params: { km: '2', seconds: 60 }, open: '3', sort: '40' }],
      flags: [{ id: 'x', amount_cents: '150000', details: null, may_review: 1 }],
    });
    expect(o.scope).toBe('riders');
    expect(o.last_run?.duration_ms).toBe(41);
    expect(o.rules[0]!.params).toEqual({ km: 2, seconds: 60 });
    expect(o.rules[0]!.open).toBe(3);
    expect(o.flags[0]!.amount_cents).toBe(150000);
    expect(o.flags[0]!.details).toEqual({});
    expect(o.flags[0]!.may_review).toBe(false);
  });

  it('survives an empty answer', () => {
    const o = parseOverview(null);
    expect(o).toMatchObject({ scope: 'all', can_change_rules: false, rules: [], flags: [] });
    expect(o.last_run).toBeNull();
  });
});

describe('countFlags', () => {
  it('counts open, high, mine and the last 30 days of decisions', () => {
    const c = countFlags(
      [
        flag({ id: 'a' }),
        flag({ id: 'b', severity: 'low', subject_type: 'rider', may_review: false }),
        flag({ id: 'c', status: 'confirmed', reviewed_at: '2026-11-10T00:00:00Z' }),
        flag({ id: 'd', status: 'dismissed', reviewed_at: '2026-11-16T00:00:00Z' }),
        flag({ id: 'e', status: 'dismissed', reviewed_at: '2026-09-01T00:00:00Z' }),
      ],
      NOW,
    );
    expect(c).toEqual({
      open: 2,
      openHigh: 1,
      confirmed30: 1,
      dismissed30: 1,
      bySubject: { payment: 1, rider: 1 },
      forMe: 1,
    });
  });
});

describe('sortFlags', () => {
  it('puts open flags worst first, then newest', () => {
    const sorted = sortFlags([
      flag({ id: 'old-high', detected_at: '2026-11-15T00:00:00Z' }),
      flag({ id: 'low', severity: 'low', detected_at: '2026-11-17T09:00:00Z' }),
      flag({ id: 'new-high', detected_at: '2026-11-17T08:00:00Z' }),
      flag({ id: 'medium', severity: 'medium' }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(['new-high', 'old-high', 'medium', 'low']);
  });
});

describe('sinceLabel', () => {
  it('says how long ago in plain words', () => {
    expect(sinceLabel('2026-11-17T11:59:40Z', NOW)).toBe('just now');
    expect(sinceLabel('2026-11-17T11:56:00Z', NOW)).toBe('4 min ago');
    expect(sinceLabel('2026-11-17T09:00:00Z', NOW)).toBe('3 h ago');
    expect(sinceLabel('2026-11-10T09:00:00Z', NOW)).toBe('10 Nov');
  });
});

describe('subjectLink', () => {
  it('links a flag to where its subject is managed', () => {
    expect(subjectLink(flag({ subject_type: 'rider', rider_id: 'r1' }))?.href).toBe('/riders/r1');
    expect(
      subjectLink(flag({ subject_type: 'staff', subject_id: 's1', order_reference: 'NX-1' }))?.href,
    ).toBe('/orders?chip=all&q=NX-1');
    expect(subjectLink(flag({ subject_type: 'staff', subject_id: 's1' }))?.href).toBe(
      '/staff?person=s1',
    );
    expect(subjectLink(flag({ subject_type: 'customer' }))).toBeNull();
  });
});

describe('factsOf', () => {
  const format = {
    money: (c: number) => `KES ${c / 100}`,
    time: (iso: string) => iso.slice(0, 10),
  };

  it('reads money, times, lists and flags, and leaves out internal ids', () => {
    const facts = factsOf(
      {
        code: 'QAB1CD2EF3',
        order_id: 'hidden',
        total_cents: 90000,
        delivered_at: '2026-11-17T08:00:00Z',
        same_file: true,
        payment_method: 'cash_on_delivery',
        records: [
          {
            source: 'payment',
            id: 'p1',
            label: 'Payment PAY-1',
            amount_cents: 250000,
            at: '2026-11-17T07:00:00Z',
          },
        ],
      },
      format,
    );
    expect(facts).toEqual([
      { kind: 'text', label: 'M-Pesa code', value: 'QAB1CD2EF3' },
      { kind: 'money', label: 'Order total', cents: 90000 },
      { kind: 'time', label: 'Marked delivered', iso: '2026-11-17T08:00:00Z' },
      { kind: 'text', label: 'Same stored file', value: 'Yes' },
      { kind: 'text', label: 'Payment method', value: 'cash on delivery' },
      {
        kind: 'list',
        label: 'Where the code appears',
        items: [{ title: 'Payment PAY-1', sub: ['KES 2500', '2026-11-17'] }],
      },
    ]);
  });
});

describe('orderedLimits', () => {
  it('puts how often or how far before the time it is measured over', () => {
    expect(orderedLimits({ days: 7, times: 3 })).toEqual([
      ['times', 3],
      ['days', 7],
    ]);
    expect(orderedLimits({ seconds: 60, km: 2 }).map(([k]) => k)).toEqual(['km', 'seconds']);
  });
});

describe('limitLabel', () => {
  it('names known limits and humanises the rest', () => {
    expect(limitLabel('grace_minutes')).toEqual({ label: 'Wait for the money', unit: 'min' });
    expect(limitLabel('new_limit')).toEqual({ label: 'new limit', unit: '' });
  });
});
