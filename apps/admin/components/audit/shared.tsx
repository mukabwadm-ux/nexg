import { Card } from '@nexg/ui';
import * as React from 'react';

/** The vocabulary every Audit tab shares. */

export const DASH = '[—]';

export function num(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : Number(value).toLocaleString('en-KE');
}

export function kes(cents: number | null | undefined): string {
  return cents === null || cents === undefined
    ? `KES ${DASH}`
    : `KES ${(Number(cents) / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

export function stamp(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

export function fullStamp(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

export const SEVERITY_LABEL: Record<string, string> = {
  info: 'INFO',
  notice: 'NOTICE',
  high: 'HIGH',
};

/*
 * Three levels, not five. The database enum has info, notice and high
 * and nothing else — inventing a "critical" chip here would be a
 * colour with no value behind it.
 */
export const SEVERITY_TONE: Record<string, string> = {
  info: 'bg-bg text-muted',
  notice: 'bg-warning-bg text-warning',
  high: 'bg-danger-bg text-danger',
};

export const REVIEW_TONE: Record<string, string> = {
  none: 'bg-bg text-muted-light',
  needs_review: 'bg-warning-bg text-warning',
  reviewed: 'bg-success-bg text-success',
  escalated: 'bg-danger-bg text-danger',
};

export const REVIEW_LABEL: Record<string, string> = {
  none: '',
  needs_review: 'NEEDS REVIEW',
  reviewed: 'REVIEWED',
  escalated: 'ESCALATED',
};

export const OUTCOME_LABEL: Record<string, string> = {
  success: 'Signed in',
  bad_password: 'Wrong password',
  unknown_email: 'No such account',
  mfa_failed: 'MFA failed',
  locked: 'Locked out',
  blocked_ip: 'Blocked address',
  expired_invite: 'Invite expired',
};

export const MODULE_LABEL: Record<string, string> = {
  audit: 'Audit',
  careers: 'Careers',
  experiences: 'Experiences',
  featured: 'Featured',
  finance: 'Finance',
  hotels: 'Hotels & Airbnb',
  live_ops: 'Live ops',
  merchants: 'Merchants',
  orders: 'Orders',
  overview: 'Overview',
  riders: 'Riders',
  settings: 'Settings',
  staff: 'Staff',
  support: 'Support',
};

export const PURPOSE_LABEL: Record<string, string> = {
  regulator: 'Regulator',
  court: 'Court',
  insurer: 'Insurer',
  internal_investigation: 'Internal investigation',
  data_subject_request: 'Data subject request',
  audit: 'Audit',
};

// ───────────────────────────────────────────────────────── primitives

export function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
        tone ?? 'bg-bg text-muted'
      }`}
    >
      {children}
    </span>
  );
}

export function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'danger' | 'success' | 'warning';
}) {
  return (
    <Card className="p-4">
      <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase leading-tight tracking-[0.12em]">
        {label}
      </p>
      <p
        className={`mt-2 text-[1.75rem] font-extrabold leading-tight tracking-tight ${
          tone === 'danger'
            ? 'text-danger'
            : tone === 'success'
              ? 'text-success'
              : tone === 'warning'
                ? 'text-warning'
                : ''
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold leading-snug">{hint}</p>
      )}
    </Card>
  );
}

/**
 * A hash, shown the way somebody actually checks one: the first
 * twelve characters, in a monospaced face, with the whole thing in
 * the title for a copy.
 */
export function Hash({ value, label }: { value: string | null; label?: string }) {
  if (!value) return <span className="text-muted-light text-[0.75rem]">{DASH}</span>;
  /* PostgREST hands bytea back as \x followed by the hex. The prefix
     is not part of the digest, and leaving it in would eat two of the
     twelve characters somebody reads down a telephone. */
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  return (
    <span
      title={hex}
      className="bg-bg text-muted rounded px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold"
    >
      {label ?? hex.slice(0, 12)}
    </span>
  );
}

/**
 * The empty state, written as a sentence rather than a shrug. Each
 * one says what would put something here.
 */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-muted mx-auto max-w-[32rem] text-[0.875rem] font-semibold leading-[1.8]">
        {children}
      </p>
    </Card>
  );
}

/**
 * A field that changed, rendered from the diff the event recorded —
 * never by reading the business table, which has since moved on.
 */
export function Diff({ diff }: { diff: Record<string, { from: unknown; to: unknown }> | null }) {
  const entries = Object.entries(diff ?? {});
  if (entries.length === 0) {
    return (
      <p className="text-muted-light text-[0.75rem] font-semibold">
        Nothing changed, or the change was not recorded as a diff.
      </p>
    );
  }
  return (
    <dl className="divide-border divide-y">
      {entries.map(([field, change]) => (
        <div key={field} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2">
          <dt className="text-muted text-[0.75rem] font-bold">{field.replace(/_/g, ' ')}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2 text-[0.75rem]">
            <span className="text-muted-light line-through">{render(change?.from)}</span>
            <span aria-hidden="true" className="text-muted-light">
              →
            </span>
            <span className="font-extrabold">{render(change?.to)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function render(v: unknown): string {
  if (v === null || v === undefined) return 'not set';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ─────────────────────────────────────────────────────────── row types

export interface HealthRow {
  events_total: number;
  oldest_event: string | null;
  newest_event: string | null;
  events_today: number;
  needs_review: number;
  alerts_open: number;
  break_glass_expired_unclosed: number;
  break_glass_unreviewed: number;
  holds_active: number;
  unregistered_events: number;
  retention_rules_unset: number;
  chain_ok: boolean | null;
  chain_checked_at: string | null;
  chain_events_checked: number | null;
  chain_first_bad_id: number | null;
  chain_detail: string | null;
  chain_check_overdue: boolean;
}

export interface ActivityRow {
  id: number;
  at: string;
  ago: string;
  hash_version: number;
  actor_type: string;
  actor_id: string | null;
  actor_label: string;
  actor_role: string | null;
  on_behalf_of: string | null;
  module: string;
  action: string;
  action_label: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  severity: string;
  city_id: string | null;
  city_name: string | null;
  reason: string | null;
  approver_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  context: Record<string, unknown>;
  related: Record<string, unknown>;
  sentence: string;
  changed_fields: number;
  is_money: boolean;
  touches_pii: boolean;
  needs_two_people: boolean;
  unregistered: boolean;
  review_state: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  hash: string | null;
}

export interface SignInRow {
  id: number;
  at: string;
  ago: string;
  staff_user_id: string | null;
  who: string;
  who_name: string | null;
  email_attempted: string | null;
  outcome: string;
  succeeded: boolean;
  auth_method: string | null;
  mfa_used: boolean;
  ip_masked: string | null;
  ip_country: string | null;
  device_label: string | null;
  first_from_device: boolean;
  first_from_country: boolean;
  session_live: boolean;
  ended_at: string | null;
  ended_reason: string | null;
  recent_failures: number;
  flag: string | null;
}

export interface AlertRow {
  id: string;
  rule_key: string;
  title: string;
  next_step: string | null;
  raised_at: string;
  ago: string;
  severity: string;
  actor_label: string | null;
  city_name: string | null;
  event_count: number;
  first_event_id: number | null;
  last_event_id: number | null;
  summary: string;
  state: string;
  acknowledged_by_name: string | null;
  resolved_by_name: string | null;
  resolution_note: string | null;
  stale: boolean;
}

export interface BreakGlassRow {
  id: string;
  who: string | null;
  who_name: string | null;
  opened_at: string;
  ago: string;
  reason: string;
  scope: string;
  module_key: string | null;
  city_name: string | null;
  expires_at: string;
  closed_at: string | null;
  open_now: boolean;
  expired_unclosed: boolean;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_outcome: string | null;
  review_note: string | null;
  events_during: number;
}

export interface MoneyRow {
  id: number;
  at: string;
  ago: string;
  module: string;
  action: string;
  action_label: string;
  actor_label: string;
  target_label: string | null;
  city_name: string | null;
  reason: string | null;
  approver_label: string | null;
  needs_two_people: boolean;
  missing_second_person: boolean;
  amount_cents: number | null;
  currency: string | null;
  amount_not_recorded: boolean;
  order_reference: string | null;
  severity: string;
  review_state: string;
}

export interface DataAccessRow {
  id: number;
  at: string;
  ago: string;
  module: string;
  action: string;
  action_label: string;
  actor_label: string;
  actor_role: string | null;
  subject_label: string | null;
  pii_fields: string[];
  reason: string | null;
  no_reason_given: boolean;
  surface: string | null;
  ip_country: string | null;
  city_name: string | null;
  severity: string;
  review_state: string;
  reveals_in_the_hour: number;
}

export interface ExportRow {
  id: string;
  at: string;
  ago: string;
  who: string;
  module: string;
  what: string;
  row_count: number | null;
  format: string | null;
  reason: string;
  contains_pii: boolean;
  destination: string | null;
  outside_hours: boolean;
}

export interface PackRow {
  id: string;
  reference: string;
  title: string;
  purpose: string;
  requested_by: string;
  reason: string;
  legal_hold_reference: string | null;
  from_at: string | null;
  to_at: string | null;
  event_count: number | null;
  content_hash_hex: string | null;
  content_hash_short: string | null;
  chain_ok: boolean | null;
  state: string;
  created_by_name: string | null;
  created_at: string;
  frozen_at: string | null;
  shared_at: string | null;
  shared_with: string | null;
  shared_how: string | null;
  still_matches_the_log: boolean;
}

export interface RetentionRow {
  key: string;
  module: string | null;
  subject: string;
  description: string | null;
  retain_for_label: string;
  basis: string;
  anonymise: boolean;
  last_run_at: string | null;
  last_run_rows: number | null;
  last_run_held: number | null;
  approved_by_name: string | null;
  second_approver_name: string | null;
  approved_at: string | null;
  period_not_set: boolean;
  not_approved: boolean;
  not_running: boolean;
}

export interface HoldRow {
  id: string;
  reference: string;
  title: string;
  reason: string;
  subject_type: string;
  subject_id: string | null;
  city_name: string | null;
  instructed_by: string;
  placed_by_name: string | null;
  placed_at: string;
  released_by_name: string | null;
  released_at: string | null;
  release_reason: string | null;
  active: boolean;
  packs: number;
}

export interface ModuleRow {
  module: string;
  events: number;
  events_7d: number;
  high: number;
  unregistered: number;
  last_event_at: string | null;
}
