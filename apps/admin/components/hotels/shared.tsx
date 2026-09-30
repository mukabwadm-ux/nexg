import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

/** The vocabulary every Hotels & Airbnb tab shares. */

export const DASH = '[—]';

export function kes(value: number | null | undefined): string {
  return value === null || value === undefined
    ? `KES ${DASH}`
    : `KES ${Number(value).toLocaleString('en-KE')}`;
}

/** [—] for a figure nobody has recorded. Zero is a different claim. */
export function num(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : String(value);
}

export function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? `${DASH}%` : `${Math.round(Number(value))}%`;
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function daysSince(iso: string | null | undefined): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
}

export function clock(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : DASH;
}

/** How long something has been waiting, in the words the desk uses. */
export function ageLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return DASH;
  const m = Math.round(minutes);
  if (m < 60) return `${m} MIN`;
  const h = Math.floor(m / 60);
  return `${h} H ${m % 60} MIN`;
}

export const HOST_STATUS_TONE: Record<string, string> = {
  live: 'bg-success-bg text-success',
  applied: 'bg-bg text-muted',
  verifying: 'border-warning/50 text-warning border bg-transparent',
  paused: 'bg-bg text-muted',
  offboarded: 'bg-bg text-muted-light',
};

export const HOTEL_STATUS_TONE: Record<string, string> = {
  partner: 'bg-success-bg text-success',
  prospect: 'bg-gold-soft text-gold-text',
  onboarding: 'bg-warning-bg text-warning',
  paused: 'bg-bg text-muted',
  ended: 'bg-bg text-muted-light',
};

export const FOLIO_TONE: Record<string, string> = {
  awaiting_desk: 'bg-warning-bg text-warning',
  posted: 'bg-success-bg text-success',
  rejected_checked_out: 'bg-danger-bg text-danger',
  rejected_name_mismatch: 'bg-danger-bg text-danger',
  rejected_cap: 'bg-danger-bg text-danger',
  recharged_card: 'bg-bg text-muted',
  void: 'bg-bg text-muted-light',
};

export const FOLIO_LABEL: Record<string, string> = {
  awaiting_desk: 'AWAITING DESK',
  posted: 'POSTED',
  rejected_checked_out: 'REJECTED · CHECKED OUT',
  rejected_name_mismatch: 'REJECTED · NAME MISMATCH',
  rejected_cap: 'REJECTED · OVER CAP',
  recharged_card: 'RECHARGED',
  void: 'VOID',
};

export function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: string;
}) {
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

/** A tier chip: gold outline, grey, or neutral. */
export function TierChip({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-muted-light text-[0.75rem] font-semibold">—</span>;
  const tone =
    tier === 'gold'
      ? 'border-gold text-gold-text border'
      : tier === 'silver'
        ? 'border-border-strong text-muted border'
        : 'bg-bg text-muted';
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase ${tone}`}
    >
      {tier}
    </span>
  );
}

export function Tile({
  label,
  value,
  children,
  tone,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
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
      {children && (
        <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold leading-snug">
          {children}
        </p>
      )}
    </Card>
  );
}

export function Chip({
  on,
  href,
  children,
}: {
  on: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
        on ? 'bg-ink text-white' : 'border-border-strong bg-surface text-ink hover:border-ink border'
      }`}
    >
      {children}
    </Link>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-muted px-4 py-10 text-center text-sm font-semibold">
        {children}
      </td>
    </tr>
  );
}

/** Initials, so no photo is loaded to render a list. */
export function Avatar({ name, square }: { name: string; square?: boolean }) {
  const initials = name
    .replace(/[[\]]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className={`bg-ink flex h-8 w-8 shrink-0 items-center justify-center text-[0.6875rem] font-extrabold text-white ${
        square ? 'rounded-lg' : 'rounded-full'
      }`}
    >
      {initials || '—'}
    </span>
  );
}

/**
 * A panel for something the design shows but the data cannot yet
 * support. Says so, rather than rendering a convincing empty state
 * that reads as "nothing happened".
 */
export function NotMeasured({ what, why }: { what: string; why: string }) {
  return (
    <Card className="p-5">
      <p className="text-[0.8125rem] font-extrabold">{what}</p>
      <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">{why}</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────── row types

export interface HostRow {
  id: string;
  display_name: string | null;
  contact_name: string | null;
  phone_masked: string | null;
  kind: string;
  tier: string;
  status: string;
  city_id: string | null;
  city_name: string | null;
  areas: string[] | null;
  superhost_claimed: boolean;
  packages_enabled: boolean;
  verified_at: string | null;
  went_live_at: string | null;
  created_at: string;
  submitted_at: string | null;
  units: number;
  units_setting_up: number;
  units_live: number;
  packages_month: number;
  qr_not_placed: number;
  orders_30d: number | null;
}

export interface HotelRow {
  id: string;
  name: string;
  brand: string | null;
  area: string | null;
  city_id: string | null;
  city_name: string | null;
  rooms: number | null;
  star_rating: number | null;
  status: string;
  tier: string | null;
  prospect_stage: string | null;
  next_action_at: string | null;
  gm_name: string | null;
  commission_pct: number | null;
  agreement_version: string | null;
  agreement_signed_at: string | null;
  charge_to_room: boolean;
  charge_cap_per_stay: number | null;
  postings_30d: number;
  posted_30d_kes: number;
  orders_30d: number | null;
}

export interface FolioRow {
  id: string;
  order_reference: string;
  hotel_id: string;
  hotel_name: string;
  room_no: string;
  guest_surname: string;
  amount: number;
  status: string;
  folio_ref: string | null;
  sync: string;
  created_at: string;
  desk_action_at: string | null;
  escalated_at: string | null;
  desk_note: string | null;
  recharged_payment_ref: string | null;
  age_minutes: number;
  desk_sla_minutes: number | null;
  escalate_after_minutes: number | null;
}

export interface GuestRow {
  id: string;
  name: string | null;
  phone_masked: string | null;
  country_code: string | null;
  vip: boolean;
  blocked: boolean;
  block_reason: string | null;
  preferences: Record<string, unknown>;
  payment_summary: Record<string, unknown>;
  refusal_count: number;
  dispute_count: number;
  repeat_count: number;
  last_stay: Record<string, unknown> | null;
  staff_notes: string | null;
  anonymised_at: string | null;
  last_order_at: string | null;
  created_at: string;
  has_account: boolean;
  consent_service_sms: boolean | null;
  consent_marketing: boolean | null;
  open_data_requests: number;
}

export interface DataRequestRow {
  id: string;
  guest_id: string | null;
  guest_name: string | null;
  requester_masked: string | null;
  requester_email: string | null;
  kind: string;
  status: string;
  received_at: string;
  due_at: string;
  channel: string | null;
  identity_verified_at: string | null;
  identity_method: string | null;
  scope: string[];
  blocking_reasons: Record<string, string>;
  fulfilled_at: string | null;
  refusal_reason: string | null;
  days_left: number;
  handled_by_name: string | null;
}

export interface Badges {
  hosts_live: number;
  hosts_verifying: number;
  units_setting_up: number;
  units_stuck: number;
  hotels_partner: number;
  hotels_prospect: number;
  rooms_covered: number;
  hotels_charge_to_room: number;
  folios_awaiting: number;
  folios_over_sla: number;
  folios_rejected_30d: number;
  posted_this_month: number;
  recon_open: number;
  invoices_due: number;
  data_requests_open: number;
  data_requests_due_soon: number;
  guests_blocked: number;
  prospects_overdue: number;
}

export const HOST_KIND_LABEL: Record<string, string> = {
  single_unit: 'Single unit',
  multi_unit: 'A few units',
  property_manager: 'Property manager',
};

export const HANDOFF_LABEL: Record<string, string> = {
  guest_meets_at_gate: 'Guest meets at gate',
  leave_with_askari: 'Leave with askari · caretaker',
  lockbox: 'Lockbox',
  call_guest_first: 'Call guest first',
  reception: 'Reception',
  caretaker: 'Caretaker',
};
