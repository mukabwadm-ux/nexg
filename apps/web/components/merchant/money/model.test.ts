import { describe, expect, it } from 'vitest';
import type { BookingModel } from '@nexg/booking-config/profiles';
import {
  availableSchemas,
  extendOfferingProfiles,
  profiles,
  seedCatalogue,
  type OfferingProfile,
} from '../offerings/model';
import { modelSchema } from '../offerings/schemas';
import {
  activitySummary,
  formatAmount,
  invoiceTotals,
  invoices,
  minor,
  parseMinor,
  policyFromChoices,
  remainingSecurity,
  reservationAmounts,
  resolveMoneyView,
  securityTotals,
  transactions,
  workflowCopy,
  type Context,
} from './model';
import { csvCell, localMoneySource, scopeKey, storageKey } from './source';
import { sampleCsv } from './export';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    map,
  };
}
function context(id: string, schema?: string): Context {
  const profile = profiles.find((p) => p.id === id)!;
  const offering = seedCatalogue(schema ? { ...profile, schema } : profile).offerings[0]!;
  return {
    profile,
    offering,
    location: 'Westlands',
    method: offering.fulfilmentMethods![0]!,
    role: 'manager',
    scenario: 'current',
  };
}
describe('adaptive Money views', () => {
  it('resolves every current specialty and each explicitly enabled candidate using its real workflow', () => {
    const resolutions = profiles.flatMap((profile) =>
      availableSchemas(profile).map((schema) => {
        const offering = seedCatalogue({ ...profile, schema }).offerings[0]!;
        const view = resolveMoneyView(profile, offering, [schema]);
        return { profile: profile.id, schema, model: view.modelId, workflow: view.workflowIds[0] };
      }),
    );
    expect(new Set(resolutions.map((r) => r.profile)).size).toBe(128);
    expect(new Set(resolutions.map((r) => r.schema)).size).toBe(18);
    expect(
      resolutions.find((r) => r.profile === 'restaurant' && r.schema === 'SPACE_RESERVATION_V1'),
    ).toEqual({
      profile: 'restaurant',
      schema: 'SPACE_RESERVATION_V1',
      model: 'SPACE_RESERVATION',
      workflow: 'WF_SPACE_RESERVATION_V1',
    });
    expect(
      resolutions.find((r) => r.profile === 'self_drive' && r.schema === 'RENTAL_ASSET_V1')
        ?.workflow,
    ).toBe('WF_RENTAL');
    const bindings = profiles.flatMap((profile) =>
      profile.models.map((model) => {
        const schema = modelSchema[model as BookingModel];
        const offering = seedCatalogue({ ...profile, schema }).offerings[0]!;
        return { model, resolved: resolveMoneyView(profile, offering, [schema]).modelId };
      }),
    );
    expect(bindings.length).toBe(193);
    expect(bindings.filter((binding) => binding.model !== binding.resolved)).toEqual([]);
  });
  it('does not activate a candidate without an enabled offering and accepts a registered future specialty', () => {
    const restaurant = context('restaurant', 'SPACE_RESERVATION_V1');
    expect(() =>
      resolveMoneyView(restaurant.profile, restaurant.offering, ['PRODUCT_CATALOG_V1']),
    ).toThrow('not enabled');
    const extension: OfferingProfile = {
      id: 'future_venue_sample',
      categoryId: 'future',
      name: 'Future venue',
      schema: 'SPACE_RESERVATION_V1',
      models: ['SPACE_RESERVATION'],
      attributes: [],
    };
    const added = extendOfferingProfiles([extension]).find((p) => p.id === extension.id)!;
    const offer = seedCatalogue(added).offerings[0]!;
    expect(resolveMoneyView(added, offer, ['SPACE_RESERVATION_V1']).workflowIds[0]).toBe(
      'WF_SPACE_RESERVATION_V1',
    );
    expect(() => extendOfferingProfiles([{ ...extension, schema: 'UNKNOWN_V1' }])).toThrow(
      'Register the new editor',
    );
  });
  it('uses relevant wording instead of treating reservations, quotations and subscriptions as ordinary product orders', () => {
    expect(workflowCopy('SPACE_RESERVATION_V1').reminder).toBe(
      'A minimum spend is charged only when posted.',
    );
    expect(workflowCopy('REQUEST_QUOTE_V1').reminder).toBe(
      'A quote is not itself an invoice, payment or revenue.',
    );
    expect(workflowCopy('MEMBERSHIP_PLAN_V1').reminder).toBe(
      'Cash received is not automatically earned revenue.',
    );
  });
  it('shows workflow-specific facts without treating a quote as a payment or mixing freight units', async () => {
    const quote = context('private_events'),
      freight = context('sea_freight'),
      member = context('gym');
    const source = localMoneySource(memoryStorage());
    expect(activitySummary(quote, await source.load(quote))).toEqual({
      title: 'Sample quote · Q-1049',
      facts: [
        ['Quote value', 'KES 15,000'],
        ['Status', 'Awaiting decision'],
        ['Invoice', 'Not issued'],
        ['Payment', 'Not recorded'],
      ],
      note: 'This sample quote is excluded from sales and customer debt.',
    });
    expect(activitySummary(freight, await source.load(freight)).facts[0]).toEqual([
      'Agreed rate unit',
      'kg',
    ]);
    expect(activitySummary(member, await source.load(member)).facts).toContainEqual([
      'Earned revenue',
      'Not supplied',
    ]);
  });
  it('formats exact amounts from currency metadata and rejects excess precision', () => {
    expect(parseMinor('500.05')).toBe(50005);
    expect(parseMinor('500.005')).toBeNull();
    expect(formatAmount(1234, { code: 'XYZ', minorUnit: 3 })).toBe('XYZ 1.234');
  });
  it('keeps issued invoices, applied payments, credits and the overdue subset distinct', () => {
    const c = context('tire_service');
    const view = resolveMoneyView(c.profile, c.offering, [c.offering.schemaId]);
    expect(invoiceTotals(invoices(view))).toEqual({
      invoiced: minor(180000),
      applied: minor(120000),
      credits: minor(10000),
      due: minor(50000),
      overdue: minor(12000),
    });
    const tx = transactions(
      resolveMoneyView(context('restaurant').profile, context('restaurant').offering, [
        'PRODUCT_CATALOG_V1',
      ]),
    );
    expect(tx.filter((r) => r.type === 'Sale').reduce((sum, r) => sum + r.amount, 0)).toBe(
      minor(200000),
    );
    expect(tx.filter((r) => r.type === 'Refund').reduce((sum, r) => sum + r.amount, 0)).toBe(
      -minor(10000),
    );
    expect(tx.length).toBe(36);
    const today = tx.filter((r) => r.date === '2026-11-03');
    expect(today.filter((r) => r.type === 'Sale').reduce((sum, r) => sum + r.amount, 0)).toBe(
      minor(64600),
    );
    expect(today.filter((r) => r.type === 'Refund').reduce((sum, r) => sum + r.amount, 0)).toBe(
      -minor(4000),
    );
    expect(today.filter((r) => r.type === 'Fee').reduce((sum, r) => sum + r.amount, 0)).toBe(
      -minor(1200),
    );
  });
});
describe('reservation policy and local source', () => {
  it('keeps advance, fee, guarantee and cancellation allocation separate', () => {
    const p = policyFromChoices({
      advance: true,
      bookingFee: true,
      guarantee: true,
      cancellationCharge: true,
      refundTerms: 'refundable',
      cancellation: 'customer',
    });
    expect(reservationAmounts(p)).toEqual({
      collected: minor(1600),
      posted: minor(300),
      chargePosted: minor(300),
      chargeOutstanding: 0,
      advanceRefunded: 0,
      bookingRefunded: 0,
      guaranteeRefunded: 0,
      remainingAdvance: minor(200),
      remainingBookingFee: minor(100),
      refundableGuarantee: minor(1000),
    });
    const noTerms = policyFromChoices({
      advance: false,
      bookingFee: true,
      guarantee: false,
      cancellationCharge: false,
      refundTerms: 'not-configured',
      cancellation: 'none',
    });
    expect(reservationAmounts(noTerms)).toEqual({
      collected: minor(100),
      posted: 0,
      chargePosted: 0,
      chargeOutstanding: 0,
      advanceRefunded: 0,
      bookingRefunded: 0,
      guaranteeRefunded: 0,
      remainingAdvance: 0,
      remainingBookingFee: minor(100),
      refundableGuarantee: 0,
    });
    expect(noTerms.refundTerms).toBe('not-configured');
  });
  it('does not impose customer cancellation charges for merchant cancellations', () => {
    const p = policyFromChoices({
      advance: true,
      bookingFee: false,
      guarantee: true,
      cancellationCharge: true,
      refundTerms: 'non-refundable',
      cancellation: 'merchant',
    });
    expect(p.cancellationCharge).toBe(minor(300));
    expect(reservationAmounts(p)).toEqual({
      collected: minor(1500),
      posted: 0,
      chargePosted: 0,
      chargeOutstanding: 0,
      advanceRefunded: 0,
      bookingRefunded: 0,
      guaranteeRefunded: 0,
      remainingAdvance: minor(500),
      remainingBookingFee: 0,
      refundableGuarantee: minor(1000),
    });
  });
  it('requires an explicit no-show and keeps booking fee and guarantee refund terms independent', async () => {
    const c = context('restaurant', 'SPACE_RESERVATION_V1'),
      source = localMoneySource(memoryStorage());
    const initial = await source.load(c);
    const policy = policyFromChoices({
      advance: true,
      bookingFee: true,
      guarantee: true,
      cancellationCharge: true,
      refundTerms: 'refundable',
      bookingFeeRefundTerms: 'non-refundable',
      cancellation: 'no_show',
    });
    const configured = await source.configure(
      c,
      { ...initial.features, reservation: true },
      initial.revision,
      policy,
    );
    expect(reservationAmounts(configured.policy!)).toMatchObject({
      chargePosted: minor(300),
      posted: minor(300),
      remainingAdvance: minor(200),
      refundableGuarantee: minor(1000),
    });
    await expect(
      source.saveDraft(
        c,
        {
          id: 'OP-fee',
          kind: 'booking',
          recordId: 'BK-1048:booking',
          amount: minor(100),
          reason: 'No-show',
        },
        configured.revision,
      ),
    ).rejects.toThrow('non-refundable');
    const draft = await source.saveDraft(
      c,
      {
        id: 'OP-guarantee',
        kind: 'guarantee',
        recordId: 'BK-1048:guarantee',
        amount: minor(1000),
        reason: 'Release security',
      },
      configured.revision,
    );
    const confirmed = await source.submitRefund(c, 'OP-guarantee', 'confirmed', draft.revision);
    expect(confirmed.operations.find((o) => o.id === 'OP-guarantee')).toMatchObject({
      kind: 'guarantee-refund',
      amount: minor(1000),
      result: 'confirmed',
    });
    expect(reservationAmounts(confirmed.policy!, 0, 0, minor(1000))).toMatchObject({
      remainingAdvance: minor(200),
      remainingBookingFee: minor(100),
      refundableGuarantee: 0,
    });
    const noTrigger = policyFromChoices({
      advance: true,
      bookingFee: false,
      guarantee: false,
      cancellationCharge: true,
      refundTerms: 'refundable',
      cancellation: 'none',
    });
    expect(reservationAmounts(noTrigger)).toMatchObject({
      chargePosted: 0,
      posted: 0,
      remainingAdvance: minor(500),
    });
  });
  it('keeps an unknown refund in the obligation and reconciles the same operation once', async () => {
    const c = context('self_drive'),
      source = localMoneySource(memoryStorage());
    const first = await source.load(c);
    expect(securityTotals(first.security)).toEqual({
      collected: minor(100000),
      refunded: minor(34000),
      allocated: minor(2000),
      recorded: minor(64000),
      unknown: minor(18000),
    });
    await expect(
      source.saveDraft(
        c,
        {
          id: 'OP-new',
          kind: 'security',
          recordId: 'SEC-2070',
          amount: minor(18000),
          reason: 'Return',
        },
        first.revision,
      ),
    ).rejects.toThrow('existing unknown refund');
    const confirmed = await source.reconcile(c, 'OP-6209', 'confirmed', first.revision);
    expect(remainingSecurity(confirmed.security[0]!)).toBe(0);
    expect(securityTotals(confirmed.security)).toEqual({
      collected: minor(100000),
      refunded: minor(52000),
      allocated: minor(2000),
      recorded: minor(46000),
      unknown: 0,
    });
    await expect(source.reconcile(c, 'OP-6209', 'confirmed', confirmed.revision)).rejects.toThrow(
      'already known',
    );
  });
  it('persists drafts, rejects stale edits and never duplicates the same refund', async () => {
    const c = context('self_drive'),
      source = localMoneySource(memoryStorage());
    const first = await source.load(c);
    const saved = await source.saveDraft(
      c,
      {
        id: 'OP-test',
        kind: 'security',
        recordId: 'SEC-2071',
        amount: minor(5000),
        reason: 'Customer refund',
      },
      first.revision,
    );
    expect((await source.load(c)).drafts[0]).toEqual({
      id: 'OP-test',
      kind: 'security',
      recordId: 'SEC-2071',
      amount: minor(5000),
      reason: 'Customer refund',
    });
    await expect(
      source.saveDraft(
        c,
        {
          id: 'OP-stale',
          kind: 'security',
          recordId: 'SEC-3180',
          amount: minor(1000),
          reason: 'Other',
        },
        first.revision,
      ),
    ).rejects.toThrow('changed in another view');
    const submitted = await source.submitRefund(c, 'OP-test', 'unknown', saved.revision);
    const repeated = await source.submitRefund(c, 'OP-test', 'unknown', saved.revision);
    expect(repeated.revision).toBe(submitted.revision);
    expect(repeated.operations.filter((o) => o.id === 'OP-test')).toHaveLength(1);
    await expect(
      source.saveDraft(
        c,
        {
          id: 'OP-next',
          kind: 'security',
          recordId: 'SEC-2071',
          amount: minor(1000),
          reason: 'Other',
        },
        submitted.revision,
      ),
    ).rejects.toThrow('existing unknown refund');
  });
  it('scopes data and refuses changes when sources or roles cannot support them', async () => {
    const storage = memoryStorage(),
      source = localMoneySource(storage),
      c = context('self_drive');
    const first = await source.load(c);
    await source.saveDraft(
      c,
      {
        id: 'OP-1',
        kind: 'security',
        recordId: 'SEC-2071',
        amount: minor(1000),
        reason: 'Example',
      },
      first.revision,
    );
    const another = { ...c, location: 'Kilimani' };
    expect(scopeKey(another)).not.toBe(scopeKey(c));
    expect((await source.load(another)).drafts).toEqual([]);
    await expect(source.configure({ ...c, role: 'viewer' }, first.features, 1)).rejects.toThrow(
      'cannot change',
    );
    await expect(
      source.configure({ ...c, scenario: 'offline' }, first.features, 1),
    ).rejects.toThrow('must be current');
  });
  it('exports only matching sample security records and guards spreadsheet formulas', async () => {
    const c = context('self_drive'),
      source = localMoneySource(memoryStorage()),
      snapshot = await source.load(c);
    const view = resolveMoneyView(c.profile, c.offering, [c.offering.schemaId]);
    const csv = sampleCsv(c, view, snapshot, 'Security', 'RNT-2070', 'All');
    expect(csv).toContain(
      '"RNT-2070","Toyota RAV4 · RAV4-01","KES 20,000","KES 2,000","KES 0","KES 18,000","Outcome unknown"',
    );
    expect(csv).not.toContain('BK-2071');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });
  it('reports unreadable or unsavable local samples without overwriting them', async () => {
    const c = context('self_drive'),
      storage = memoryStorage();
    storage.setItem(storageKey(c), '{bad-json');
    await expect(localMoneySource(storage).load(c)).rejects.toThrow('could not be read');
    expect(storage.getItem(storageKey(c))).toBe('{bad-json');
    const denied = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    const source = localMoneySource(denied),
      first = await source.load(c);
    await expect(
      source.saveDraft(
        c,
        {
          id: 'OP-storage',
          kind: 'security',
          recordId: 'SEC-2071',
          amount: minor(100),
          reason: 'Example',
        },
        first.revision,
      ),
    ).rejects.toThrow('could not save');
  });
  it('refunds only the unallocated advance under accepted refundable terms', async () => {
    const c = context('restaurant', 'SPACE_RESERVATION_V1'),
      source = localMoneySource(memoryStorage());
    const initial = await source.load(c);
    const policy = policyFromChoices({
      advance: true,
      bookingFee: true,
      guarantee: true,
      cancellationCharge: true,
      refundTerms: 'refundable',
      cancellation: 'customer',
    });
    const configured = await source.configure(
      c,
      { ...initial.features, reservation: true },
      initial.revision,
      policy,
    );
    await expect(
      source.saveDraft(
        c,
        {
          id: 'OP-too-much',
          kind: 'advance',
          recordId: 'BK-1048:advance',
          amount: minor(201),
          reason: 'Cancel',
        },
        configured.revision,
      ),
    ).rejects.toThrow('within the refundable');
    const draft = await source.saveDraft(
      c,
      {
        id: 'OP-advance',
        kind: 'advance',
        recordId: 'BK-1048:advance',
        amount: minor(200),
        reason: 'Cancel',
      },
      configured.revision,
    );
    const unknown = await source.submitRefund(c, 'OP-advance', 'unknown', draft.revision);
    await expect(
      source.saveDraft(
        c,
        {
          id: 'OP-again',
          kind: 'advance',
          recordId: 'BK-1048:advance',
          amount: minor(1),
          reason: 'Again',
        },
        unknown.revision,
      ),
    ).rejects.toThrow('existing unknown refund');
    const confirmed = await source.reconcile(c, 'OP-advance', 'confirmed', unknown.revision);
    const refunded = confirmed.operations
      .filter((o) => o.kind === 'advance-refund' && o.result === 'confirmed')
      .reduce((n, o) => n + o.amount, 0);
    expect(reservationAmounts(confirmed.policy!, refunded)).toMatchObject({
      collected: minor(1600),
      posted: minor(300),
      advanceRefunded: minor(200),
      remainingAdvance: 0,
      refundableGuarantee: minor(1000),
    });
  });
  it('does not invent refundable terms for an advance, while a separate sale can be reviewed', async () => {
    const c = context('restaurant', 'SPACE_RESERVATION_V1'),
      source = localMoneySource(memoryStorage());
    const initial = await source.load(c);
    const policy = policyFromChoices({
      advance: true,
      bookingFee: false,
      guarantee: false,
      cancellationCharge: false,
      refundTerms: 'not-configured',
      cancellation: 'customer',
    });
    const configured = await source.configure(
      c,
      { ...initial.features, reservation: true },
      initial.revision,
      policy,
    );
    await expect(
      source.saveDraft(
        c,
        {
          id: 'OP-advance',
          kind: 'advance',
          recordId: 'BK-1048:advance',
          amount: minor(100),
          reason: 'Cancel',
        },
        configured.revision,
      ),
    ).rejects.toThrow('terms are not configured');
    const sale = await source.saveDraft(
      c,
      { id: 'OP-sale', kind: 'sale', recordId: 'TX-6112', amount: minor(100), reason: 'Return' },
      configured.revision,
    );
    const unknown = await source.submitRefund(c, 'OP-sale', 'unknown', sale.revision);
    await expect(
      source.saveDraft(
        c,
        { id: 'OP-sale-2', kind: 'sale', recordId: 'TX-6112', amount: minor(1), reason: 'Retry' },
        unknown.revision,
      ),
    ).rejects.toThrow('existing unknown refund');
    await expect(source.refreshStatement(c, unknown.revision)).rejects.toThrow(
      'Check unknown sale refund',
    );
    const confirmed = await source.reconcile(c, 'OP-sale', 'confirmed', unknown.revision);
    expect(confirmed.operations.find((o) => o.id === 'OP-sale')).toMatchObject({
      kind: 'sale-refund',
      amount: minor(100),
      result: 'confirmed',
    });
    const refreshed = await source.refreshStatement(c, confirmed.revision);
    expect(refreshed.statement).toEqual({
      gross: minor(200000),
      refunds: minor(10100),
      fees: minor(8000),
      netCollections: minor(189900),
      netPayable: minor(181900),
      eligible: minor(29900),
      today: {
        gross: minor(64600),
        refunds: minor(4100),
        fees: minor(1200),
        netCollections: minor(60500),
        netPayable: minor(59300),
      },
      reflectedOperations: ['OP-sale'],
    });
    await expect(source.refreshStatement(c, refreshed.revision)).rejects.toThrow('already current');
  });
});
