import Link from 'next/link';
import * as React from 'react';

import { DASH } from './bits';

/**
 * The pieces every host module page is built from.
 *
 * The 23 boards share a skeleton: a serif title with a lead, a
 * control row, a KPI strip, a table, and a right rail. Building
 * that once means a new module is a data query and a column
 * list rather than another four hundred lines of layout — and
 * it means the eighteenth page cannot quietly drift from the
 * first.
 */

/** A KPI tile. The note is where the figure says what it counts. */
export function Kpi({
  label,
  value,
  note,
  tone = 'plain',
  href,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'plain' | 'gold' | 'danger' | 'good';
  href?: string;
}) {
  const toneClass =
    tone === 'gold'
      ? 'text-gold-text'
      : tone === 'danger'
        ? 'text-danger'
        : tone === 'good'
          ? 'text-success'
          : 'text-muted-light';

  const inner = (
    <>
      <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1.5 text-[1.5rem] font-extrabold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      {note ? <p className={`mt-1.5 text-[0.6875rem] font-extrabold ${toneClass}`}>{note}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="border-border bg-surface hover:border-ink block rounded-xl border p-4 transition-colors"
      >
        {inner}
      </Link>
    );
  }
  return <div className="border-border bg-surface rounded-xl border p-4">{inner}</div>;
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{children}</div>
  );
}

/**
 * The control row: segmented tabs as links.
 *
 * Routes rather than client state, so a filtered view can be
 * sent to a colleague and arrive filtered. A tab that only
 * exists in memory is a tab nobody can share.
 */
export function Segmented({
  base,
  param,
  current,
  options,
}: {
  base: string;
  param: string;
  current: string;
  options: { key: string; label: string; count?: number | null }[];
}) {
  return (
    <div className="border-border-strong bg-bg flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
      {options.map((o) => {
        const on = o.key === current;
        const href = o.key === options[0]?.key ? base : `${base}?${param}=${o.key}`;
        return (
          <Link
            key={o.key}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold transition-colors ${
              on ? 'bg-ink text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
            {o.count ? <span className="ml-1.5 opacity-70">{o.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

/** A table that states why it is empty rather than showing nothing. */
export function Table({
  head,
  children,
  empty,
  caption,
}: {
  head: string[];
  children: React.ReactNode;
  empty?: string;
  caption?: string;
}) {
  const rows = React.Children.count(children);
  return (
    <div className="border-border bg-surface overflow-hidden rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-border bg-bg border-b">
            <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
              {head.map((h) => (
                <th
                  key={h}
                  className={`px-4 py-2 ${h.startsWith('>') ? 'text-right' : ''}`}
                >
                  {h.replace(/^>/, '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === 0 ? (
              <tr>
                <td colSpan={head.length}>
                  <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                    {empty ?? 'Nothing here yet.'}
                  </p>
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
      {caption ? (
        <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

export function Td({
  children,
  strong,
  right,
  muted,
  note,
}: {
  children: React.ReactNode;
  strong?: boolean;
  right?: boolean;
  muted?: boolean;
  note?: string;
}) {
  return (
    <td
      className={`px-4 py-3 ${right ? 'text-right tabular-nums' : ''} ${
        strong ? 'font-extrabold' : muted ? 'text-muted-light' : 'text-muted'
      }`}
    >
      {children}
      {note ? (
        <span className="text-muted-light block text-[0.6875rem] font-semibold">{note}</span>
      ) : null}
    </td>
  );
}

export function Tr({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'plain' | 'danger' | 'warn';
}) {
  return (
    <tr
      className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
        tone === 'danger' ? 'bg-danger/5' : tone === 'warn' ? 'bg-warn/5' : ''
      }`}
    >
      {children}
    </tr>
  );
}

const PILL: Record<string, string> = {
  good: 'bg-success/10 text-success',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info-bg text-info',
  gold: 'bg-gold-soft text-gold-text',
  plain: 'bg-bg text-muted',
};

export function Pill({
  children,
  tone = 'plain',
}: {
  children: React.ReactNode;
  tone?: keyof typeof PILL;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${PILL[tone]}`}
    >
      {children}
    </span>
  );
}

/** A dot before a word, for priority. */
export function Dot({ tone }: { tone: 'danger' | 'warn' | 'good' | 'plain' }) {
  const c =
    tone === 'danger'
      ? 'bg-danger'
      : tone === 'warn'
        ? 'bg-gold'
        : tone === 'good'
          ? 'bg-success'
          : 'bg-border-strong';
  return <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${c}`} aria-hidden="true" />;
}

/** The dark card in the right rail that explains how something works. */
export function HowItWorks({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-ink rounded-xl p-4 text-white">
      <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
        {title}
      </h2>
      <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">{children}</p>
    </section>
  );
}

/** Two-column body: main and a 21rem rail, stacking on a phone. */
export function TwoColumn({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-4">{children}</div>
      <aside className="space-y-4">{rail}</aside>
    </div>
  );
}

/** A horizontal bar chart row, for "what guests ask for". */
export function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted w-32 shrink-0 truncate text-[0.75rem] font-semibold">
        {label}
      </span>
      <span className="bg-bg h-5 flex-1 overflow-hidden rounded">
        <span
          className="bg-gold block h-full rounded"
          style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }}
        />
      </span>
      <span className="text-muted-light w-8 shrink-0 text-right text-[0.75rem] font-extrabold tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** A labelled value in a rail panel. */
export function Fact({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="border-border flex items-start justify-between gap-3 border-b px-4 py-2.5 last:border-0">
      <span className="text-muted text-[0.8125rem] font-semibold">{label}</span>
      <span className="text-right text-[0.8125rem] font-extrabold">{value ?? DASH}</span>
    </div>
  );
}
