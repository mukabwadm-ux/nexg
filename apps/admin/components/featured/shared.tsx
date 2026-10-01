import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

/** The vocabulary every Featured slots tab shares. */

export const DASH = '[—]';

export function kes(value: number | null | undefined): string {
  return value === null || value === undefined
    ? `KES ${DASH}`
    : `KES ${Number(value).toLocaleString('en-KE')}`;
}

export function num(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : String(value);
}

/** A rate is a ratio in the database and a percentage on screen. */
export function ratio(value: number | null | undefined): string {
  return value === null || value === undefined
    ? `${DASH}%`
    : `${(Number(value) * 100).toFixed(1)}%`;
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

export function shortDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : DASH;
}

/** Monday of the week a date falls in, as an ISO date string. */
export function mondayOf(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const shift = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - shift);
  return copy.toISOString().slice(0, 10);
}

export function weekNumber(iso: string): number {
  const d = new Date(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + start.getUTCDay() + 1) / 7);
}

export const KIND_LABEL: Record<string, string> = {
  homepage: 'Homepage spot',
  category_top: 'Category top',
  popular_request: 'Popular request',
};

export const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Food',
  bar_liquor: 'Drinks',
  laundry: 'Laundry',
  florist: 'Flowers',
  beauty_fashion: 'Beauty',
  pharmacy: 'Pharmacy',
  supermarket: 'Retail',
  gift_shop: 'Gifts',
  other: 'Other',
};

export const SLOT_TONE: Record<string, string> = {
  live: 'bg-success-bg text-success',
  booked: 'bg-info-bg text-info',
  held: 'bg-gold-soft text-gold-text',
  auto_paused: 'bg-danger-bg text-danger',
  paused: 'bg-danger-bg text-danger',
  open: 'border-border-strong text-muted border bg-transparent',
  ended: 'bg-bg text-muted-light',
};

export const STAGE_TONE: Record<string, string> = {
  ELIGIBLE: 'bg-success-bg text-success',
  WAITLIST: 'bg-info-bg text-info',
  QUOTED: 'bg-gold-soft text-gold-text',
  NOT_YET: 'bg-bg text-muted',
  BLOCKED: 'bg-danger-bg text-danger',
  BOOKED: 'bg-success-bg text-success',
  DECLINED: 'bg-bg text-muted-light',
};

export const FEE_TONE: Record<string, string> = {
  settled: 'bg-success-bg text-success',
  scheduled: 'bg-gold-soft text-gold-text',
  due: 'bg-gold-soft text-gold-text',
  pro_rata_review: 'bg-danger-bg text-danger',
  refunded: 'bg-bg text-muted',
  waived: 'bg-bg text-muted-light',
};

export const FEE_LABEL: Record<string, string> = {
  settled: 'SETTLED FRI',
  scheduled: 'DUE FRI',
  due: 'DUE FRI',
  pro_rata_review: 'PRO-RATA · REVIEW',
  refunded: 'REFUNDED',
  waived: 'WAIVED',
};

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

/**
 * The label a guest sees on every paid card.
 *
 * Rendered here with the same weight and spacing it has on the guest
 * site, because the console's preview is how staff check that it is
 * actually there.
 */
export function SponsoredChip() {
  return (
    <span className="bg-gold text-ink inline-block rounded px-1.5 py-0.5 text-[0.5rem] font-extrabold uppercase tracking-[0.08em]">
      Sponsored
    </span>
  );
}

/** Green, amber, red — with the streak, because the streak is the rule. */
export function HealthDot({ band, days }: { band: string | null; days: number | null }) {
  if (!band) {
    return <span className="text-muted-light text-xs font-semibold">No score yet</span>;
  }
  const colour = band === 'green' ? 'bg-success' : band === 'amber' ? 'bg-warning' : 'bg-danger';
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${colour}`} />
      <span className="text-[0.75rem] font-bold capitalize">
        {band}
        {days !== null && ` · ${days} d`}
      </span>
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
  disabled,
}: {
  on: boolean;
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="border-border text-muted-light cursor-default whitespace-nowrap rounded-full border px-4 py-2 text-[0.8125rem] font-extrabold opacity-50">
        {children}
      </span>
    );
  }
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

export function Avatar({ name }: { name: string }) {
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
      className="bg-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-extrabold text-white"
    >
      {initials || '—'}
    </span>
  );
}

// ─────────────────────────────────────────────────────── row types

export interface InventoryRow {
  placement_id: string;
  city_id: string;
  city_name: string | null;
  kind: string;
  category: string | null;
  position: number;
  label: string;
  description: string | null;
  enabled: boolean;
  week_start: string | null;
  slot_status: string | null;
  price: number | null;
  booking_id: string | null;
  merchant_id: string | null;
  trading_name: string | null;
  merchant_category: string | null;
  booking_status: string | null;
  end_date: string | null;
  auto_renew: boolean | null;
  pause_reason: string | null;
  hold_expires_at: string | null;
  rate_card_price: number | null;
}

export interface RequestRow {
  id: string;
  merchant_id: string;
  trading_name: string | null;
  merchant_category: string | null;
  merchant_status: string;
  health_band: string | null;
  health_green_days: number | null;
  went_live_at: string | null;
  placement_kind: string;
  category: string | null;
  city_id: string | null;
  city_name: string | null;
  status: string;
  requested_via: string;
  requested_at: string;
  wanted_start: string | null;
  weeks: number;
  auto_renew: boolean;
  eligibility: {
    passed?: boolean;
    checks?: Record<string, { passed: boolean; value: unknown; reason: string }>;
  };
  eligible: boolean | null;
  waitlist_rank: number | null;
  quote_expires_at: string | null;
  quoted_price: number | null;
  start_date: string | null;
  end_date: string | null;
  declined_reason: string | null;
  waiting_days: number;
  quote_hours_left: number | null;
  rate_card_price: number | null;
  stage: string;
  days_until_live_30d: number;
}

export interface ScheduleRow {
  placement_id: string;
  city_id: string;
  kind: string;
  category: string | null;
  position: number;
  label: string;
  week_start: string;
  status: string;
  price: number | null;
  booking_id: string | null;
  trading_name: string | null;
}

export interface PerformanceRow {
  booking_id: string;
  merchant_id: string;
  trading_name: string | null;
  city_id: string | null;
  placement_label: string | null;
  kind: string | null;
  category: string | null;
  week_start: string | null;
  views: number;
  taps: number;
  orders: number;
  order_value: number;
  ctr: number | null;
  conversion: number | null;
  fee_ex_vat: number | null;
  vat: number | null;
  fee_total: number | null;
  fee_status: string | null;
  days_live: number | null;
  pro_rata: boolean | null;
  fee_line_id: string | null;
}

export interface Badges {
  open_requests: number;
  eligible_now: number;
  blocked_by_health: number;
  quoted: number;
  quotes_expiring: number;
  auto_paused: number;
  live: number;
  creatives_pending: number;
  pro_rata_reviews: number;
  open_this_week: number;
  slots_this_week: number;
  cities_without_prices: number;
}

export const CHECK_LABEL: Record<string, string> = {
  live_30d: 'Live on NexG ≥ 30 days',
  health_green_30d: 'Health green for 30 consecutive days',
  no_open_disputes: 'No open disputes',
  settlement_verified: 'Settlement account verified',
  not_holding_placement: 'Not already holding this placement',
};

/**
 * The five checks, each with the sentence the merchant is shown.
 *
 * Rendered from the stored result rather than recomputed, so what a
 * staff member reads here is exactly what the merchant was told.
 */
export function EligibilityList({
  eligibility,
}: {
  eligibility: RequestRow['eligibility'];
}) {
  const checks = eligibility?.checks ?? {};
  const keys = Object.keys(CHECK_LABEL);

  if (Object.keys(checks).length === 0) {
    return (
      <p className="text-muted-light text-[0.75rem] font-semibold">
        Not checked yet — the nightly run fills this in.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {keys.map((key) => {
        const check = checks[key];
        const passed = check?.passed ?? false;
        return (
          <li key={key} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                passed ? 'bg-success' : 'bg-danger'
              }`}
            />
            <span className="min-w-0">
              <span className="block text-[0.75rem] font-semibold">
                {check?.reason ?? CHECK_LABEL[key]}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A panel for something the design shows but no data supports yet.
 * Says which, rather than rendering a convincing zero.
 */
export function NotMeasured({ what, why }: { what: string; why: string }) {
  return (
    <Card className="p-5">
      <p className="text-[0.8125rem] font-extrabold">{what}</p>
      <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">{why}</p>
    </Card>
  );
}
