import * as React from 'react';

import { DASH } from '@/components/live/shared';

/**
 * The vocabulary the Finance screens share.
 *
 * Money is rendered one way everywhere in here. Two formats on
 * one screen — 1,250 beside 1.25k beside KES 1,250.00 — is how a
 * figure gets misread in a meeting, and these are the screens
 * where a misread figure gets paid out.
 */

/** Whole shillings. The ledger is in cents; nothing above it is. */
export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return DASH;
  const n = Math.round(Number(cents) / 100);
  return n.toLocaleString('en-KE');
}

/** With the unit, for anywhere the column header does not carry it. */
export function kesMoney(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? `KES ${DASH}` : `KES ${money(cents)}`;
}

/**
 * Signed, for anything that can go either way — a partner
 * balance, a variance. The sign is never dropped: a negative
 * payout rendered as a positive one is the single most expensive
 * formatting bug this screen could have.
 */
export function signedMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return DASH;
  const n = Math.round(Number(cents) / 100);
  return `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-KE')}`;
}

export function pct(bps: number | null | undefined): string {
  return bps === null || bps === undefined ? DASH : `${(Number(bps) / 100).toFixed(1)}%`;
}

export function shortDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;
}

export function stamp(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;
}

/**
 * The change against the same days of the previous month.
 *
 * Returns null rather than a percentage when there is nothing to
 * compare against. A first month is not infinite growth, and
 * showing it as a number invites somebody to repeat it.
 */
export function delta(now: number, prior: number): { text: string; up: boolean } | null {
  if (!prior) return null;
  const change = ((now - prior) / Math.abs(prior)) * 100;
  if (!Number.isFinite(change)) return null;
  return {
    text: `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`,
    up: change >= 0,
  };
}

/**
 * A figure, what it is, and how it moved.
 *
 * `note` is where the tile says what it actually counts.
 * "Contribution, not profit" belongs beside the number, not in a
 * glossary nobody opens.
 */
export function Tile({
  label,
  value,
  note,
  change,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  change?: { text: string; up: boolean } | null;
  tone?: 'plain' | 'good' | 'warn';
}) {
  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <p className="text-muted-light text-[0.6875rem] font-extrabold tracking-wide uppercase">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums ${
          tone === 'warn' ? 'text-danger' : ''
        }`}
      >
        {value}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {change ? (
          <span
            className={`text-[0.6875rem] font-extrabold ${
              change.up ? 'text-success' : 'text-danger'
            }`}
          >
            {change.text}
          </span>
        ) : null}
        {note ? <span className="text-muted-light text-[0.6875rem] font-semibold">{note}</span> : null}
      </div>
    </div>
  );
}

/**
 * How old the screen is.
 *
 * Shown on every Finance tab, always, not only when something is
 * wrong. A freshness indicator that appears only on failure
 * teaches people that its absence means live — and then the one
 * time it is missing because the check itself broke, nobody
 * notices.
 */
export function Freshness({
  asOf,
  stale,
  failing,
  throughEntry,
}: {
  asOf: string | null;
  stale: number;
  failing: number;
  throughEntry: number | null;
}) {
  const bad = stale > 0 || failing > 0;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-1.5 text-[0.6875rem] font-semibold ${
        bad ? 'border-danger/40 bg-danger/5 text-danger' : 'border-border bg-bg text-muted'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${bad ? 'bg-danger' : 'bg-success'}`} />
      {bad ? (
        <span className="font-extrabold">
          {failing > 0
            ? `${failing} of these figures stopped rebuilding`
            : `${stale} of these figures are behind`}
        </span>
      ) : (
        <span>
          True as of <span className="font-extrabold">{stamp(asOf)}</span>
        </span>
      )}
      {throughEntry ? (
        <span className="opacity-70">· through ledger entry {throughEntry.toLocaleString()}</span>
      ) : null}
    </div>
  );
}

/**
 * The empty state, which says why it is empty.
 *
 * On these screens "nothing here" has at least two meanings —
 * nothing happened, or nothing reached us — and they call for
 * opposite responses.
 */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
      {children}
    </p>
  );
}

export function SectionTitle({
  children,
  note,
  right,
}: {
  children: React.ReactNode;
  note?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h2 className="text-[0.9375rem] font-extrabold tracking-tight">{children}</h2>
        {note ? <p className="text-muted-light mt-0.5 text-xs font-semibold">{note}</p> : null}
      </div>
      {right}
    </div>
  );
}
