import * as React from 'react';

/** The vocabulary both partner dashboards share. */

export const DASH = '[—]';

/*
 * Non-finite is unknown, not a number.
 *
 * The null check alone was not enough. `Math.min()` over an
 * empty list is `Infinity` and `Math.max()` is `-Infinity`,
 * both of which are numbers and neither of which is null — so
 * a merchant with nothing on their menu was shown a price range
 * of "KES ∞ to KES -∞". NaN arrives the same way, from an
 * arithmetic step on a column that came back null.
 *
 * Ground rule 3 says we never invent a number. Infinity is an
 * invented number with a straight face, so it formats as the
 * same [—] everything else unknown does.
 */
function known(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}

export function kes(cents: number | null | undefined): string {
  const n = known(cents);
  return n === null ? `KES ${DASH}` : `KES ${Math.round(n / 100).toLocaleString('en-KE')}`;
}

/** Some of this database keeps whole shillings rather than cents. */
export function kesWhole(value: number | null | undefined): string {
  const n = known(value);
  return n === null ? `KES ${DASH}` : `KES ${Math.round(n).toLocaleString('en-KE')}`;
}

export function num(value: number | null | undefined): string {
  const n = known(value);
  return n === null ? DASH : String(n);
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

export function day(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

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

export function Panel({
  title,
  note,
  children,
  action,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-2xl border p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[0.9375rem] font-extrabold tracking-tight">{title}</h2>
        {note && <span className="text-muted-light text-[0.6875rem] font-semibold">{note}</span>}
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A number on the dashboard.
 *
 * `[—]` means nobody has set this, which is a different thing from
 * zero. Both appear on these screens and conflating them is how a
 * partner concludes they earned nothing when in fact nobody has
 * published a rate.
 */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'danger' | 'gold' | 'success';
}) {
  return (
    <div className="border-border bg-surface rounded-2xl border p-4">
      <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.08em]">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-extrabold tracking-tight ${
          tone === 'danger'
            ? 'text-danger'
            : tone === 'success'
              ? 'text-success'
              : tone === 'gold'
                ? 'text-gold-text'
                : ''
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">{hint}</p>}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-[0.9375rem] font-extrabold">{title}</p>
      <p className="text-muted mx-auto mt-1 max-w-md text-[0.8125rem] font-semibold">{body}</p>
    </div>
  );
}

/** The readiness ring, as a bar. Floored, so it never over-claims. */
export function Progress({ pct, label }: { pct: number; label?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[0.75rem] font-bold">{label ?? 'Setup'}</span>
        <span className="text-[0.75rem] font-extrabold tabular-nums">{pct}%</span>
      </div>
      <div className="bg-bg mt-1 h-2 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-gold'}`}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
