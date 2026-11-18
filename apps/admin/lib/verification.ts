import type { ReviewDocument } from '@/components/document-review';
import type { ChipTone } from '@/components/portal/dash';

/**
 * Merchants → Verification: the shapes rpc_merchant_verification_* return,
 * and the parts of the review pane that are worked out from them (the
 * progress line and the checks). Pure, so it is tested on its own.
 */

export type VerificationTab = 'all' | 'under_review' | 'pending' | 'resubmission';

export const VERIFICATION_TABS: { key: VerificationTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'pending', label: 'Pending' },
  { key: 'resubmission', label: 'Resubmission' },
];

export function isVerificationTab(value: unknown): value is VerificationTab {
  return VERIFICATION_TABS.some((t) => t.key === value);
}

export type DetailPane = 'documents' | 'details' | 'compliance' | 'activity';

export function isDetailPane(value: unknown): value is DetailPane {
  return (
    value === 'documents' || value === 'details' || value === 'compliance' || value === 'activity'
  );
}

const STATE_CHIP: Record<string, { label: string; tone: ChipTone }> = {
  under_review: { label: 'Under Review', tone: 'amber' },
  pending: { label: 'Pending', tone: 'grey' },
  resubmission: { label: 'Resubmission', tone: 'red' },
  live: { label: 'Live', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  paused: { label: 'Paused', tone: 'grey' },
  delisted: { label: 'Delisted', tone: 'grey' },
};

export function stateChip(state: string): { label: string; tone: ChipTone } {
  return STATE_CHIP[state] ?? { label: state.replace(/_/g, ' '), tone: 'grey' };
}

export interface VerificationOverview {
  kpis: {
    queue: number | null;
    under_review: number | null;
    verified_month: number | null;
    rejected: number | null;
    avg_hours: number | null;
  };
  tabs: Record<VerificationTab, number | null>;
  categories: { key: string; label: string }[];
}

export interface VerificationRow {
  merchant_id: string;
  reference: string;
  name: string;
  category_key: string;
  category_label: string;
  photo_path: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  state: string;
  managed: boolean;
  review_state: string | null;
  submitted_at: string | null;
}

export interface VerificationDetail {
  id: string;
  reference: string;
  name: string;
  trading_name: string | null;
  legal_name: string | null;
  category_key: string;
  category_label: string;
  subcategory: string | null;
  photo_path: string | null;
  area: string | null;
  city: string | null;
  contact_name: string | null;
  phone: string | null;
  phone_verified: boolean;
  email: string | null;
  kra_pin: string | null;
  status: string;
  status_reason: string | null;
  state: string;
  created_at: string | null;
  submitted_at: string | null;
  went_live_at: string | null;
  onboarding_source: string | null;
  branch: { name: string | null; address: string | null; zone: string | null } | null;
  branches: number;
  application: {
    review_state: string;
    revision: number;
    submitted_revision: number | null;
    submitted_at: string | null;
    review_reason: string | null;
    reviewed_at: string | null;
    reviewer: string | null;
    can_review: boolean;
  } | null;
  banking: { rail: string | null; provided: boolean; matched: boolean | null };
  duplicates: { id: string; name: string; status: string; match: string }[];
  notes: { at: string; by: string | null; outcome: string | null; notes: string }[];
  activity: { at: string; who: string | null; action: string; reason: string | null }[];
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parseVerificationOverview(data: unknown): VerificationOverview {
  const o = obj(data);
  const k = obj(o.kpis);
  const t = obj(o.tabs);
  return {
    kpis: {
      queue: num(k.queue),
      under_review: num(k.under_review),
      verified_month: num(k.verified_month),
      rejected: num(k.rejected),
      avg_hours: num(k.avg_hours),
    },
    tabs: {
      all: num(t.all),
      under_review: num(t.under_review),
      pending: num(t.pending),
      resubmission: num(t.resubmission),
    },
    categories: arr(o.categories)
      .map((c) => ({ key: str(obj(c).key) ?? '', label: str(obj(c).label) ?? '' }))
      .filter((c) => c.key),
  };
}

export function parseVerificationList(data: unknown): { total: number; rows: VerificationRow[] } {
  const o = obj(data);
  return {
    total: num(o.total) ?? 0,
    rows: arr(o.rows).map((raw) => {
      const r = obj(raw);
      return {
        merchant_id: str(r.merchant_id) ?? '',
        reference: str(r.reference) ?? '',
        name: str(r.name) ?? 'Unnamed merchant',
        category_key: str(r.category_key) ?? 'other',
        category_label: str(r.category_label) ?? 'Other',
        photo_path: str(r.photo_path),
        area: str(r.area),
        phone: str(r.phone),
        email: str(r.email),
        status: str(r.status) ?? '',
        state: str(r.state) ?? 'pending',
        managed: r.managed === true,
        review_state: str(r.review_state),
        submitted_at: str(r.submitted_at),
      };
    }),
  };
}

export function parseVerificationDetail(data: unknown): VerificationDetail | null {
  const d = obj(data);
  if (!str(d.id)) return null;
  const app = d.application ? obj(d.application) : null;
  const bank = obj(d.banking);
  const branch = d.branch ? obj(d.branch) : null;
  return {
    id: str(d.id)!,
    reference: str(d.reference) ?? '',
    name: str(d.name) ?? 'Unnamed merchant',
    trading_name: str(d.trading_name),
    legal_name: str(d.legal_name),
    category_key: str(d.category_key) ?? 'other',
    category_label: str(d.category_label) ?? 'Other',
    subcategory: str(d.subcategory),
    photo_path: str(d.photo_path),
    area: str(d.area),
    city: str(d.city),
    contact_name: str(d.contact_name),
    phone: str(d.phone),
    phone_verified: d.phone_verified === true,
    email: str(d.email),
    kra_pin: str(d.kra_pin),
    status: str(d.status) ?? '',
    status_reason: str(d.status_reason),
    state: str(d.state) ?? 'pending',
    created_at: str(d.created_at),
    submitted_at: str(d.submitted_at),
    went_live_at: str(d.went_live_at),
    onboarding_source: str(d.onboarding_source),
    branch: branch
      ? { name: str(branch.name), address: str(branch.address), zone: str(branch.zone) }
      : null,
    branches: num(d.branches) ?? 0,
    application: app
      ? {
          review_state: str(app.review_state) ?? 'draft',
          revision: num(app.revision) ?? 1,
          submitted_revision: num(app.submitted_revision),
          submitted_at: str(app.submitted_at),
          review_reason: str(app.review_reason),
          reviewed_at: str(app.reviewed_at),
          reviewer: str(app.reviewer),
          can_review: app.can_review === true,
        }
      : null,
    banking: {
      rail: str(bank.rail),
      provided: bank.provided === true,
      matched: typeof bank.matched === 'boolean' ? bank.matched : null,
    },
    duplicates: arr(d.duplicates).map((raw) => {
      const x = obj(raw);
      return {
        id: str(x.id) ?? '',
        name: str(x.name) ?? 'Unnamed merchant',
        status: str(x.status) ?? '',
        match: str(x.match) ?? '',
      };
    }),
    notes: arr(d.notes).map((raw) => {
      const x = obj(raw);
      return {
        at: str(x.at) ?? '',
        by: str(x.by),
        outcome: str(x.outcome),
        notes: str(x.notes) ?? '',
      };
    }),
    activity: arr(d.activity).map((raw) => {
      const x = obj(raw);
      return {
        at: str(x.at) ?? '',
        who: str(x.who),
        action: str(x.action) ?? '',
        reason: str(x.reason),
      };
    }),
  };
}

/* ─────────────────────────────────────────────── checks and progress */

export interface Check {
  key: string;
  label: string;
  /** true: passed; false: failed or missing; null: waiting on a person. */
  ok: boolean | null;
  text: string;
  tone: 'green' | 'amber' | 'red' | 'grey';
}

/** The kinds that are identity and tax checks rather than licences. */
const NOT_LICENCES = new Set(['kra_pin', 'owner_id', 'premises_photo']);

function docCheck(
  doc: ReviewDocument | undefined,
  missingText: string,
): Pick<Check, 'ok' | 'text' | 'tone'> {
  switch (doc?.status) {
    case 'verified':
      return { ok: true, text: 'Verified', tone: 'green' };
    case 'uploaded':
      return { ok: null, text: 'In review', tone: 'amber' };
    case 'rejected':
      return { ok: false, text: 'Rejected', tone: 'red' };
    case 'expired':
      return { ok: false, text: 'Expired', tone: 'red' };
    default:
      return { ok: false, text: missingText, tone: 'grey' };
  }
}

/**
 * The design's five checks, each from something real: the KRA PIN
 * certificate, the owner's ID, the required licences, the payout account
 * and a search for other merchants with the same KRA PIN, phone or email.
 * Banking can only be "Provided": nothing checks the account name yet.
 */
export function verificationChecks(docs: ReviewDocument[], detail: VerificationDetail): Check[] {
  const byKind = new Map(docs.map((d) => [d.kind, d]));
  const kra = docCheck(
    byKind.get('kra_pin'),
    detail.kra_pin ? 'PIN given, no certificate' : 'Not provided',
  );

  const licences = docs.filter((d) => d.required && !NOT_LICENCES.has(d.kind));
  let permits: Pick<Check, 'ok' | 'text' | 'tone'>;
  if (licences.length === 0) permits = { ok: null, text: 'None asked', tone: 'grey' };
  else if (licences.every((d) => d.status === 'verified'))
    permits = { ok: true, text: 'Verified', tone: 'green' };
  else if (licences.some((d) => d.status === 'rejected'))
    permits = { ok: false, text: 'Rejected', tone: 'red' };
  else if (licences.some((d) => d.status === 'expired'))
    permits = { ok: false, text: 'Expired', tone: 'red' };
  else if (licences.some((d) => d.status === 'missing')) {
    const n = licences.filter((d) => d.status === 'missing').length;
    permits = { ok: false, text: `${n} missing`, tone: 'grey' };
  } else permits = { ok: null, text: 'In review', tone: 'amber' };

  const banking: Pick<Check, 'ok' | 'text' | 'tone'> =
    detail.banking.matched === true
      ? { ok: true, text: 'Verified', tone: 'green' }
      : detail.banking.matched === false
        ? { ok: false, text: 'Name does not match', tone: 'red' }
        : detail.banking.provided
          ? { ok: null, text: 'Provided', tone: 'amber' }
          : { ok: false, text: 'Not provided', tone: 'grey' };

  const dupes = detail.duplicates.length;
  return [
    { key: 'kra', label: 'Business is valid (KRA)', ...kra },
    {
      key: 'owner',
      label: 'Owner identity (ID/Passport)',
      ...docCheck(byKind.get('owner_id'), 'Not provided'),
    },
    { key: 'permits', label: 'Business permit / licences', ...permits },
    { key: 'banking', label: 'Banking details', ...banking },
    {
      key: 'duplicates',
      label: 'Duplicate check',
      ok: dupes === 0,
      text: dupes === 0 ? 'No match' : `${dupes} ${dupes === 1 ? 'match' : 'matches'}`,
      tone: dupes === 0 ? 'green' : 'red',
    },
  ];
}

export interface Progress {
  label: string;
  note: string;
  state: 'done' | 'current' | 'todo';
}

/** Required documents, by what the merchant still owes. */
export function documentStanding(docs: ReviewDocument[]) {
  const required = docs.filter((d) => d.required);
  return {
    required: required.length,
    verified: required.filter((d) => d.status === 'verified').length,
    missing: required.filter((d) => d.status === 'missing').length,
    returned: required.filter((d) => d.status === 'rejected' || d.status === 'expired').length,
    onFile: docs.filter((d) => d.status !== 'missing').length,
    allVerified: required.every((d) => d.status === 'verified'),
  };
}

/** Application → Documents → Compliance → Final Decision, from what is on record. */
export function verificationProgress(
  docs: ReviewDocument[],
  detail: VerificationDetail,
  checks: Check[],
): Progress[] {
  const app = detail.application;
  const submitted = !app || app.review_state !== 'draft';
  const standing = documentStanding(docs);

  const application: Progress = submitted
    ? { label: 'Application', note: 'Completed', state: 'done' }
    : { label: 'Application', note: 'Not submitted', state: 'current' };

  const documents: Progress = !submitted
    ? { label: 'Documents', note: 'Pending', state: 'todo' }
    : standing.allVerified
      ? { label: 'Documents', note: 'Completed', state: 'done' }
      : standing.returned > 0
        ? { label: 'Documents', note: 'Resubmission', state: 'current' }
        : standing.missing > 0
          ? { label: 'Documents', note: 'Awaiting upload', state: 'current' }
          : { label: 'Documents', note: 'In Review', state: 'current' };

  const clean =
    checks.find((c) => c.key === 'duplicates')?.ok === true &&
    detail.banking.provided &&
    detail.branches > 0;
  const compliance: Progress =
    documents.state !== 'done'
      ? { label: 'Compliance', note: 'Pending', state: 'todo' }
      : clean
        ? { label: 'Compliance', note: 'Completed', state: 'done' }
        : { label: 'Compliance', note: 'Needs attention', state: 'current' };

  const decision: Progress =
    detail.status === 'live'
      ? { label: 'Final Decision', note: 'Approved', state: 'done' }
      : app?.review_state === 'rejected'
        ? { label: 'Final Decision', note: 'Rejected', state: 'current' }
        : app?.review_state === 'approved'
          ? { label: 'Final Decision', note: 'Approved, not live', state: 'current' }
          : app?.review_state === 'changes_requested'
            ? { label: 'Final Decision', note: 'Changes requested', state: 'current' }
            : compliance.state === 'done'
              ? { label: 'Final Decision', note: 'Ready', state: 'current' }
              : { label: 'Final Decision', note: 'Pending', state: 'todo' };

  return [application, documents, compliance, decision];
}

/** "7.4 hrs", or days once it passes two days. */
export function hoursLabel(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours >= 48)
    return `${(hours / 24).toLocaleString('en-KE', { maximumFractionDigits: 1 })} days`;
  return `${hours.toLocaleString('en-KE', { maximumFractionDigits: 1 })} hrs`;
}
