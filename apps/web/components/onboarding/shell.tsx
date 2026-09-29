'use client';

import { Button } from '@nexg/ui';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { BrandMark } from '@/components/brand-mark';

import { LivePreview } from './preview';
import { ResumeButton } from './resume-button';
import { useOnboarding } from './store';
import { STEPS } from './types';

/**
 * The frame every onboarding step sits in.
 *
 * Two columns on a desktop: what we are asking on the left, what the merchant
 * is building on the right. Below 1100 px the preview cannot be a column, so
 * it collapses into a bar that opens it as a sheet — it is the thing that
 * makes the flow feel like progress rather than paperwork, and dropping it on
 * a phone would cost exactly the merchants most likely to be on one.
 */
export function OnboardingShell({
  step,
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  step: number;
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const { draft, readiness, save } = useOnboarding();
  const minutes = STEPS.find((s) => s.step === step)?.minutes ?? 0;
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <div className="bg-bg min-h-screen">
      {/* ------------------------------------------------------------ top bar */}
      <header className="border-border bg-bg sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-[4.75rem] max-w-[90rem] items-center gap-4 px-4 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <BrandMark className="h-8 w-auto" priority />
            <span aria-hidden="true" className="bg-border-strong hidden h-6 w-px sm:block" />
            <span className="text-muted hidden text-sm font-bold sm:block">
              Merchant onboarding
            </span>
          </Link>

          <div className="flex flex-1 items-center justify-center gap-4">
            <ol className="flex items-center gap-1.5" aria-label={`Step ${step} of 6`}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
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
              {step} of 6 · ~{minutes} min left
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            {/* A "Saved" tick, because the flow promised it saves as you go and
                a promise with no evidence is not reassuring. */}
            <span aria-live="polite" className="text-muted-light hidden text-xs font-bold sm:block">
              {save.saving ? 'Saving…' : save.error ? '' : save.savedAt ? 'Saved' : ''}
            </span>
            {save.error && (
              <span role="alert" className="text-danger text-xs font-bold">
                Not saved — retrying
              </span>
            )}
            <ResumeButton />
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
      {draft && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="border-border bg-surface sticky top-[4.75rem] z-20 flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left xl:hidden"
        >
          <span className="min-w-0 truncate text-[0.8125rem] font-extrabold">
            {draft.trading_name || '[Your business]'}
          </span>
          <span className="text-muted flex shrink-0 items-center gap-2 text-[0.8125rem] font-bold">
            {readiness?.pct ?? 0}% ready
            <span className="text-gold-text underline underline-offset-4">See your card</span>
          </span>
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
          <div className="sticky top-[6.5rem]">
            <LivePreview />
          </div>
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
            <LivePreview />
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

export function WhatsAppIcon() {
  return <MessageCircle className="h-4 w-4" aria-hidden="true" />;
}
