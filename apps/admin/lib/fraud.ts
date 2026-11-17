/**
 * Fraud checks, as the console shows them. The checks run in the database
 * (supabase/migrations/20270105000100_fraud_checks.sql) and raise flags into
 * one queue; this file names things, sorts them and turns a flag's facts
 * into rows a person can read.
 */
import type { Tone } from './portal';

export type Subject = 'rider' | 'customer' | 'merchant' | 'staff' | 'payment' | 'expense';
export type Severity = 'high' | 'medium' | 'low';
export type FlagStatus = 'open' | 'confirmed' | 'dismissed';

export interface FraudRule {
  kind: string;
  subject_type: Subject;
  label: string;
  description: string | null;
  severity: Severity;
  enabled: boolean;
  /** False for a rule people apply by hand: no check raises it. */
  automated: boolean;
  params: Record<string, number>;
  sort: number;
  updated_at: string | null;
  updated_by: string | null;
  open: number;
  last_found_at: string | null;
}

export interface FraudFlag {
  id: string;
  kind: string;
  rule_label: string | null;
  subject_type: Subject;
  subject_id: string | null;
  subject_label: string | null;
  summary: string | null;
  severity: Severity;
  details: Record<string, unknown>;
  order_reference: string | null;
  rider_id: string | null;
  amount_cents: number | null;
  status: FlagStatus;
  detected_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  /** The signed-in person may confirm or dismiss it. */
  may_review: boolean;
}

export interface FraudRun {
  at: string | null;
  duration_ms: number | null;
  raised: Record<string, number>;
  errors: Record<string, string>;
}

export interface FraudOverview {
  /** Finance sees every flag; rider ops see the riders they work. */
  scope: 'all' | 'riders';
  can_change_rules: boolean;
  days: number;
  last_run: FraudRun | null;
  rules: FraudRule[];
  flags: FraudFlag[];
}

export const SUBJECTS: Record<Subject, { label: string; plural: string }> = {
  payment: { label: 'Payment', plural: 'Payments' },
  rider: { label: 'Rider', plural: 'Riders' },
  customer: { label: 'Customer', plural: 'Customers' },
  staff: { label: 'Staff', plural: 'Staff' },
  expense: { label: 'Office expense', plural: 'Office expenses' },
  merchant: { label: 'Merchant', plural: 'Merchants' },
};

export const SUBJECT_ORDER = Object.keys(SUBJECTS) as Subject[];

export function isSubject(value: string | null | undefined): value is Subject {
  return value != null && value in SUBJECTS;
}

export const SEVERITY: Record<Severity, { label: string; tone: Tone; rank: number }> = {
  high: { label: 'High', tone: 'red', rank: 0 },
  medium: { label: 'Medium', tone: 'amber', rank: 1 },
  low: { label: 'Low', tone: 'grey', rank: 2 },
};

export const FLAG_STATUS: Record<FlagStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'red' },
  dismissed: { label: 'Dismissed', tone: 'grey' },
};

/** What each limit of a rule means, for the rules list and its edit form. */
export const LIMITS: Record<string, { label: string; unit: string }> = {
  km: { label: 'Distance', unit: 'km' },
  seconds: { label: 'Within', unit: 'seconds' },
  metres: { label: 'Distance from the pin', unit: 'm' },
  fix_minutes: { label: 'Position taken within', unit: 'min of delivery' },
  minutes: { label: 'Delivered within', unit: 'min of pickup' },
  min_km: { label: 'On trips longer than', unit: 'km' },
  grace_minutes: { label: 'Wait for the money', unit: 'min' },
  times: { label: 'Times', unit: '' },
  days: { label: 'Within', unit: 'days' },
  refunds: { label: 'Refunds', unit: '' },
};

export function limitLabel(key: string): { label: string; unit: string } {
  return LIMITS[key] ?? { label: key.replace(/_/g, ' '), unit: '' };
}

/** How often or how far first, then over what time: "Times 3 · Within 7 days". */
const LIMIT_ORDER = Object.keys(LIMITS).sort((a, b) => {
  const rank = (k: string) => ['times', 'refunds', 'km', 'metres', 'minutes', 'min_km'].indexOf(k);
  const ra = rank(a);
  const rb = rank(b);
  return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
});

export function orderedLimits(params: Record<string, number>): [string, number][] {
  const at = (k: string) => {
    const i = LIMIT_ORDER.indexOf(k);
    return i < 0 ? LIMIT_ORDER.length : i;
  };
  return Object.entries(params).sort(([a], [b]) => at(a) - at(b) || a.localeCompare(b));
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The overview as the database sends it, with numbers made numbers. */
export function parseOverview(data: unknown): FraudOverview {
  const o = (data ?? {}) as Partial<FraudOverview>;
  return {
    scope: o.scope === 'riders' ? 'riders' : 'all',
    can_change_rules: o.can_change_rules === true,
    days: num(o.days) || 90,
    last_run: o.last_run
      ? {
          at: o.last_run.at ?? null,
          duration_ms: o.last_run.duration_ms == null ? null : num(o.last_run.duration_ms),
          raised: o.last_run.raised ?? {},
          errors: o.last_run.errors ?? {},
        }
      : null,
    rules: (o.rules ?? []).map((r) => ({
      ...r,
      params: Object.fromEntries(Object.entries(r.params ?? {}).map(([k, v]) => [k, num(v)])),
      open: num(r.open),
      sort: num(r.sort),
    })),
    flags: (o.flags ?? []).map((f) => ({
      ...f,
      details: f.details ?? {},
      amount_cents: f.amount_cents == null ? null : num(f.amount_cents),
      may_review: f.may_review === true,
    })),
  };
}

const DAY = 86_400_000;

export interface FlagCounts {
  open: number;
  openHigh: number;
  confirmed30: number;
  dismissed30: number;
  /** Open flags per subject. */
  bySubject: Partial<Record<Subject, number>>;
  /** Open flags this person may review. */
  forMe: number;
}

export function countFlags(flags: FraudFlag[], now = Date.now()): FlagCounts {
  const since = now - 30 * DAY;
  const c: FlagCounts = {
    open: 0,
    openHigh: 0,
    confirmed30: 0,
    dismissed30: 0,
    bySubject: {},
    forMe: 0,
  };
  for (const f of flags) {
    if (f.status === 'open') {
      c.open += 1;
      if (f.severity === 'high') c.openHigh += 1;
      if (f.may_review) c.forMe += 1;
      c.bySubject[f.subject_type] = (c.bySubject[f.subject_type] ?? 0) + 1;
    } else if (f.reviewed_at && Date.parse(f.reviewed_at) >= since) {
      if (f.status === 'confirmed') c.confirmed30 += 1;
      else c.dismissed30 += 1;
    }
  }
  return c;
}

/** "just now", "4 min ago", "3 h ago", then the date in Nairobi. */
export function sinceLabel(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

/** Open flags worst first, then newest; reviewed ones newest decision first. */
export function sortFlags(flags: FraudFlag[]): FraudFlag[] {
  return [...flags].sort((a, b) => {
    if (a.status === 'open' && b.status === 'open') {
      const s = SEVERITY[a.severity].rank - SEVERITY[b.severity].rank;
      if (s !== 0) return s;
      return Date.parse(b.detected_at) - Date.parse(a.detected_at);
    }
    const at = Date.parse(a.reviewed_at ?? a.detected_at);
    const bt = Date.parse(b.reviewed_at ?? b.detected_at);
    return bt - at;
  });
}

/** Where to go to look at what a flag is about. */
export function subjectLink(flag: FraudFlag): { href: string; label: string } | null {
  if (flag.subject_type === 'rider' && flag.rider_id) {
    return { href: `/riders/${flag.rider_id}`, label: 'Open the rider' };
  }
  if (flag.order_reference) {
    return {
      href: `/orders?chip=all&q=${encodeURIComponent(flag.order_reference)}`,
      label: `Open order ${flag.order_reference}`,
    };
  }
  if (flag.subject_type === 'staff' && flag.subject_id) {
    return { href: `/staff?person=${flag.subject_id}`, label: 'Open their staff record' };
  }
  if (flag.subject_type === 'expense') {
    return { href: '/finance/office?tab=expenses', label: 'Open Office finance' };
  }
  if (flag.subject_type === 'payment') {
    return { href: '/finance/transactions', label: 'Open Transactions' };
  }
  return null;
}

/* ───────────────────────────────────────────────────── a flag's facts */

export type Fact =
  | { kind: 'text'; label: string; value: string }
  | { kind: 'money'; label: string; cents: number }
  | { kind: 'time'; label: string; iso: string }
  | { kind: 'list'; label: string; items: { title: string; sub: string[] }[] };

const FACT_LABELS: Record<string, string> = {
  code: 'M-Pesa code',
  typed: 'What was typed',
  label: 'Record',
  reference: 'Order',
  expense: 'Expense',
  earlier: 'Earlier expense',
  same_file: 'Same stored file',
  days_apart: 'Days apart',
  staff: 'Staff member',
  rider: 'Rider',
  reason: 'Reason given',
  km: 'Distance',
  seconds: 'Seconds',
  metres: 'Metres from the pin',
  trip_km: 'Trip length',
  payment_method: 'Payment method',
  payment_status: 'Payment status',
  phone: 'Phone (hashed)',
  days: 'Window (days)',
};

const MONEY_KEYS = new Set(['amount_cents', 'total_cents']);
const TIME_KEYS = new Set([
  'at',
  'from_at',
  'to_at',
  'picked_up_at',
  'delivered_at',
  'position_at',
  'decided_at',
]);
const TIME_LABELS: Record<string, string> = {
  at: 'When',
  from_at: 'First position',
  to_at: 'Next position',
  picked_up_at: 'Picked up',
  delivered_at: 'Marked delivered',
  position_at: 'Rider position taken',
  decided_at: 'Approved',
};
/** Internal ids say nothing to a person. */
const HIDDEN_KEYS = new Set(['id', 'order_id', 'source']);

const LIST_LABELS: Record<string, string> = {
  records: 'Where the code appears',
  orders: 'Orders',
  refunds: 'Refunds',
  jobs: 'Jobs moved off',
  other_riders: 'Other accounts on the phone',
};

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function listItem(entry: unknown, money: (c: number) => string, time: (iso: string) => string) {
  const e = (entry ?? {}) as Record<string, unknown>;
  const title = String(e.label ?? e.reference ?? e.name ?? e.id ?? '—');
  const sub: string[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (v == null || k === 'label' || k === 'reference' || k === 'name' || HIDDEN_KEYS.has(k)) {
      continue;
    }
    if (MONEY_KEYS.has(k)) sub.push(money(num(v)));
    else if (TIME_KEYS.has(k) && typeof v === 'string') sub.push(time(v));
    else if (k === 'reason') sub.push(String(v).replace(/_/g, ' '));
  }
  return { title, sub };
}

/**
 * A flag's details as label and value pairs: money in shillings, times in
 * Nairobi, lists of records as lists. Unknown keys still show, humanised.
 */
export function factsOf(
  details: Record<string, unknown>,
  format: { money: (cents: number) => string; time: (iso: string) => string },
): Fact[] {
  const facts: Fact[] = [];
  for (const [key, value] of Object.entries(details ?? {})) {
    if (value == null || HIDDEN_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      facts.push({
        kind: 'list',
        label: LIST_LABELS[key] ?? humanize(key),
        items: value.map((v) => listItem(v, format.money, format.time)),
      });
    } else if (MONEY_KEYS.has(key)) {
      facts.push({
        kind: 'money',
        label: key === 'total_cents' ? 'Order total' : 'Amount',
        cents: num(value),
      });
    } else if (TIME_KEYS.has(key) && typeof value === 'string') {
      facts.push({ kind: 'time', label: TIME_LABELS[key] ?? humanize(key), iso: value });
    } else if (typeof value === 'boolean') {
      facts.push({
        kind: 'text',
        label: FACT_LABELS[key] ?? humanize(key),
        value: value ? 'Yes' : 'No',
      });
    } else if (typeof value !== 'object') {
      const text = String(value);
      facts.push({
        kind: 'text',
        label: FACT_LABELS[key] ?? humanize(key),
        value:
          key === 'payment_method' || key === 'payment_status' ? text.replace(/_/g, ' ') : text,
      });
    }
  }
  return facts;
}
