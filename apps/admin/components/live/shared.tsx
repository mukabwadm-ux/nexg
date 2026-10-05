import Link from 'next/link';
import * as React from 'react';

/** The vocabulary Live operations and Orders share. */

export const DASH = '[—]';

export function kes(cents: number | null | undefined): string {
  return cents === null || cents === undefined
    ? `KES ${DASH}`
    : `KES ${Math.round(Number(cents) / 100).toLocaleString('en-KE')}`;
}

export function num(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : String(value);
}

export function km(value: number | null | undefined): string {
  return value === null || value === undefined ? `${DASH} km` : `${Number(value).toFixed(1)} km`;
}

/** Nairobi time, because that is the clock the desk is working to. */
export function clock(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;
}

/**
 * How long something has been going on.
 *
 * Rendered on the server from a timestamp the server also sent, so a
 * browser with the wrong clock cannot make an order look six minutes
 * older than it is. The live tick is the client's job.
 */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return DASH;
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function mins(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  const n = Math.round(Number(value));
  return n >= 0 ? `+${n} min` : `${n} min`;
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

/** The stage pill, in the artboard's words. */
export const STAGE_LABEL: Record<string, string> = {
  placed: 'PLACED',
  confirmed: 'CONFIRMED',
  preparing: 'PREPARING',
  ready: 'READY',
  picked_up: 'PICKED UP',
  arriving: 'ARRIVING',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  disputed: 'DISPUTED',
  refunded: 'REFUNDED',
};

export const STAGE_TONE: Record<string, string> = {
  placed: 'bg-bg text-muted',
  confirmed: 'bg-info-bg text-info',
  preparing: 'bg-info-bg text-info',
  ready: 'bg-gold-soft text-gold-text',
  picked_up: 'bg-gold-soft text-gold-text',
  arriving: 'bg-gold-soft text-gold-text',
  delivered: 'bg-success-bg text-success',
  cancelled: 'bg-bg text-muted-light',
  disputed: 'bg-danger-bg text-danger',
  refunded: 'bg-danger-bg text-danger',
};

export const PAYMENT_LABEL: Record<string, string> = {
  mpesa_stk: 'M-Pesa',
  card: 'Card',
  charge_to_room: 'Charge to room',
  cash_on_delivery: 'Pay on delivery',
  on_account: 'On account',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'pending',
  authorised: 'authorised',
  paid: 'paid',
  collected: 'collected',
  failed: 'failed',
  refunded: 'refunded',
  partially_refunded: 'part refunded',
};

/**
 * The one word a row is sorted and coloured by, with the same word in
 * the text. Colour is never the only signal — a dispatcher working a
 * red–green deficit reads the same screen as everybody else.
 */
export const URGENCY_LABEL: Record<string, string> = {
  needs_a_person: 'NO RIDER FOUND',
  late: 'LATE',
  finding_a_rider: 'FINDING A RIDER',
  running: 'RUNNING',
  done: 'DELIVERED',
  closed: 'CLOSED',
};

export const URGENCY_TONE: Record<string, string> = {
  needs_a_person: 'bg-danger-bg text-danger',
  late: 'bg-gold-soft text-gold-text',
  finding_a_rider: 'bg-info-bg text-info',
  running: 'bg-bg text-muted',
  done: 'bg-success-bg text-success',
  closed: 'bg-bg text-muted-light',
};

export const OUTCOME_TONE: Record<string, string> = {
  accepted: 'bg-success-bg text-success',
  declined: 'bg-danger-bg text-danger',
  timed_out: 'bg-gold-soft text-gold-text',
  skipped: 'bg-bg text-muted-light',
  withdrawn: 'bg-bg text-muted-light',
  pending: 'bg-info-bg text-info',
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

export function Chip({
  on,
  href,
  children,
  count,
  tone,
}: {
  on: boolean;
  href: string;
  children: React.ReactNode;
  count?: number | null;
  tone?: 'danger' | 'gold';
}) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
        on ? 'bg-ink text-white' : 'border-border-strong bg-surface text-ink hover:border-ink border'
      }`}
    >
      {children}
      {count !== undefined && (
        <span
          className={`ml-1.5 ${
            on
              ? 'text-white/70'
              : tone === 'danger'
                ? 'text-danger'
                : tone === 'gold'
                  ? 'text-gold-text'
                  : 'text-muted-light'
          }`}
        >
          {count === null ? DASH : count}
        </span>
      )}
    </Link>
  );
}

/**
 * A number nobody has published.
 *
 * Used wherever a figure is genuinely unset rather than zero — a boost
 * with no fee, compensation with no rate card. The distinction matters:
 * zero is a decision, `[—]` is the absence of one.
 */
export function Unset({ who }: { who: string }) {
  return (
    <span className="text-muted-light text-[0.75rem] font-semibold">
      {DASH} <span className="font-medium">· {who} publishes this</span>
    </span>
  );
}

export function SectionTitle({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-[0.8125rem] font-extrabold uppercase tracking-[0.06em]">{children}</h2>
      {note && <span className="text-muted-light text-[0.6875rem] font-semibold">{note}</span>}
    </div>
  );
}

/** Green / amber / red, with the state word beside it. */
export function StateDot({ state }: { state: string }) {
  const colour =
    state === 'short' ? 'bg-danger' : state === 'tight' ? 'bg-warning' : 'bg-success';
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${colour}`} />
      <span className="text-[0.75rem] font-bold capitalize">{state}</span>
    </span>
  );
}
