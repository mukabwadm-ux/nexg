import { Lock } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

/**
 * The pieces the host portal is assembled from.
 *
 * Three of these exist because of one rule that runs through
 * the whole portal: a host who is still setting up sees the
 * same navigation as one who is live, and every section that
 * cannot have content yet explains why and shows a sample.
 *
 * The alternative — hiding what is not ready — makes the
 * product look smaller than it is and gives somebody no idea
 * what finishing setup actually buys them. The alternative to
 * *that* — showing an empty table — reads as "nothing has
 * happened", which is a different and more discouraging lie.
 */

/** Nothing is ever rendered as a bare dash without meaning it. */
export const DASH = '—';

export function kes(cents: number | null | undefined): string {
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

export function when(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const that = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  if (that === today) return `Today ${clock(iso)}`;
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', {
    timeZone: 'Africa/Nairobi',
  });
  if (that === yesterday) return `Yesterday ${clock(iso)}`;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

/** `Good afternoon` by Nairobi time; `Welcome` while still in setup. */
export function greeting(live: boolean, firstName: string): string {
  if (!live) return `Welcome, ${firstName}`;
  const hour = Number(
    new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' }),
  );
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `Good ${part}, ${firstName}`;
}

/* ════════════════════════════════════════════════ the tiles */

/**
 * A tile in the 3×2 grid.
 *
 * `preview` marks a tile whose section has nothing real in it
 * yet. It is still a link — a locked section that cannot be
 * opened is a dead end, and the point of showing it is that
 * somebody can go and see what it will hold.
 */
export function Tile({
  href,
  title,
  note,
  chip,
  chipTone = 'plain',
  preview,
}: {
  href: string;
  title: string;
  note: string;
  chip?: string | null;
  chipTone?: 'plain' | 'gold' | 'danger' | 'good';
  preview?: boolean;
}) {
  const chipClass =
    chipTone === 'gold'
      ? 'bg-gold text-ink'
      : chipTone === 'danger'
        ? 'bg-danger text-white'
        : chipTone === 'good'
          ? 'bg-success text-white'
          : 'bg-white/15 text-white';

  return (
    <Link
      href={href}
      className="group bg-ink relative flex min-h-[9.5rem] flex-col justify-end overflow-hidden rounded-xl p-4 text-white transition-transform hover:-translate-y-0.5"
    >
      {/* The design calls for a photograph here. There is none
          yet, so this is the branded block rather than a stock
          image of somebody else's building. */}
      <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
      <span className="text-muted-light absolute left-4 top-4 text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] opacity-60">
        Photo
      </span>
      {chip ? (
        <span
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold ${chipClass}`}
        >
          {chip}
        </span>
      ) : null}
      <span className="relative">
        <span className="flex items-center gap-2 text-[1.0625rem] font-extrabold tracking-tight">
          {title}
          {preview ? (
            <span className="text-gold text-[0.6875rem] font-extrabold">· preview</span>
          ) : null}
        </span>
        <span className="mt-1 block text-[0.75rem] font-semibold leading-[1.5] text-white/60">
          {note}
        </span>
      </span>
      <span className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm transition-colors group-hover:bg-white/20">
        →
      </span>
    </Link>
  );
}

/* ═══════════════════════════════════════ the honest empties */

/**
 * The watermark over sample rows.
 *
 * Sample data in a product is dangerous: somebody screenshots
 * it, somebody quotes it, somebody builds a plan on it. So the
 * sample says what it is, on the row, not in a caption above
 * the table that scrolls away.
 */
export function PreviewBadge() {
  return (
    <span className="border-gold/50 bg-gold-soft text-gold-text -rotate-2 rounded border border-dashed px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide">
      Preview · live once you go live
    </span>
  );
}

export function LockedSection({
  title,
  why,
  unlocks,
  children,
}: {
  title: string;
  why: string;
  unlocks: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="border-border bg-surface rounded-xl border p-5">
        <div className="flex items-start gap-3">
          <span className="bg-bg text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Lock className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">{title}</h2>
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.6]">{why}</p>
            <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">{unlocks}</p>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ═════════════════════════════════════════ small furniture */

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
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'plain' | 'muted';
}) {
  return (
    <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-0">
      <span className="text-muted text-[0.8125rem] font-semibold">{label}</span>
      <span className="text-right">
        <span
          className={`block text-[0.8125rem] font-extrabold tabular-nums ${
            tone === 'muted' ? 'text-muted-light' : ''
          }`}
        >
          {value}
        </span>
        {note ? (
          <span className="text-muted-light block text-[0.6875rem] font-semibold">{note}</span>
        ) : null}
      </span>
    </div>
  );
}

/** A thing that will not fix itself, in gold. */
export function Attention({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="border-gold/40 bg-gold-soft rounded-xl border p-4">
      <div className="flex items-start gap-2.5">
        <span className="text-gold-text mt-0.5 text-sm" aria-hidden="true">
          ⚠
        </span>
        <div className="min-w-0">
          <h2 className="text-[0.875rem] font-extrabold leading-snug tracking-tight">{title}</h2>
          <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">{body}</p>
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
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
      className="border-border bg-surface hover:border-ink flex flex-col gap-1.5 rounded-xl border p-3.5 transition-colors"
    >
      <span className="text-muted" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[0.8125rem] font-extrabold leading-tight">{title}</span>
      <span className="text-muted-light text-[0.6875rem] font-semibold leading-tight">{note}</span>
    </Link>
  );
}

/**
 * The readiness ring.
 *
 * Drawn rather than described because five-of-five is a shape
 * somebody reads at a glance and "83%" is a number they have to
 * think about. The five labels are listed beside it, because
 * the ring says how far and only the list says what is left.
 */
export function Ring({ done, of }: { done: number; of: number }) {
  const pct = of > 0 ? done / of : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-[4.5rem] w-[4.5rem]" role="img"
         aria-label={`${done} of ${of} ready`}>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-border" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-gold"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text
        x="32"
        y="30"
        textAnchor="middle"
        className="fill-ink text-[0.9rem] font-extrabold"
        style={{ fontSize: '0.95rem', fontWeight: 800 }}
      >
        {done}/{of}
      </text>
      <text
        x="32"
        y="42"
        textAnchor="middle"
        className="fill-muted-light"
        style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.08em' }}
      >
        READY
      </text>
    </svg>
  );
}

export function Check({ done, label, note }: { done: boolean; label: string; note?: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className={`mt-[0.15rem] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[0.5625rem] font-extrabold ${
          done
            ? 'border-success bg-success text-white'
            : 'border-border-strong text-muted-light'
        }`}
      >
        {done ? '✓' : ''}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.75rem] font-semibold leading-snug">{label}</span>
        {note ? (
          <span className="text-muted-light block text-[0.6875rem] font-semibold">{note}</span>
        ) : null}
      </span>
    </li>
  );
}
