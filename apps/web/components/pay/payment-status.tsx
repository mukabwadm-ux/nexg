import { Check, type LucideIcon, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { WHATSAPP_URL } from '@/components/chat/whatsapp-button';

export type StatusTone = 'waiting' | 'success' | 'failed' | 'neutral';

const MARK: Record<StatusTone, string> = {
  waiting: 'bg-gold-soft text-gold-text',
  success: 'bg-success-bg text-success',
  failed: 'bg-danger-bg text-danger',
  neutral: 'bg-bg text-muted',
};

/**
 * The payment page's frame: a status panel and, beside it, what is being
 * paid. Presentational only; the page decides the state from the database.
 */
export function PaymentStatusLayout({
  tone,
  icon: Icon,
  title,
  message,
  children,
  aside,
}: {
  tone: StatusTone;
  icon: LucideIcon;
  title: string;
  message: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section
          aria-live="polite"
          className="border-border bg-surface rounded-2xl border p-6 sm:p-8"
        >
          <span className="relative inline-flex">
            {tone === 'waiting' && (
              <span
                aria-hidden="true"
                className="bg-gold/30 absolute inset-0 rounded-full motion-safe:animate-ping"
              />
            )}
            <span
              aria-hidden="true"
              className={`relative flex h-14 w-14 items-center justify-center rounded-full ${MARK[tone]}`}
            >
              <Icon className="h-6 w-6" />
            </span>
          </span>
          <h1 className="mt-5 text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[2rem]">
            {title}
          </h1>
          <div className="text-muted mt-2 max-w-[38rem] text-[0.9375rem] font-semibold leading-[1.7]">
            {message}
          </div>
          {children}
        </section>
        {aside}
      </div>
    </main>
  );
}

export type StepState = 'done' | 'current' | 'failed' | 'todo';

/** Where the order is: placed, paid, being prepared, delivered. */
export function OrderProgress({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol
      className="border-border mt-7 grid grid-cols-4 gap-2 border-t pt-6"
      aria-label="Order progress"
    >
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex flex-col items-start gap-2">
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute left-6 right-0 top-3 h-px ${
                step.state === 'done' ? 'bg-ink/40' : 'bg-border'
              }`}
            />
          )}
          <span
            aria-hidden="true"
            className={`relative flex h-6 w-6 items-center justify-center rounded-full text-[0.6875rem] font-extrabold ${
              step.state === 'done'
                ? 'bg-ink text-white'
                : step.state === 'current'
                  ? 'bg-gold text-ink ring-gold/30 ring-4'
                  : step.state === 'failed'
                    ? 'bg-danger-bg text-danger'
                    : 'border-border bg-surface text-muted border'
            }`}
          >
            {step.state === 'done' ? (
              <Check className="h-3.5 w-3.5" />
            ) : step.state === 'failed' ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              i + 1
            )}
          </span>
          <span
            className={`text-[0.75rem] font-bold leading-snug ${
              step.state === 'todo' ? 'text-muted' : 'text-ink'
            }`}
          >
            {step.label}
            <span className="sr-only">
              {step.state === 'done'
                ? ' (done)'
                : step.state === 'current'
                  ? ' (now)'
                  : step.state === 'failed'
                    ? ' (not done)'
                    : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** What is being paid, with the references somebody may need. */
export function PaymentSummary({
  amount,
  rows,
  reference,
  referenceLabel = 'Payment ref',
  heading = 'Your payment',
}: {
  amount: string;
  rows: { label: string; value: React.ReactNode }[];
  reference: string;
  referenceLabel?: string;
  heading?: string;
}) {
  return (
    <aside className="border-border bg-surface rounded-2xl border p-5 lg:sticky lg:top-24">
      <h2 className="text-lg font-extrabold">{heading}</h2>
      <dl className="mt-3 space-y-2.5 text-[0.8125rem] font-semibold">
        <div className="border-border flex items-baseline justify-between gap-4 border-b pb-3">
          <dt className="text-muted">Amount</dt>
          <dd className="text-[1.125rem] font-extrabold tabular-nums">{amount}</dd>
        </div>
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted shrink-0">{r.label}</dt>
            <dd className="min-w-0 break-words text-right">{r.value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted shrink-0">{referenceLabel}</dt>
          <dd className="min-w-0 break-all text-right tabular-nums">{reference}</dd>
        </div>
      </dl>
      <div className="border-border mt-5 border-t pt-4">
        <p className="text-[0.8125rem] font-extrabold">Need help with this payment?</p>
        <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-relaxed">
          Send us the reference and we will find it, whatever happened.
        </p>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-ink mt-3 inline-flex items-center gap-2 text-[0.8125rem] font-extrabold underline underline-offset-4"
        >
          <MessageCircle aria-hidden="true" className="h-4 w-4" />
          Chat with us on WhatsApp
        </a>
      </div>
    </aside>
  );
}

const primary =
  'bg-gold text-ink hover:bg-gold/90 focus-visible:ring-gold inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const secondary =
  'border-border text-ink hover:border-ink focus-visible:ring-gold inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2';

export function ActionRow({
  actions,
}: {
  actions: { label: string; href: string; external?: boolean; kind?: 'primary' | 'secondary' }[];
}) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {actions.map((a) =>
        a.external ? (
          <a key={a.label} href={a.href} className={a.kind === 'secondary' ? secondary : primary}>
            {a.label}
          </a>
        ) : (
          <Link
            key={a.label}
            href={a.href}
            className={a.kind === 'secondary' ? secondary : primary}
          >
            {a.label}
          </Link>
        ),
      )}
    </div>
  );
}
