import { Card } from '@nexg/ui';
import * as React from 'react';

/** The vocabulary every Riders tab shares. */

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

/** "1 rider", not "1 riders". */
export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

export function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? `${DASH}%` : `${Math.round(Number(value))}%`;
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

/** A phone number nobody asked to see. Revealing it is an audited action. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return DASH;
  return `+254 7•• ••• •${phone.slice(-2)}`;
}

export const VEHICLE_LABEL: Record<string, string> = {
  motorbike: 'Boda',
  bicycle: 'Bicycle',
  car: 'Car',
  tuktuk: 'Tuktuk',
};

export const STATUS_TONE: Record<string, string> = {
  active: 'bg-success-bg text-success',
  applied: 'bg-bg text-muted',
  documents_pending: 'bg-bg text-muted',
  under_review: 'border-warning/50 text-warning border bg-transparent',
  suspended: 'bg-danger-bg text-danger',
  offboarded: 'bg-bg text-muted-light',
};

export const STATUS_LABEL: Record<string, string> = {
  active: 'ACTIVE',
  applied: 'APPLIED',
  documents_pending: 'DOCUMENTS',
  under_review: 'UNDER REVIEW',
  suspended: 'SUSPENDED',
  offboarded: 'OFFBOARDED',
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

/**
 * Presence is a different axis from status: an active rider can be
 * offline, and the table needs to say both without conflating them.
 */
export function PresencePill({
  presence,
  cooldownUntil,
}: {
  presence: string | null;
  cooldownUntil?: string | null;
}) {
  if (cooldownUntil && new Date(cooldownUntil) > new Date()) {
    return (
      <span className="bg-warning-bg text-warning inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold">
        COOLDOWN · {clock(cooldownUntil)}
      </span>
    );
  }
  if (presence === 'on_trip') {
    return (
      <span className="bg-gold-soft text-gold-text inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold">
        ON TRIP
      </span>
    );
  }
  if (presence === 'online') {
    return (
      <span className="bg-success-bg text-success inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold">
        ONLINE
      </span>
    );
  }
  return null;
}

/** Green, amber or red — and the score beside it, because colour alone is not a signal. */
export function HealthDot({ band, score }: { band: string | null; score: number | null }) {
  if (!band && score === null) {
    return <span className="text-muted-light text-xs font-semibold">{DASH}</span>;
  }
  const colour = band === 'green' ? 'bg-success' : band === 'amber' ? 'bg-warning' : 'bg-danger';
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${colour}`} />
      <span className="text-[0.8125rem] font-extrabold tabular-nums">{num(score)}</span>
    </span>
  );
}

/** Initials, so a face photo is never loaded to render a list. */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
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
        on
          ? 'bg-ink text-white'
          : 'border-border-strong bg-surface text-ink hover:border-ink border'
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

/**
 * Cash against the cap. Green under the remind line, amber up to the
 * cap, red over it.
 *
 * With no cap set the bar is not drawn at all — a full bar against an
 * invented cap would be a rider told they are over a limit nobody set.
 */
export function CashBar({ held, cap }: { held: number | null; cap: number | null }) {
  if (cap === null || cap === undefined || cap === 0) {
    return <span className="text-muted-light text-[0.6875rem] font-semibold">no cap set</span>;
  }
  const ratio = Math.min((held ?? 0) / cap, 1);
  const tone = ratio >= 1 ? 'bg-danger' : ratio >= 0.8 ? 'bg-warning' : 'bg-success';
  return (
    <span className="block">
      <span className="bg-bg block h-1.5 w-full overflow-hidden rounded-full">
        <span
          className={`block h-full rounded-full ${tone}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
      <span className="text-muted-light mt-1 block text-[0.625rem] font-bold tabular-nums">
        {Math.round(((held ?? 0) / cap) * 100)}% of {kes(cap)}
      </span>
    </span>
  );
}

/**
 * A panel for a tab whose data has no source yet. Says so, rather than
 * rendering a convincing empty state that looks like "nothing happened
 * today".
 */
export function NotMeasured({ what, why }: { what: string; why: string }) {
  return (
    <Card className="mt-5 p-5">
      <p className="text-[0.8125rem] font-extrabold">{what}</p>
      <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">{why}</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────── row types

export interface RiderRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string;
  presence: string | null;
  vehicle: string | null;
  plate_no: string | null;
  city_id: string | null;
  city_name: string | null;
  source: string | null;
  employer_merchant_id: string | null;
  employer_name: string | null;
  health_band: string | null;
  health_score: number | null;
  top_decile: boolean | null;
  cash_on_hand: number | null;
  cash_cap_effective: number | null;
  cooldown_until: string | null;
  can_receive_offers: boolean | null;
  offers_paused_reason: string | null;
  pay_on_delivery_eligible: boolean | null;
  created_at: string | null;
  activated_at: string | null;
  face_photo_path: string | null;
  acceptance_pct: number | null;
  on_time_pct: number | null;
  rating_avg: number | null;
  trips_30d: number | null;
  issues_30d: number | null;
  documents_expiring: number | null;
  documents_expired: number | null;
  open_incidents: number | null;
  active_strikes: number | null;
  last_deposit_at: string | null;
  oldest_undeposited_at: string | null;
}

export interface Badges {
  active: number;
  onboarding: number;
  on_cooldown: number;
  suspended: number;
  online_now: number;
  on_trip: number;
  fleet: number;
  sos_open: number;
  incidents_open: number;
  unmatched_deposits: number;
  failed_payouts: number;
  fraud_open: number;
  cash_all: number;
  riders_holding_cash: number;
}

export function riderName(r: { first_name: string | null; last_name: string | null }): string {
  return `${r.first_name ?? '[First]'} ${r.last_name ?? ''}`.trim();
}
