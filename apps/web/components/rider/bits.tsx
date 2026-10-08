import Link from 'next/link';
import * as React from 'react';

import type { RiderAttentionRow } from './types';

/**
 * The pieces the rider dashboard is built from.
 *
 * The rule these all serve: never a projected figure. Not
 * "you could earn", not "riders in your zone average", not an
 * extrapolated day. A rider shown a number they then do not
 * make will not believe the next one, and they would be right
 * not to. Everything here is money already earned or a rate
 * card line that already exists.
 */

export const DASH = '—';

/** Rider money is in whole shillings in the earning tables. */
export function kesh(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return `KES ${DASH}`;
  return `KES ${Math.round(Number(amount)).toLocaleString('en-KE')}`;
}

/** Order money is in cents. Two units, two functions, no guessing. */
export function kesc(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return `KES ${DASH}`;
  return `KES ${Math.round(Number(cents) / 100).toLocaleString('en-KE')}`;
}

export function clock(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;
}

export function partOfDay(): string {
  const hour = Number(
    new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }),
  );
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

export function Tile({
  icon,
  value,
  label,
  note,
  noteTone = 'plain',
}: {
  icon?: string;
  value: string;
  label: string;
  note?: string;
  noteTone?: 'plain' | 'gold' | 'danger' | 'good';
}) {
  const toneClass =
    noteTone === 'gold'
      ? 'text-gold'
      : noteTone === 'danger'
        ? 'text-danger'
        : noteTone === 'good'
          ? 'text-success'
          : 'text-muted-light';

  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <div className="flex items-start gap-2.5">
        {icon ? (
          <span
            className="bg-gold-soft text-gold-text flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[0.75rem] font-extrabold"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-[1.5rem] font-extrabold leading-none tracking-tight tabular-nums">
            {value}
          </p>
          <p className="text-muted mt-1 text-[0.75rem] font-semibold">{label}</p>
          {note ? (
            <p className={`mt-0.5 text-[0.6875rem] font-extrabold ${toneClass}`}>{note}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PreviewBadge() {
  return (
    <span className="border-gold/50 bg-gold-soft text-gold-text -rotate-2 inline-block rounded border border-dashed px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide">
      Preview · live once you go live
    </span>
  );
}

const TONE: Record<string, string> = {
  danger: 'border-danger/30 bg-danger/5',
  warn: 'border-warn/30 bg-warn/5',
  info: 'border-info/30 bg-info/5',
  good: 'border-success/30 bg-success/5',
};

const TITLE_TONE: Record<string, string> = {
  danger: 'text-danger',
  warn: 'text-warn',
  info: 'text-info',
  good: 'text-success',
};

export function Attention({ a }: { a: RiderAttentionRow }) {
  return (
    <section className={`rounded-xl border p-4 ${TONE[a.tone] ?? 'border-border bg-surface'}`}>
      <h3 className={`text-[0.875rem] font-extrabold leading-snug ${TITLE_TONE[a.tone] ?? ''}`}>
        {a.title}
      </h3>
      <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">{a.body}</p>
      <Link
        href={a.href}
        className="text-gold-text mt-2.5 inline-block text-[0.75rem] font-extrabold hover:underline"
      >
        {a.action} →
      </Link>
    </section>
  );
}

export function QuickAction({
  href,
  icon,
  title,
  note,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-bg hover:border-ink flex flex-col gap-1.5 rounded-xl border p-3.5 transition-colors"
    >
      <span className="text-muted" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[0.8125rem] font-extrabold leading-tight">{title}</span>
      <span className="text-muted-light text-[0.6875rem] font-semibold leading-tight">{note}</span>
    </Link>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-xl border">
      <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-[0.875rem] font-extrabold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'muted';
}) {
  return (
    <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-0">
      <span className="text-muted text-[0.8125rem] font-semibold">{label}</span>
      <span
        className={`text-[0.8125rem] font-extrabold tabular-nums ${
          tone === 'muted' ? 'text-muted-light' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
