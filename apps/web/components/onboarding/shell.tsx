'use client';

import * as React from 'react';

import { LivePreview } from './preview';
import { ResumeButton } from './resume-button';
import { ShellFrame } from './shell-frame';
import { useOnboarding } from './store';
import { STEPS } from './types';

/**
 * The merchant flow's shell: the shared frame, wired to the merchant store.
 *
 * Everything visual lives in ShellFrame, which the rider flow uses too. This
 * exists so the six merchant step files keep passing the four props they
 * always passed, and so the frame never has to know which flow it is in.
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

  return (
    <ShellFrame
      label="Merchant onboarding"
      step={step}
      totalSteps={6}
      minutesLeft={STEPS.find((s) => s.step === step)?.minutes ?? 0}
      save={save}
      preview={<LivePreview />}
      resume={<ResumeButton />}
      collapsedSummary={
        draft ? (
          <>
            <span className="min-w-0 truncate text-[0.8125rem] font-extrabold">
              {draft.trading_name || '[Your business]'}
            </span>
            <span className="text-muted flex shrink-0 items-center gap-2 text-[0.8125rem] font-bold">
              {readiness?.pct ?? 0}% ready
              <span className="text-gold-text underline underline-offset-4">See your card</span>
            </span>
          </>
        ) : null
      }
      eyebrow={eyebrow}
      title={title}
      {...(intro ? { intro } : {})}
      footer={footer}
    >
      {children}
    </ShellFrame>
  );
}

export { ContinueButton, FooterNote } from './shell-frame';
