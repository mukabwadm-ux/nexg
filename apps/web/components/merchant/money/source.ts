import {
  defaultFeatures,
  initialStatement,
  isReservation,
  remainingSecurity,
  reservationAmounts,
  reservationSample,
  resolveMoneyView,
  securitySamples,
  supportsSecurity,
  transactions,
  type Context,
  type Features,
  type RefundDraft,
  type RefundKind,
  type ReservationPolicy,
  type SampleOperation,
  type Snapshot,
} from './model';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const scopeKey = (c: Context) =>
  JSON.stringify([c.profile.id, c.offering.id, c.location, c.method]);
export const storageKey = (c: Context) =>
  `nexg.money.preview.v1.${encodeURIComponent(scopeKey(c))}`;
const safeInt = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
function valid(s: Snapshot, c: Context) {
  return (
    s &&
    s.scope === scopeKey(c) &&
    safeInt(s.revision) &&
    safeInt(s.offeringVersion) &&
    s.features &&
    ['payouts', 'balances', 'security', 'reservation', 'refunds'].every(
      (k) => typeof s.features[k as keyof Features] === 'boolean',
    ) &&
    Array.isArray(s.security) &&
    s.security.every(
      (r) =>
        r &&
        typeof r.id === 'string' &&
        typeof r.work === 'string' &&
        typeof r.asset === 'string' &&
        typeof r.policyVersion === 'string' &&
        safeInt(r.collected) &&
        safeInt(r.allocation) &&
        safeInt(r.refunded) &&
        safeInt(r.refundRequested) &&
        r.allocation + r.refunded <= r.collected &&
        ['unknown', 'collected', 'refunded'].includes(r.state),
    ) &&
    Array.isArray(s.operations) &&
    s.operations.every(
      (o) =>
        o &&
        typeof o.id === 'string' &&
        typeof o.recordId === 'string' &&
        safeInt(o.amount) &&
        safeInt(o.revision) &&
        [
          'security-refund',
          'sale-refund',
          'advance-refund',
          'booking-refund',
          'guarantee-refund',
        ].includes(o.kind) &&
        ['unknown', 'confirmed', 'rejected'].includes(o.result),
    ) &&
    new Set(s.operations.map((o) => o.id)).size === s.operations.length &&
    s.security.every(
      (r) =>
        r.state !== 'unknown' ||
        (r.refundRequested > 0 &&
          r.refundRequested <= remainingSecurity(r) &&
          s.operations.some(
            (o) =>
              o.id === r.operationId &&
              o.recordId === r.id &&
              o.kind === 'security-refund' &&
              o.result === 'unknown' &&
              o.amount === r.refundRequested,
          )),
    ) &&
    Array.isArray(s.drafts) &&
    s.drafts.every(
      (d) =>
        d &&
        typeof d.id === 'string' &&
        ['security', 'sale', 'advance', 'booking', 'guarantee'].includes(d.kind) &&
        typeof d.recordId === 'string' &&
        safeInt(d.amount) &&
        typeof d.reason === 'string',
    ) &&
    Array.isArray(s.history) &&
    s.statement &&
    ['gross', 'refunds', 'fees', 'netCollections', 'netPayable', 'eligible'].every((key) =>
      safeInt(s.statement[key as keyof Omit<typeof s.statement, 'reflectedOperations' | 'today'>]),
    ) &&
    s.statement.today &&
    ['gross', 'refunds', 'fees', 'netCollections', 'netPayable'].every((key) =>
      safeInt(s.statement.today[key as keyof typeof s.statement.today]),
    ) &&
    Array.isArray(s.statement.reflectedOperations) &&
    s.statement.reflectedOperations.every((id) => typeof id === 'string') &&
    (s.policy === null ||
      (typeof s.policy?.acceptedVersion === 'string' &&
        safeInt(s.policy.advance) &&
        safeInt(s.policy.bookingFee) &&
        safeInt(s.policy.guarantee) &&
        safeInt(s.policy.cancellationCharge) &&
        safeInt(s.policy.allocatedAdvance) &&
        ['not-configured', 'refundable', 'non-refundable'].includes(s.policy.refundTerms) &&
        ['not-configured', 'refundable', 'non-refundable'].includes(
          s.policy.bookingFeeRefundTerms,
        ) &&
        ['customer', 'merchant', 'no_show', 'none'].includes(s.policy.cancellation) &&
        typeof s.policy.ownerPosted === 'boolean'))
  );
}
export function seedSnapshot(c: Context): Snapshot {
  const features = defaultFeatures(c);
  const security = features.security ? securitySamples(c) : [];
  const operation: SampleOperation[] = security.length
    ? [
        {
          id: 'OP-6209',
          kind: 'security-refund',
          recordId: 'SEC-2070',
          amount: security[0]!.refundRequested,
          result: 'unknown',
          revision: 0,
          note: 'Sample owner result has not been confirmed.',
        },
      ]
    : [];
  return {
    scope: scopeKey(c),
    revision: 0,
    offeringVersion: c.offering.version,
    features,
    security,
    operations: operation,
    drafts: [],
    policy: null,
    statement: initialStatement(),
    history: [],
  };
}
function canChange(c: Context) {
  if (c.role !== 'manager')
    throw new Error('This sample role can view but cannot change money records.');
  if (c.scenario !== 'current')
    throw new Error('The sample source must be current before a money action can be reviewed.');
  if (c.offering.sync !== 'current')
    throw new Error('Refresh the offering source before reviewing this action.');
}
function makeHistory(s: Snapshot, description: string) {
  s.history.unshift({ revision: s.revision, description, at: '3 Nov 2026 · 09:40 EAT' });
}
export function refundAvailability(
  c: Context,
  s: Snapshot,
  kind: RefundKind,
  recordId: string,
): { remaining: number; unknown: SampleOperation | undefined; reason: string } {
  if (!s.features.refunds)
    return {
      remaining: 0,
      unknown: undefined,
      reason: 'No refund source is enabled for this sample.',
    };
  const operationKind = `${kind}-refund`;
  const related = s.operations.filter((o) => o.kind === operationKind && o.recordId === recordId);
  const unknown = related.find((o) => o.result === 'unknown');
  const confirmed = related
    .filter((o) => o.result === 'confirmed')
    .reduce((sum, o) => sum + o.amount, 0);
  if (kind === 'security') {
    const r = s.security.find((x) => x.id === recordId);
    if (!s.features.security || !r)
      return { remaining: 0, unknown, reason: 'This security record is unavailable.' };
    return {
      remaining: remainingSecurity(r),
      unknown,
      reason:
        r.state === 'unknown' || unknown
          ? 'Check the existing unknown refund before another refund or credit.'
          : '',
    };
  }
  if (kind === 'sale') {
    const view = resolveMoneyView(c.profile, c.offering, [c.offering.schemaId]);
    const t = transactions(view).find(
      (x) => x.id === recordId && x.type === 'Sale' && x.status === 'Paid',
    );
    if (!t) return { remaining: 0, unknown, reason: 'This paid sale is unavailable for refund.' };
    return {
      remaining: Math.max(0, t.amount - confirmed),
      unknown,
      reason: unknown ? 'Check the existing unknown refund before another refund or credit.' : '',
    };
  }
  const policy = s.policy;
  if (recordId !== `BK-1048:${kind}` || !s.features.reservation || !policy)
    return { remaining: 0, unknown, reason: 'This reservation component is unavailable.' };
  const terms =
    kind === 'advance'
      ? policy.refundTerms
      : kind === 'booking'
        ? policy.bookingFeeRefundTerms
        : 'refundable';
  if (terms !== 'refundable')
    return {
      remaining: 0,
      unknown,
      reason:
        terms === 'not-configured'
          ? 'Refund eligibility is unknown because terms are not configured.'
          : 'The accepted terms for this component are non-refundable.',
    };
  if (policy.cancellation === 'none')
    return { remaining: 0, unknown, reason: 'No cancellation has been recorded in this sample.' };
  const remaining =
    kind === 'advance'
      ? reservationAmounts(policy, confirmed).remainingAdvance
      : kind === 'booking'
        ? policy.bookingFee - confirmed
        : policy.guarantee - confirmed;
  return {
    remaining,
    unknown,
    reason: unknown ? 'Check the existing unknown refund before another refund or credit.' : '',
  };
}
export interface MoneySource {
  load(c: Context): Promise<Snapshot>;
  configure(
    c: Context,
    features: Features,
    expected: number,
    acceptedPolicy?: ReservationPolicy,
  ): Promise<Snapshot>;
  saveDraft(c: Context, draft: RefundDraft, expected: number): Promise<Snapshot>;
  discardDraft(c: Context, id: string, expected: number): Promise<Snapshot>;
  submitRefund(
    c: Context,
    draftId: string,
    result: SampleOperation['result'],
    expected: number,
  ): Promise<Snapshot>;
  reconcile(
    c: Context,
    operationId: string,
    result: 'confirmed' | 'rejected',
    expected: number,
  ): Promise<Snapshot>;
  refreshStatement(c: Context, expected: number): Promise<Snapshot>;
  reset(c: Context): Promise<Snapshot>;
}
export function localMoneySource(storage: StorageLike): MoneySource {
  function read(c: Context): Snapshot {
    try {
      const raw = storage.getItem(storageKey(c));
      if (raw === null) return seedSnapshot(c);
      const s = JSON.parse(raw) as Snapshot;
      // Upgrade earlier local-only previews without altering accepted terms or records.
      if (s?.features && s.features.refunds === undefined) s.features.refunds = true;
      if (Array.isArray(s?.drafts))
        s.drafts.forEach((d) => {
          if (!d.kind) d.kind = 'security';
        });
      if (s?.policy && s.policy.bookingFeeRefundTerms === undefined)
        s.policy.bookingFeeRefundTerms = 'not-configured';
      if (s && !s.statement) s.statement = initialStatement();
      if (s?.statement && !s.statement.today) {
        const today = initialStatement().today;
        const reflected = s.operations
          .filter(
            (o) =>
              o.kind === 'sale-refund' &&
              o.result === 'confirmed' &&
              s.statement.reflectedOperations.includes(o.id),
          )
          .reduce((sum, o) => sum + o.amount, 0);
        if (reflected > today.netPayable || reflected > today.netCollections)
          throw new Error('The historical sample statement cannot be safely upgraded.');
        today.refunds += reflected;
        today.netCollections -= reflected;
        today.netPayable -= reflected;
        s.statement.today = today;
      }
      if (!valid(s, c)) throw new Error('Invalid sample');
      return s;
    } catch {
      throw new Error(
        'This Money sample could not be read. Restore the sample or clear this scope.',
      );
    }
  }
  function write(c: Context, s: Snapshot) {
    try {
      storage.setItem(storageKey(c), JSON.stringify(s));
    } catch {
      throw new Error('This browser could not save the sample. Your current input is still open.');
    }
  }
  function update(c: Context, expected: number, mutate: (s: Snapshot) => string): Snapshot {
    canChange(c);
    const s = read(c);
    if (s.revision !== expected)
      throw new Error(
        'This sample changed in another view. Reload and review again; your input is kept.',
      );
    if (s.offeringVersion !== c.offering.version)
      throw new Error(
        'The offering changed since this sample was reviewed. Reset the Money sample or review its current terms.',
      );
    const next = clone(s);
    const description = mutate(next);
    next.revision++;
    makeHistory(next, description);
    write(c, next);
    return next;
  }
  return {
    async load(c) {
      return clone(read(c));
    },
    async configure(c, f, expected, acceptedPolicy) {
      return update(c, expected, (s) => {
        if (f.security && !supportsSecurity(c.offering.schemaId))
          throw new Error('This sample offering does not have a security-resource workflow.');
        if (f.reservation && !isReservation(c.offering.schemaId))
          throw new Error('Reservation terms require an actual reservation-bearing activity.');
        if (!f.refunds && s.operations.some((o) => o.result === 'unknown'))
          throw new Error(
            'An unknown refund must remain available for checking before disabling the sample refund source.',
          );
        if (!f.security && s.security.some((r) => remainingSecurity(r) > 0))
          throw new Error(
            'Existing customer security must remain visible until its recorded obligation is settled.',
          );
        if (f.security && !s.features.security) {
          s.security = securitySamples(c);
          s.operations.push({
            id: 'OP-6209',
            kind: 'security-refund',
            recordId: 'SEC-2070',
            amount: s.security[0]!.refundRequested,
            result: 'unknown',
            revision: s.revision + 1,
            note: 'Sample owner result has not been confirmed.',
          });
        }
        if (f.reservation && !s.features.reservation) {
          const policy = acceptedPolicy ?? reservationSample();
          if (
            !policy.acceptedVersion ||
            !['not-configured', 'refundable', 'non-refundable'].includes(policy.refundTerms) ||
            !['not-configured', 'refundable', 'non-refundable'].includes(
              policy.bookingFeeRefundTerms,
            ) ||
            !['customer', 'merchant', 'no_show', 'none'].includes(policy.cancellation) ||
            ![
              policy.advance,
              policy.bookingFee,
              policy.guarantee,
              policy.cancellationCharge,
              policy.allocatedAdvance,
            ].every(safeInt)
          )
            throw new Error('The accepted sample policy is incomplete.');
          const triggered = policy.cancellation === 'customer' || policy.cancellation === 'no_show';
          if ((!triggered || !policy.ownerPosted) && policy.allocatedAdvance)
            throw new Error(
              'An allocation requires a confirmed customer trigger and posted source result.',
            );
          if (policy.ownerPosted && (!triggered || !policy.cancellationCharge))
            throw new Error(
              'A posted cancellation charge requires its confirmed trigger and accepted term.',
            );
          reservationAmounts(policy);
          s.policy = clone(policy);
        }
        if (!f.reservation && s.features.reservation)
          throw new Error(
            'An accepted sample policy remains attached to its historical reservation. Reset the sample to choose another example.',
          );
        s.features = clone(f);
        return 'Sample source capabilities updated';
      });
    },
    async saveDraft(c, draft, expected) {
      return update(c, expected, (s) => {
        const eligibility = refundAvailability(c, s, draft.kind, draft.recordId);
        if (eligibility.reason) throw new Error(eligibility.reason);
        if (!safeInt(draft.amount) || draft.amount < 1 || draft.amount > eligibility.remaining)
          throw new Error('Enter an amount within the refundable sample balance.');
        if (!draft.reason.trim()) throw new Error('Add a reason to review this sample refund.');
        s.drafts = [...s.drafts.filter((d) => d.id !== draft.id), clone(draft)];
        return `Refund draft saved for ${draft.recordId}`;
      });
    },
    async discardDraft(c, id, expected) {
      return update(c, expected, (s) => {
        s.drafts = s.drafts.filter((d) => d.id !== id);
        return 'Refund draft discarded';
      });
    },
    async submitRefund(c, draftId, result, expected) {
      // A known repeated operation is idempotent; it never makes a second movement.
      const current = read(c);
      const previous = current.operations.find((o) => o.id === draftId);
      if (previous) return clone(current);
      return update(c, expected, (s) => {
        const d = s.drafts.find((x) => x.id === draftId);
        if (!d) throw new Error('This refund draft is no longer available.');
        const eligibility = refundAvailability(c, s, d.kind, d.recordId);
        if (eligibility.reason || d.amount <= 0 || d.amount > eligibility.remaining)
          throw new Error(
            'This refund is no longer eligible. Reload and review its current obligation.',
          );
        if (!['unknown', 'confirmed', 'rejected'].includes(result))
          throw new Error('Choose a valid sample result.');
        const operationKind: SampleOperation['kind'] = `${d.kind}-refund`;
        s.operations.push({
          id: d.id,
          kind: operationKind,
          recordId: d.recordId,
          amount: d.amount,
          result,
          revision: s.revision + 1,
          note: d.reason,
        });
        s.drafts = s.drafts.filter((x) => x.id !== draftId);
        const r = d.kind === 'security' ? s.security.find((x) => x.id === d.recordId) : undefined;
        if (r) {
          r.operationId = d.id;
          r.refundRequested = result === 'unknown' ? d.amount : 0;
          if (result === 'confirmed') {
            r.refunded += d.amount;
            r.state = remainingSecurity(r) === 0 ? 'refunded' : 'collected';
          } else r.state = result === 'unknown' ? 'unknown' : 'collected';
        }
        return `Sample refund ${result} for ${d.recordId}`;
      });
    },
    async reconcile(c, operationId, result, expected) {
      return update(c, expected, (s) => {
        const op = s.operations.find((o) => o.id === operationId);
        if (!op || op.result !== 'unknown')
          throw new Error('This result is already known or the linked record has changed.');
        const kind = op.kind.replace('-refund', '') as RefundKind;
        const eligibility = refundAvailability(c, s, kind, op.recordId);
        if (eligibility.unknown?.id !== op.id || op.amount > eligibility.remaining)
          throw new Error(
            'The source amounts differ. Review the recorded obligation before reconciling.',
          );
        const r = kind === 'security' ? s.security.find((x) => x.id === op.recordId) : undefined;
        if (
          kind === 'security' &&
          (!r ||
            r.state !== 'unknown' ||
            r.operationId !== op.id ||
            op.amount !== r.refundRequested)
        )
          throw new Error(
            'The source amounts differ. Review the recorded obligation before reconciling.',
          );
        op.result = result;
        op.note = `Sample source ${result} the original operation.`;
        if (r) {
          if (result === 'confirmed') {
            r.refunded += op.amount;
            r.state = remainingSecurity(r) === 0 ? 'refunded' : 'collected';
          } else r.state = 'collected';
          r.refundRequested = 0;
        }
        return `Sample source ${result} refund ${op.id} for ${op.recordId}`;
      });
    },
    async refreshStatement(c, expected) {
      return update(c, expected, (s) => {
        if (s.operations.some((o) => o.kind === 'sale-refund' && o.result === 'unknown'))
          throw new Error(
            'Check unknown sale refund results before requesting a new sample statement.',
          );
        const unreflected = s.operations.filter(
          (o) =>
            o.kind === 'sale-refund' &&
            o.result === 'confirmed' &&
            !s.statement.reflectedOperations.includes(o.id),
        );
        if (!unreflected.length) throw new Error('The sample statement is already current.');
        const refund = unreflected.reduce((sum, o) => sum + o.amount, 0);
        // This is the explicitly defined local fixture owner's projection, not a general settlement rule.
        if (
          refund > s.statement.eligible ||
          refund > s.statement.netPayable ||
          refund > s.statement.netCollections ||
          refund > s.statement.today.netPayable ||
          refund > s.statement.today.netCollections
        )
          throw new Error(
            'The sample owner cannot project this combination. Review the source before continuing.',
          );
        s.statement.refunds += refund;
        s.statement.netCollections -= refund;
        s.statement.netPayable -= refund;
        s.statement.eligible -= refund;
        s.statement.today.refunds += refund;
        s.statement.today.netCollections -= refund;
        s.statement.today.netPayable -= refund;
        s.statement.reflectedOperations.push(...unreflected.map((o) => o.id));
        return 'Sample owner refreshed the statement and settlement';
      });
    },
    async reset(c) {
      try {
        storage.removeItem(storageKey(c));
      } catch {
        throw new Error('This browser could not clear the sample.');
      }
      return seedSnapshot(c);
    },
  };
}
export function moneyHref(c: Context, extra: Record<string, string> = {}) {
  return (
    '/merchant-live-preview/money?' +
    new URLSearchParams({
      profile: c.profile.id,
      offering: c.offering.id,
      location: c.location,
      method: c.method,
      scenario: c.scenario,
      role: c.role,
      ...extra,
    })
  );
}
export function offeringsHref(c: Context, state: Record<string, string> = {}) {
  return (
    '/merchant-live-preview/offerings?' +
    new URLSearchParams({
      profile: c.profile.id,
      offering: c.offering.id,
      returnTo: moneyHref(c, state),
    })
  );
}
export function workHref(c: Context, work: string, state: Record<string, string> = {}) {
  return (
    '/merchant-live-preview/work?' +
    new URLSearchParams({
      moneyProfile: c.profile.id,
      offering: c.offering.id,
      location: c.location,
      method: c.method,
      work,
      returnTo: moneyHref(c, state),
    })
  );
}
export function csvCell(value: string | number) {
  const str = String(value);
  const guarded = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${guarded.replaceAll('"', '""')}"`;
}
