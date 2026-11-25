import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import type { Metadata } from 'next';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

import { VerifyForm } from '../form';
import { KIND_LABELS, lookUp } from '../lookup';

export const dynamic = 'force-dynamic';
/* The answer must be the database's now, never a cached one. */
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Verify a document',
  robots: { index: false },
};

function day(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function kes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Is this NexG reference genuine? The QR code on a document links here with
 * its check code (?c=), which also shows who it was issued to and the amount.
 */
export default async function VerifyReference({
  params,
  searchParams,
}: {
  params: { ref: string };
  searchParams: { c?: string };
}) {
  const reference = decodeURIComponent(params.ref).trim().toUpperCase().slice(0, 40);
  const code = searchParams.c?.trim().slice(0, 40) || null;
  const verdict = await lookUp(reference, code);

  let body: React.ReactNode;
  if (!verdict) {
    body = (
      <div className="border-border mt-8 flex gap-3 rounded-2xl border bg-white p-5">
        <CircleAlert className="text-muted h-6 w-6 shrink-0" aria-hidden />
        <p className="text-[0.9375rem]">
          We could not check this reference just now. Please try again in a minute, or email
          finance@nexgapp.com.
        </p>
      </div>
    );
  } else if (!verdict.found || !verdict.kind) {
    body = (
      <div className="border-danger/30 bg-danger/5 mt-8 flex gap-3 rounded-2xl border p-5">
        <CircleX className="text-danger h-6 w-6 shrink-0" aria-hidden />
        <div>
          <p className="text-[1.0625rem] font-extrabold">Not a NexG document</p>
          <p className="text-muted mt-1 text-[0.9375rem]">
            We have no document with the reference <span className="font-mono">{reference}</span>.
            Check it was typed exactly as printed. If it was, do not rely on the document, and tell
            us at finance@nexgapp.com.
          </p>
        </div>
      </div>
    );
  } else {
    const isVoid = verdict.status === 'void';
    const rows: [string, string][] = [
      ['Document', KIND_LABELS[verdict.kind]],
      ['Reference', verdict.reference ?? reference],
      ['Issued', verdict.issued_on ? day(verdict.issued_on) : '–'],
      ['Status', isVoid ? 'Void (cancelled by a credit note)' : 'Valid'],
    ];
    if (verdict.details) {
      if (verdict.party) rows.push(['Issued to', verdict.party]);
      if (verdict.amount_cents != null) rows.push(['Amount', kes(verdict.amount_cents)]);
    }
    body = (
      <div
        className={`mt-8 rounded-2xl border p-5 ${
          isVoid ? 'border-warning/40 bg-warning/5' : 'border-success/30 bg-success/5'
        }`}
      >
        <div className="flex gap-3">
          {isVoid ? (
            <CircleAlert className="text-warning h-6 w-6 shrink-0" aria-hidden />
          ) : (
            <CircleCheck className="text-success h-6 w-6 shrink-0" aria-hidden />
          )}
          <p className="text-[1.0625rem] font-extrabold">
            {isVoid ? 'Genuine, but no longer valid' : 'Genuine NexG document'}
          </p>
        </div>
        <dl className="mt-4 divide-y divide-black/5 text-[0.9375rem]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {!verdict.details ? (
          <p className="text-muted mt-3 text-[0.8125rem]">
            Scan the QR code on the document to also see who it was issued to and the amount.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-14 sm:py-20">
        <h1 className="text-3xl font-extrabold tracking-tight">Verify a NexG document</h1>
        <p className="text-muted mt-2 text-[0.9375rem]">
          Issued by Nexgenius Concierge Limited, KRA PIN P052549908S.
        </p>
        {body}
        <VerifyForm initial={reference} />
      </main>
      <SiteFooter />
    </>
  );
}
