/**
 * The Riders module screens (Overview, All Riders, Onboarding & KYC,
 * Availability & Zones, Orders & Deliveries, Earnings & Payouts,
 * Performance, Incidents & Disputes): the shapes the readers return
 * (20270321000200) and how their figures are written. Pure, so the pages
 * and their tests read the same rules.
 */

import { hrefWith, type Period } from './portal';

export const PAGE_SIZE = 10;

/** One rider as console_rider_facts returns them. */
export interface RiderFact {
  rider_id: string;
  name: string;
  phone: string;
  vehicle: string;
  plate_no: string | null;
  status: string;
  presence: string;
  bucket: 'online' | 'on_trip' | 'offline' | 'suspended' | 'offboarded' | 'onboarding';
  zone_id: string | null;
  zone_name: string | null;
  kyc: 'verified' | 'in_review' | 'rejected' | 'not_started';
  docs_required: number;
  docs_verified: number;
  rating_avg: number | null;
  rating_count: number;
  trips: number;
  trips_all: number;
  trips_today: number;
  timed: number;
  on_time: number;
  delivery_min: number | null;
  offers_answered: number;
  offers_accepted: number;
  accept_sec: number | null;
  cancelled: number;
  earned_kes: number;
  earned_all_kes: number;
  adjustments_kes: number;
  payout_state: string | null;
  payout_method: string | null;
  payout_paid_at: string | null;
  payable_cents: number;
  last_active: string | null;
  submitted_at: string | null;
  activated_at: string | null;
  created_at: string;
  background_check: string | null;
  on_time_pct: number | null;
  completion_pct: number | null;
  acceptance_pct: number | null;
  score: number | null;
  rn?: number;
  stage?: 'activated' | 'approved' | 'pending_review' | 'rejected';
}

export interface ZoneOption {
  id: string;
  name: string;
}

export interface Paged<T> {
  total: number;
  counts: Record<string, number>;
  rows: T[];
  zones?: ZoneOption[];
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function asMaybe(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function paged<T>(value: unknown): Paged<T> {
  const o = asObject(value);
  return {
    total: asNumber(o.total),
    counts: Object.fromEntries(
      Object.entries(asObject(o.counts)).map(([k, v]) => [k, asNumber(v)]),
    ),
    rows: Array.isArray(o.rows) ? (o.rows as T[]) : [],
    zones: Array.isArray(o.zones) ? (o.zones as ZoneOption[]) : [],
  };
}

/** A missing reader: the migration is not on this database yet. */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (error.code === 'PGRST202' ||
      error.code === '42883' ||
      /could not find the function/i.test(error.message ?? ''))
  );
}

/* ─────────────────────────────────────────────────────────────── figures */

export const n = (v: number | null | undefined) =>
  v == null ? '—' : Math.round(v).toLocaleString('en-KE');

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${v.toLocaleString('en-KE', { maximumFractionDigits: digits })}%`;

/** A share of a whole, for the small line under a KPI: "(86.0%)". */
export function shareOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((1000 * part) / whole) / 10 : null;
}

export const minutes = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('en-KE')} min`;

export const seconds = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('en-KE')} sec`;

export const hours = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toLocaleString('en-KE', { maximumFractionDigits: 1 })} hrs`;

/** Whole shillings, compact for a KPI card: "KES 42.6M", "KES 860K", "KES 950". */
export function kesCompact(shillings: number | null | undefined): string {
  if (shillings == null) return '—';
  const a = Math.abs(shillings);
  if (a >= 1_000_000) return `KES ${(shillings / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `KES ${Math.round(shillings / 1_000)}K`;
  return `KES ${Math.round(shillings).toLocaleString('en-KE')}`;
}

/** Percentage change, null when there was nothing before to compare with. */
export function delta(now: number | null, before: number | null): number | null {
  if (now == null || before == null || before === 0) return null;
  return Math.round((1000 * (now - before)) / Math.abs(before)) / 10;
}

/** A change in percentage points: "+1.9 pp"; undefined when either side is missing. */
export function ppDelta(now: number | null, before: number | null): string | undefined {
  if (now == null || before == null) return undefined;
  const d = Math.round((now - before) * 10) / 10;
  return `${d > 0 ? '+' : d < 0 ? '-' : ''}${Math.abs(d).toFixed(1)} pp`;
}

/** A change in a plain figure: "+0.2". */
export function plainDelta(
  now: number | null,
  before: number | null,
  digits = 1,
): string | undefined {
  if (now == null || before == null) return undefined;
  const d = now - before;
  return `${d > 0 ? '+' : d < 0 ? '-' : ''}${Math.abs(d).toFixed(digits)}`;
}

/** The short id staff read out on a call: the last eight of the uuid. */
export const riderRef = (id: string) => `RID-${id.slice(-8).toUpperCase()}`;
export const caseRef = (id: string) => `CAS-${id.slice(-8).toUpperCase()}`;

const NAIROBI: Intl.DateTimeFormatOptions = { timeZone: 'Africa/Nairobi' };

export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    ...NAIROBI,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function dayOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    ...NAIROBI,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function clockOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', {
    ...NAIROBI,
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Time left before a deadline, "2h 12m"; "Overdue 45m" past it. */
export function slaLeft(
  iso: string | null | undefined,
  now = Date.now(),
): { text: string; late: boolean } {
  if (!iso) return { text: '—', late: false };
  const diff = Math.round((new Date(iso).getTime() - now) / 60_000);
  const abs = Math.abs(diff);
  const text = abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${abs}m`;
  return diff < 0 ? { text: `Overdue ${text}`, late: true } : { text, late: false };
}

/* ──────────────────────────────────────────────────────────────── labels */

export const BUCKET_LABEL: Record<string, string> = {
  online: 'Active',
  on_trip: 'On Trip',
  offline: 'Offline',
  suspended: 'Suspended',
  offboarded: 'Offboarded',
  onboarding: 'Onboarding',
};

export const KYC_LABEL: Record<string, string> = {
  verified: 'Verified',
  in_review: 'In Review',
  rejected: 'Rejected',
  not_started: 'Not started',
};

export const STAGE_LABEL: Record<string, string> = {
  activated: 'Activated',
  approved: 'Approved',
  pending_review: 'Pending Review',
  rejected: 'Rejected',
};

export const VEHICLE_LABEL: Record<string, string> = {
  motorbike: 'Bike',
  bicycle: 'Bicycle',
  car: 'Car',
  tuktuk: 'Tuk-tuk',
  van: 'Van',
  on_foot: 'On foot',
};

export const PAYOUT_LABEL: Record<string, string> = {
  paid: 'Paid',
  held: 'Pending',
  sending: 'Sending',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rolled: 'Rolled over',
};

export const CASE_TYPE_LABEL: Record<string, string> = {
  delivery_dispute: 'Delivery dispute',
  payment_earnings: 'Payment / earnings',
  customer_conduct: 'Customer conduct',
  rider_conduct: 'Rider conduct',
  order_item: 'Order / item issue',
  safety: 'Safety',
  other: 'Other',
};

export const CASE_REASON_LABEL: Record<string, string> = {
  late_delivery: 'Late delivery',
  wrong_or_missing_item: 'Wrong / missing item',
  damaged_item: 'Damaged item',
  earnings_query: 'Earnings / payout query',
  customer_behaviour: 'Customer behaviour',
  rider_behaviour: 'Rider behaviour',
  safety: 'Safety',
  other: 'Other',
};

export const OUTCOME_LABEL: Record<string, string> = {
  resolved: 'Resolved',
  no_issue: 'Closed – No issue',
  compensated: 'Compensated',
  penalized: 'Penalized',
  unresolved: 'Unresolved',
};

export const CASE_BUCKET_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const REPORTER_LABEL: Record<string, string> = {
  rider: 'Rider',
  guest: 'Customer',
  merchant: 'Merchant',
  staff: 'Staff',
  system: 'System',
};

export const DELIVERY_BUCKET_LABEL: Record<string, string> = {
  delivered: 'Delivered',
  in_transit: 'In Transit',
  pending_pickup: 'Pending',
  failed: 'Failed',
};

/* ──────────────────────────────────────────────────────────────── links */

/** A link on the same screen that keeps the period and the filters. */
export function screenHref(
  path: string,
  period: Period,
  params: Record<string, string | null | undefined>,
): string {
  return hrefWith(path, { from: period.from, to: period.to, ...params });
}

/** One of a fixed set, or the fallback. */
export function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function pageOf(value: string | undefined): number {
  return Math.max(1, Math.floor(Number(value) || 1));
}
