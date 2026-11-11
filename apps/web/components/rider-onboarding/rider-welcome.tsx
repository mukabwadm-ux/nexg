'use client';

import { Button, getCaptchaToken } from '@nexg/ui';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { sendRiderPasswordSetupLink } from '@/app/(customer)/sign-in/actions';
import { EMAIL_GAP_MS } from '@/lib/email-code';

type State =
  | { kind: 'idle' }
  | { kind: 'waiting'; seconds: number }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'failed'; message: string };

/**
 * After submitting: the welcome email with the "Set your password" link, and
 * where to sign in from now on. Sent once, on arrival from the application
 * (`?welcome=1`); waits out Supabase's one-email-a-minute limit when the
 * email code went out moments ago, and offers a resend.
 */
export function RiderWelcome({ email }: { email: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = React.useState<State>({ kind: 'idle' });
  const started = React.useRef(false);

  const send = React.useCallback(async () => {
    setState({ kind: 'sending' });
    let result = await sendRiderPasswordSetupLink(await getCaptchaToken());
    if (!result.ok && result.rateLimited) {
      const seconds = Math.ceil(EMAIL_GAP_MS / 1000);
      setState({ kind: 'waiting', seconds });
      await new Promise((resolve) => setTimeout(resolve, EMAIL_GAP_MS));
      setState({ kind: 'sending' });
      result = await sendRiderPasswordSetupLink(await getCaptchaToken());
    }
    setState(result.ok ? { kind: 'sent' } : { kind: 'failed', message: result.message });
  }, []);

  React.useEffect(() => {
    if (started.current || params.get('welcome') !== '1') return;
    started.current = true;
    void send().then(() => router.replace('/riders/status'));
  }, [params, router, send]);

  React.useEffect(() => {
    if (state.kind !== 'waiting' || state.seconds <= 1) return;
    const timer = setTimeout(
      () => setState((s) => (s.kind === 'waiting' ? { ...s, seconds: s.seconds - 1 } : s)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <div className="border-gold/40 bg-gold-soft rounded-2xl border p-5">
      <p className="text-ink flex items-center gap-2 text-[0.9375rem] font-extrabold">
        <MailCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        Your rider login
      </p>
      <p className="text-ink mt-2 text-[0.8125rem] font-semibold leading-[1.7]">
        {email ? (
          <>
            Username: <strong className="break-all">{email}</strong>.{' '}
          </>
        ) : null}
        {state.kind === 'waiting'
          ? `Sending your welcome email in ${state.seconds}s (we can send one email a minute to the same address).`
          : state.kind === 'sending'
            ? 'Sending your welcome email…'
            : state.kind === 'sent'
              ? 'We sent your welcome email. Open it and choose Set your password, then sign in at Rider sign in to reach your dashboard. Check spam if it is not there in a few minutes.'
              : state.kind === 'failed'
                ? state.message
                : 'Set your password from the welcome email, then sign in at Rider sign in to reach your dashboard.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button asChild size="sm">
          <Link href="/rider">Open my dashboard</Link>
        </Button>
        <Link
          href="/riders/sign-in"
          className="text-ink text-[0.8125rem] font-extrabold underline underline-offset-4"
        >
          Rider sign in
        </Link>
        {(state.kind === 'idle' || state.kind === 'failed') && (
          <button
            type="button"
            onClick={() => void send()}
            className="text-ink text-[0.8125rem] font-extrabold underline underline-offset-4"
          >
            {state.kind === 'failed' ? 'Try again' : 'Send the welcome email again'}
          </button>
        )}
      </div>
    </div>
  );
}
