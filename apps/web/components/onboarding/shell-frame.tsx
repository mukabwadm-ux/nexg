'use client';

import { Button } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

import { Logo } from '@/components/logo';

/**
 * The frame both onboarding flows sit in.
 *
 * Two columns on a desktop: what we are asking on the left, what the
 * applicant is building on the right. Below 1100 px the preview cannot be a
 * column, so it collapses into a bar that opens it as a sheet — it is the
 * thing that makes the flow feel like progress rather than paperwork, and
 * dropping it on a phone would cost exactly the people most likely to be on
 * one.
 *
 * It takes the preview, the resume button and the save state as props rather
 * than reading a store, because merchants and riders have different stores
 * and different cards but the same frame. Each flow wraps this with its own
 * thin shell; nothing here knows which flow it is drawing.
 */

export interface SaveState {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}

export function ShellFrame({
  label,
  step,
  totalSteps,
  minutesLeft,
  save,
  preview,
  collapsedSummary,
  resume,
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  /** "Merchant onboarding", "Rider application". */
  label: string;
  step: number;
  totalSteps: number;
  minutesLeft: number;
  save: SaveState;
  preview: React.ReactNode;
  /** What the collapsed bar says below 1100 px. Null hides the bar. */
  collapsedSummary: React.ReactNode | null;
  resume: React.ReactNode;
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const segments = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="bg-bg min-h-screen">
      {/* ------------------------------------------------------------ top bar */}
      <header className="border-border bg-bg sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-[4.75rem] max-w-[90rem] items-center gap-4 px-4 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <Logo className="h-7 w-auto" />
            <span aria-hidden="true" className="bg-border-strong hidden h-6 w-px sm:block" />
            <span className="text-muted hidden text-sm font-bold sm:block">{label}</span>
          </Link>

          <div className="flex flex-1 items-center justify-center gap-4">
            <ol className="flex items-center gap-1.5" aria-label={`Step ${step} of ${totalSteps}`}>
              {segments.map((n) => (
                <li
                  key={n}
                  aria-current={n === step ? 'step' : undefined}
                  className={`h-1.5 w-8 rounded-full transition-colors sm:w-14 ${
                    n <= step ? 'bg-gold' : 'bg-border-strong'
                  }`}
                />
              ))}
            </ol>
            <p className="text-muted hidden whitespace-nowrap text-[0.8125rem] font-semibold lg:block">
              {step} of {totalSteps} · ~{minutesLeft} min left
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            {/* A "Saved" tick, because the flow promised it saves as you go
                and a promise with no evidence is not reassuring. */}
            <span aria-live="polite" className="text-muted-light hidden text-xs font-bold sm:block">
              {save.saving ? 'Saving…' : save.error ? '' : save.savedAt ? 'Saved' : ''}
            </span>
            {save.error && (
              <span role="alert" className="text-danger text-xs font-bold">
                Not saved — retrying
              </span>
            )}
            {resume}
            <Link
              href="/help"
              className="text-muted hover:text-ink text-sm font-bold transition-colors"
            >
              Help
            </Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------- preview bar, below 1100px */}
      {collapsedSummary && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="border-border bg-surface sticky top-[4.75rem] z-20 flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left xl:hidden"
        >
          {collapsedSummary}
        </button>
      )}

      {/* --------------------------------------------------------------- body */}
      <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-[4.5rem]">
        <main>
          <p className="text-gold-text text-xs font-extrabold uppercase tracking-[0.14em]">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-[2.75rem]">
            {title}
          </h1>
          {intro && (
            <p className="text-muted mt-4 max-w-xl text-[0.9375rem] leading-[1.8] sm:text-base">
              {intro}
            </p>
          )}

          <div className="mt-8">{children}</div>

          <div className="mt-10 flex flex-wrap items-center gap-3">{footer}</div>
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-[6.5rem]">{preview}</div>
        </aside>
      </div>

      {/* ------------------------------------------------------ preview sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setSheetOpen(false)}
            className="bg-ink/40 absolute inset-0"
          />
          <div className="bg-bg absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 pb-8">
            <div className="bg-border-strong mx-auto mb-4 h-1 w-10 rounded-full" />
            {preview}
            <Button variant="outline" block className="mt-4" onClick={() => setSheetOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The footer's primary action, with the gold arrow from the artboards. */
export function ContinueButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button size="lg" {...props}>
      <span className="flex items-center gap-3">
        {children}
        <span aria-hidden="true" className="text-gold">
          &rarr;
        </span>
      </span>
    </Button>
  );
}

export function FooterNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-light text-[0.8125rem] font-semibold">{children}</p>;
}

/**
 * The black readiness card. The checks differ between flows — a merchant has
 * "First 5 menu items", a rider has "Kit & onboarding" — so they are passed
 * in, but the ring, the arc animation and the tick are shared.
 *
 * The percentage is computed in the database by fn_merchant_readiness or
 * fn_rider_readiness, never here, so the number the applicant watches climb
 * is the same one the console shows.
 */
export function ReadyRing({
  heading,
  pct,
  checks,
  state,
}: {
  heading: string;
  pct: number;
  checks: { key: string; label: string }[];
  state: Record<string, unknown> | null;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="bg-ink rounded-2xl p-5 text-white">
      <p className="text-gold text-xs font-extrabold uppercase tracking-[0.14em]">{heading}</p>

      <div className="mt-4 flex items-center gap-5">
        <div className="relative h-[5.25rem] w-[5.25rem] shrink-0">
          <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
            <circle
              cx="42"
              cy="42"
              r={radius}
              fill="none"
              stroke="rgb(255 255 255 / 0.18)"
              strokeWidth="7"
            />
            <circle
              cx="42"
              cy="42"
              r={radius}
              fill="none"
              stroke="rgb(var(--gold-rgb))"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct / 100)}
              className="transition-[stroke-dashoffset] duration-[250ms] ease-out"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-extrabold">
            {pct}%
          </span>
        </div>

        <ul className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2.5">
          {checks.map((check) => {
            const done = state?.[check.key] === true;
            return (
              <li key={check.key} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full ${
                    done ? 'bg-gold text-ink' : 'bg-white'
                  }`}
                >
                  {done && (
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor">
                      <path
                        d="M20 6 9 17l-5-5"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={`text-[0.6875rem] font-bold leading-tight ${
                    done ? 'text-white' : 'text-white/55'
                  }`}
                >
                  {check.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
