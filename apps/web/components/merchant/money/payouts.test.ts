import { describe, expect, it } from 'vitest';
import { profiles, seedCatalogue } from '../offerings/model';
import { sampleCsv } from './export';
import { minor, resolveMoneyView, type Context } from './model';
import { matchesPayout, payoutData, payoutTotals, type PayoutRecord } from './payouts';
import { localMoneySource } from './source';

function setup(profileId = 'restaurant') {
  const profile = profiles.find((p) => p.id === profileId)!;
  const offering = seedCatalogue(profile).offerings[0]!;
  const context: Context = { profile, offering, location: 'Westlands', method: 'Customer collection', role: 'manager', scenario: 'current' };
  const map = new Map<string, string>();
  const source = localMoneySource({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: (key) => { map.delete(key); } });
  return { context, source, view: resolveMoneyView(profile, offering, [offering.schemaId]) };
}

describe('source-scoped sample payouts', () => {
  it('separates an eligible settlement from its earlier paid payout and uses the same rows for filtering and export', async () => {
    const { context, source, view } = setup(), snapshot = await source.load(context);
    const data = payoutData(context, snapshot);
    expect(data.eligible).toBe(minor(30000));
    expect(data.reserve).toBe(minor(22000));
    expect(data.totals).toMatchObject({ inProgress: 0, paid: minor(150000), paidCount: 1 });
    expect(data.records).toMatchObject([
      { id: 'SET-1103', kind: 'Settlement', status: 'Eligible', amount: minor(30000), destination: 'Bank account ····4821' },
      { id: 'PAY-1031', kind: 'Payout', status: 'Paid', amount: minor(150000), destination: 'Not supplied' },
    ]);
    expect(data.records.filter((r) => matchesPayout(r, '1031', 'Paid')).map((r) => r.id)).toEqual(['PAY-1031']);
    const csv = sampleCsv(context, view, snapshot, 'Payouts', '1031', 'Paid');
    expect(csv).toContain('PAY-1031');
    expect(csv).toContain('KES 150,000');
    expect(csv).not.toContain('SET-1103');
    expect(csv).not.toContain('KES 30,000');
  });

  it('keeps an unknown or unreflected refund from presenting an updated settlement while preserving confirmed payout history', async () => {
    const { context, source } = setup(), initial = await source.load(context);
    const draft = await source.saveDraft(context, { id: 'OP-payout', kind: 'sale', recordId: 'TX-6112', amount: minor(100), reason: 'Sample refund' }, initial.revision);
    const unknown = await source.submitRefund(context, 'OP-payout', 'unknown', draft.revision);
    expect(payoutData(context, unknown)).toMatchObject({ eligible: null, reserve: null, pending: true, totals: { paid: minor(150000) } });
    expect(payoutData(context, unknown).records[0]).toMatchObject({ status: 'Needs refresh', amount: null });
    const confirmed = await source.reconcile(context, 'OP-payout', 'confirmed', unknown.revision);
    expect(payoutData(context, confirmed).eligible).toBeNull();
    const refreshed = await source.refreshStatement(context, confirmed.revision);
    expect(payoutData(context, refreshed)).toMatchObject({ eligible: minor(29900), reserve: minor(22000), pending: false, totals: { paid: minor(150000) } });
  });

  it('does not treat sent, failed, returned or unknown outcomes as confirmed paid', () => {
    const statuses: PayoutRecord['status'][] = ['Queued', 'Processing', 'Sent', 'Paid', 'Failed', 'Returned', 'Outcome unknown'];
    const records: PayoutRecord[] = statuses.map((status, i) => ({ id: String(i), kind: 'Payout', status, amount: minor(100), basis: 'Sample', destination: 'Not supplied', source: 'Sample Finance' }));
    expect(payoutTotals(records)).toEqual({ inProgress: minor(300), inProgressCount: 3, paid: minor(100), paidCount: 1, attentionCount: 3 });
  });

  it('leaves unavailable, missing and partial values distinct from zero', async () => {
    const { context, source, view } = setup(), snapshot = await source.load(context);
    for (const scenario of ['unknown', 'offline', 'error'] as const) {
      const c = { ...context, scenario }, data = payoutData(c, snapshot);
      expect(data).toMatchObject({ available: false, eligible: null, reserve: null, records: [] });
      expect(sampleCsv(c, view, snapshot, 'Payouts', '', 'All')).not.toContain('KES 150,000');
    }
    expect(payoutData({ ...context, scenario: 'empty' }, snapshot)).toMatchObject({ empty: true, records: [], eligible: null });
    const partial = payoutData({ ...context, scenario: 'partial' }, snapshot);
    expect(partial).toMatchObject({ incomplete: true, eligible: null, reserve: null, totals: { paid: minor(150000) } });
    expect(partial.records[0]).toMatchObject({ status: 'Coverage incomplete', amount: null });
  });

  it('requires an explicit example source and supports that source for all registered specialties', async () => {
    expect(profiles).toHaveLength(141);
    for (const profile of profiles) {
      const { context, source } = setup(profile.id);
      let snapshot = await source.load(context);
      if (profile.id !== 'restaurant') {
        expect(snapshot.features.payouts).toBe(false);
        expect(payoutData(context, snapshot).records).toEqual([]);
        snapshot = await source.configure(context, { ...snapshot.features, payouts: true }, snapshot.revision);
      }
      expect(payoutData(context, snapshot)).toMatchObject({ enabled: true, eligible: minor(30000), totals: { paid: minor(150000) } });
    }
  });
});
