import { Card } from '@nexg/ui';
import * as React from 'react';

/** The vocabulary every Merchants tab shares. */

export const DASH = '[—]';

export function kes(value: number | null | undefined): string {
  return value === null || value === undefined
    ? `KES ${DASH}`
    : `KES ${value.toLocaleString('en-KE')}`;
}

/** [—] for a figure nobody has recorded. Zero is a different claim. */
export function num(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : String(value);
}

export function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? `${DASH}%` : `${Math.round(Number(value))}%`;
}

export function when(iso: string | null): string {
  if (!iso) return DASH;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function daysSince(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
}

export function hhmm(time: string | null): string {
  return time ? time.slice(0, 5) : DASH;
}

export const STATUS_TONE: Record<string, string> = {
  live: 'bg-success-bg text-success',
  paused: 'bg-warning-bg text-warning',
  under_review: 'border-warning/50 text-warning border bg-transparent',
  applied: 'bg-bg text-muted',
  documents_pending: 'bg-bg text-muted',
  suspended: 'bg-danger-bg text-danger',
  delisted: 'bg-bg text-muted-light',
};

export const STATUS_LABEL: Record<string, string> = {
  live: 'LIVE',
  paused: 'PAUSED',
  under_review: 'UNDER REVIEW',
  applied: 'APPLIED',
  documents_pending: 'DOCUMENTS',
  suspended: 'SUSPENDED',
  delisted: 'DELISTED',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
        STATUS_TONE[status] ?? 'bg-bg text-muted'
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Green, amber or red — and the score beside it, because colour alone is not a signal. */
export function HealthDot({
  band,
  score,
}: {
  band: string | null;
  score: number | null;
}) {
  if (!band && score === null) {
    return <span className="text-muted-light text-xs font-semibold">{DASH}</span>;
  }
  const colour =
    band === 'green' ? 'bg-success' : band === 'amber' ? 'bg-warning' : 'bg-danger';
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${colour}`} />
      <span className="text-[0.8125rem] font-extrabold tabular-nums">{num(score)}</span>
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
    <a
      href={href}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
        on ? 'bg-ink text-white' : 'border-border-strong bg-surface text-ink hover:border-ink border'
      }`}
    >
      {children}
    </a>
  );
}

/** A table that says nothing is here, rather than showing empty rows. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-muted px-4 py-10 text-center text-sm font-semibold">
        {children}
      </td>
    </tr>
  );
}

export const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Food',
  bar_liquor: 'Drinks',
  laundry: 'Laundry',
  florist: 'Gifts',
  beauty_fashion: 'Beauty',
  pharmacy: 'Pharmacy',
  supermarket: 'Retail',
  gift_shop: 'Gifts',
  other: 'Other',
};

export interface DirectoryRow {
  id: string;
  trading_name: string | null;
  category: string | null;
  status: string;
  featured: boolean | null;
  concierge_pick: boolean | null;
  accepting_orders: boolean | null;
  explore_visible: boolean | null;
  health_band: string | null;
  health_score: number | null;
  payout_hold: boolean | null;
  parent_merchant_id: string | null;
  city_name: string | null;
  branch_name: string | null;
  went_live_at: string | null;
  submitted_at: string | null;
  created_at: string | null;
  orders_30d: number | null;
  on_time_ready_pct: number | null;
  gmv_30d_kes: number | null;
  open_disputes: number | null;
}

export interface Counts {
  total: number;
  live: number;
  paused: number;
  under_review: number;
  suspended: number;
  featured: number;
  applications: number;
  onboarding: number;
  open_disputes: number;
  pending_edits: number;
  expiring_docs: number;
}
