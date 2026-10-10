'use client';

import { Button } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { RiderShell } from './rider-shell';

/**
 * The rider half of the same dead end.
 *
 * `step-documents` returned `null` when there was no draft,
 * which is a white page on an HTTP 200 — reachable by opening
 * the documents link on a second device, or coming back to a
 * bookmark. See the merchant `NoDraft` for the rest of it.
 */
export function RiderNoDraft() {
  const router = useRouter();

  return (
    <RiderShell
      step={4}
      eyebrow="Documents"
      title="We cannot find your application"
      intro="There is no rider application open on this device, so there is nothing to upload against yet. If you started on another phone, sign in there — or begin here and it will follow you."
      footer={
        <Button size="lg" onClick={() => router.push('/riders/apply/start')}>
          Start your application
        </Button>
      }
    >
      <div className="border-border bg-surface rounded-2xl border p-5">
        <p className="text-muted text-[0.8125rem] font-semibold leading-[1.7]">
          Nothing has been lost. An application is held against the account you
          started it with, so signing in on the device you began on brings it
          back exactly where you left it.
        </p>
      </div>
    </RiderShell>
  );
}
