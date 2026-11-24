'use client';

import { Button, getCaptchaToken } from '@nexg/ui';
import { ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { sendHostPasswordSetupLink } from '@/app/(customer)/sign-in/actions';

/**
 * What both host forms on /hosts show once `applyAsHost` succeeds: the
 * welcome email (set-password link), sent after Supabase's one-email-a-minute
 * gap, and the next steps into the workspace.
 */

/* Supabase sends one auth email per address per minute. */
export const EMAIL_GAP_MS = 61_000;

export type HostDone = {
  email: string;
  reference?: string;
  welcome: 'sending' | 'waiting' | 'sent' | 'failed';
  message?: string;
  wait?: number;
  imported?: { property: boolean; photo: boolean };
};

export function useHostWelcome() {
  const [done, setDone] = React.useState<HostDone | null>(null);

  /* The welcome email, waiting out Supabase's one-email-a-minute limit when
     the code was sent moments ago. */
  const start = React.useCallback(async (base: HostDone, sentAt: number) => {
    setDone(base);
    const wait = sentAt + EMAIL_GAP_MS - Date.now();
    if (wait > 0) {
      setDone({ ...base, welcome: 'waiting', wait: Math.ceil(wait / 1000) });
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    setDone({ ...base, welcome: 'sending' });
    let result = await sendHostPasswordSetupLink(await getCaptchaToken());
    if (!result.ok && result.rateLimited) {
      setDone({ ...base, welcome: 'waiting', wait: Math.ceil(EMAIL_GAP_MS / 1000) });
      await new Promise((resolve) => setTimeout(resolve, EMAIL_GAP_MS));
      result = await sendHostPasswordSetupLink(await getCaptchaToken());
    }
    setDone({ ...base, welcome: result.ok ? 'sent' : 'failed', message: result.message });
  }, []);

  /* A visible countdown while the welcome email waits. */
  React.useEffect(() => {
    if (done?.welcome !== 'waiting' || !done.wait) return;
    const timer = setTimeout(
      () =>
        setDone((d) => (d && d.welcome === 'waiting' && d.wait ? { ...d, wait: d.wait - 1 } : d)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [done]);

  return { done, start };
}

export function HostWelcome({ done, className }: { done: HostDone; className?: string }) {
  return (
    <div className={className ?? 'rounded-2xl border border-[#ECE8DF] bg-white p-6 sm:p-8'}>
      <p className="flex items-center gap-2 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-[#1F7A3A]">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Host account created
      </p>
      <h3 className="mt-2 text-[1.5rem] font-extrabold leading-tight tracking-tight">
        Welcome to NexG Hosts.
      </h3>

      <div
        role="status"
        className="mt-4 flex items-start gap-3 rounded-xl bg-[#F6F3EC] p-4 text-sm font-semibold leading-[1.6] text-[#3A352B]"
      >
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#B8901F]" aria-hidden="true" />
        <span>
          {done.welcome === 'sent' ? (
            <>
              We sent your welcome email to <strong>{done.email}</strong>. It has your login and a
              link to set your password.
            </>
          ) : done.welcome === 'waiting' ? (
            <>
              Sending your welcome email to <strong>{done.email}</strong> in {done.wait ?? 60}s (we
              can send one email a minute to the same address).
            </>
          ) : done.welcome === 'failed' ? (
            done.message
          ) : (
            <>
              Sending your welcome email to <strong>{done.email}</strong>…
            </>
          )}
        </span>
      </div>

      {done.imported?.property ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#F3FAF5] p-3 text-sm font-semibold leading-[1.6] text-[#1F5B33]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Your property and first unit are set up from your Airbnb listing
          {done.imported.photo ? ', cover photo included' : ''}. Check them in your workspace.
        </p>
      ) : null}

      <ol className="mt-5 space-y-2 text-sm font-semibold leading-[1.7] text-[#3A352B]">
        <li>1. Open your host workspace. You are already signed in on this device.</li>
        <li>2. Upload your ID or passport and proof of authority to let the property.</li>
        <li>
          3. NexG reviews them, usually within one working day. Once approved, you can list and
          manage your units.
        </li>
      </ol>
      <p className="mt-4 text-sm font-semibold leading-[1.8] text-[#5B5B5B]">
        Your first month of management is free.
        {done.reference ? (
          <>
            {' '}
            Your reference is{' '}
            <span className="font-extrabold text-[#1A1A1A]">{done.reference}</span>.
          </>
        ) : null}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button asChild>
          <a href="/host">
            Open my host workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
        {done.welcome === 'failed' ? (
          <Link
            href="/forgot-password?portal=host"
            className="text-sm font-extrabold underline underline-offset-4"
          >
            Send the password link again
          </Link>
        ) : null}
      </div>
      <p className="mt-4 text-sm font-semibold leading-[1.8] text-[#5B5B5B]">
        Once your password is set, sign in any time at{' '}
        <Link href="/hosts/sign-in" className="font-extrabold underline underline-offset-4">
          Host sign in
        </Link>
        .
      </p>
    </div>
  );
}
