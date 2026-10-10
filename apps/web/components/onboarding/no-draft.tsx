'use client';

import { Button } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { OnboardingShell } from './shell';

/**
 * What an application step shows when there is no application.
 *
 * These steps used to `return null` in this case, which renders
 * a white page on an HTTP 200 — no heading, no message, no way
 * out. It is reachable without doing anything strange: start on
 * your phone and open the documents link on a laptop, come back
 * to a bookmark a week later, or press Back after abandoning
 * halfway. Every one of those lands on a blank screen that
 * looks like the site is broken.
 *
 * `null` is still right while a draft is being fetched — that
 * flash is worth avoiding. The two cases just need telling
 * apart, which is the whole fix.
 */
export function NoDraft({
  step,
  eyebrow,
  startHref,
  what,
}: {
  step: number;
  eyebrow: string;
  startHref: string;
  what: string;
}) {
  const router = useRouter();

  return (
    <OnboardingShell
      step={step}
      eyebrow={eyebrow}
      title="We cannot find your application"
      intro={`There is no application open on this device, so there is nothing to ${what} yet. If you started on another phone or computer, sign in there — or begin here and it will follow you.`}
      footer={
        <Button size="lg" onClick={() => router.push(startHref)}>
          Start your application
        </Button>
      }
    >
      <div className="border-border bg-surface rounded-2xl border p-5">
        <p className="text-muted text-[0.8125rem] font-semibold leading-[1.7]">
          Nothing has been lost. An application is held against the account you
          started it with, so signing in on the device you began on brings it
          back exactly where you left it, documents included.
        </p>
      </div>
    </OnboardingShell>
  );
}
