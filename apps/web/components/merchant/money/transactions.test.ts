import { SUBCATEGORY_VARIANTS } from '@nexg/booking-config/variants';

/** The audited 128 specialties plus the subcategory variants. */
const PROFILE_COUNT = 128 + SUBCATEGORY_VARIANTS.length;

import { describe, expect, it } from 'vitest';
import { profiles, seedCatalogue } from '../offerings/model';
import {
  matchesTransaction,
  minor,
  resolveMoneyView,
  transactionRecords,
  transactionStats,
  workLabel,
  type Context,
} from './model';
import { localMoneySource } from './source';
import { sampleCsv } from './export';

function setup() {
  const profile = profiles.find((p) => p.id === 'restaurant')!;
  const offering = seedCatalogue(profile).offerings[0]!;
  const context: Context = {
    profile,
    offering,
    location: 'Westlands',
    method: 'Customer collection',
    role: 'manager',
    scenario: 'current',
  };
  const map = new Map<string, string>();
  const source = localMoneySource({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  });
  return { context, source, view: resolveMoneyView(profile, offering, [offering.schemaId]) };
}
describe('transaction-specific summaries', () => {
  it('uses the selected workflow for transaction vocabulary across all registered specialties', () => {
    const examples = profiles.map((profile) => {
      const offering = seedCatalogue(profile).offerings[0]!,
        view = resolveMoneyView(profile, offering, [offering.schemaId]);
      const { context, source } = setup();
      const adapted = { ...context, profile, offering };
      return source.load(adapted).then((snapshot) => ({
        id: profile.id,
        label: workLabel(view.modelId),
        work: transactionRecords(view, snapshot)[0]!.work,
      }));
    });
    return Promise.all(examples).then((results) => {
      expect(results).toHaveLength(PROFILE_COUNT);
      expect(results.every((entry) => entry.work === `${entry.label} #4612`)).toBe(true);
      expect(results.find((entry) => entry.id === 'airport_pickup')?.work).toBe('Trip #4612');
      expect(results.find((entry) => entry.id === 'gym')?.work).toBe('Membership #4612');
      expect(results.find((entry) => entry.id === 'restaurant')?.work).toBe('Order #4612');
    });
  });
  it('counts confirmed payments, refunds and posted fees from the selected period', async () => {
    const { context, source, view } = setup(),
      snapshot = await source.load(context),
      records = transactionRecords(view, snapshot);
    expect(transactionStats(records)).toEqual({
      total: 36,
      paidCount: 30,
      paidAmount: minor(200000),
      refundCount: 4,
      refundAmount: minor(10000),
      feeCount: 2,
      attentionCount: 0,
      attentionAmount: 0,
    });
    expect(transactionStats(records.filter((record) => record.date === '2026-11-03'))).toEqual({
      total: 6,
      paidCount: 4,
      paidAmount: minor(64600),
      refundCount: 1,
      refundAmount: minor(4000),
      feeCount: 1,
      attentionCount: 0,
      attentionAmount: 0,
    });
  });
  it('applies the same method and text filters to counts, records and export', async () => {
    const { context, source, view } = setup(),
      snapshot = await source.load(context),
      records = transactionRecords(view, snapshot);
    const matching = records.filter((record) => matchesTransaction(record, '', 'M-Pesa'));
    expect(transactionStats(matching)).toEqual({
      total: 17,
      paidCount: 15,
      paidAmount: minor(102000),
      refundCount: 2,
      refundAmount: minor(4000),
      feeCount: 0,
      attentionCount: 0,
      attentionAmount: 0,
    });
    expect(
      records
        .filter((record) => matchesTransaction(record, '3 Nov', 'Card'))
        .map((record) => record.id),
    ).toEqual(['TX-6113', 'TX-6115', 'TX-6117']);
    const csv = sampleCsv(context, view, snapshot, 'Transactions', '', 'M-Pesa');
    expect(csv).toContain('TX-6112');
    expect(csv).not.toContain('TX-6113');
    expect(csv).toContain('M-Pesa');
  });
  it('keeps unknown and rejected refund requests out of confirmed refund totals', async () => {
    const { context, source, view } = setup(),
      initial = await source.load(context);
    const draft = await source.saveDraft(
      context,
      {
        id: 'OP-test',
        kind: 'sale',
        recordId: 'TX-6112',
        amount: minor(100),
        reason: 'Sample refund',
      },
      initial.revision,
    );
    const unknown = await source.submitRefund(context, 'OP-test', 'unknown', draft.revision);
    const unknownRecords = transactionRecords(view, unknown);
    expect(unknownRecords.find((record) => record.id === 'OP-test')).toMatchObject({
      status: 'Outcome unknown',
      originalReference: 'TX-6112',
      method: 'M-Pesa',
    });
    expect(transactionStats(unknownRecords)).toMatchObject({
      total: 37,
      refundCount: 4,
      refundAmount: minor(10000),
      attentionCount: 1,
      attentionAmount: minor(100),
    });
    expect(sampleCsv(context, view, unknown, 'Transactions', 'OP-test', 'All')).toContain(
      'Requested KES 100',
    );
    const rejected = await source.reconcile(context, 'OP-test', 'rejected', unknown.revision);
    expect(
      transactionRecords(view, rejected).find((record) => record.id === 'OP-test')?.status,
    ).toBe('Rejected');
    expect(transactionStats(transactionRecords(view, rejected))).toMatchObject({
      refundCount: 4,
      refundAmount: minor(10000),
      attentionCount: 1,
    });
  });
});
