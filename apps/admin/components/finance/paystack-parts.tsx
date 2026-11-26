import Link from 'next/link';
import * as React from 'react';

import { Pill } from '@/components/portal/kit';

/* The pieces the Finance › Paystack tabs share. */

export const merchantHref = (id: string) => `/merchants/${id}#paystack-payouts`;
export const merchantCommissionHref = (id: string) => `/merchants/${id}#commission`;
export const hostHref = (id: string) => `/hotels?tab=hosts&selected=${id}`;
export const riderHref = (id: string) => `/riders/${id}`;

/** A party's name, linked only when this person can open its page (href null otherwise). */
export function PartyLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span className="font-bold">{children}</span>;
  return (
    <Link href={href} className="font-bold underline underline-offset-4">
      {children}
    </Link>
  );
}

export function ModePill({ test }: { test: boolean }) {
  return <Pill tone={test ? 'amber' : 'green'}>{test ? 'Test' : 'Live'}</Pill>;
}

/** Something that could not be read: said plainly, never shown as zero. */
export function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-light py-8 text-center text-sm">{children}</p>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-muted mt-2 text-xs font-semibold">{children}</p>;
}

/**
 * A plain table that scrolls sideways on a narrow screen. A column of figures
 * is headed { label, right: true }.
 */
export function Table({
  caption,
  heads,
  children,
}: {
  caption: string;
  heads: (string | { label: string; right: true })[];
  children: React.ReactNode;
}) {
  return (
    <div className="border-border mt-4 overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-bg text-muted text-xs font-bold">
          <tr>
            {heads.map((h) => {
              const label = typeof h === 'string' ? h : h.label;
              return (
                <th
                  key={label}
                  scope="col"
                  className={`px-4 py-2.5 ${typeof h === 'string' ? '' : 'text-right'}`}
                >
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-border divide-y align-top tabular-nums">{children}</tbody>
      </table>
    </div>
  );
}

export const cell = 'px-4 py-2.5';
export const figure = 'whitespace-nowrap px-4 py-2.5 text-right';
export const sub = 'text-muted-light block text-xs font-semibold';
