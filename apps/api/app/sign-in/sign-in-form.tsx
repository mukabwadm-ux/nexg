'use client';

import { Button, CAPTCHA_FIELD, Card, captchaSiteKey, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { signIn } from './actions';
import { type CheckState, describeFailure } from './turnstile';
import { TurnstileBox, type TurnstileHandle } from './turnstile-box';

/** How long Sign in waits for a check that is still running. */
const WAIT_FOR_CHECK_MS = 30_000;
/** When a check still running is worth a word. */
const SLOW_CHECK_MS = 15_000;

/**
 * The sign-in for the developer console.
 *
 * One account across every NexG surface: the same email and password
 * that sign in to nexgapp.com and to the staff console. Asking an
 * integrator to create a second account is asking them to remember a
 * second password, and the ones who forget it do not come back.
 *
 * The security check (Cloudflare Turnstile) sits in the form with a line
 * saying where it stands. Pressing Sign in while it is still running waits
 * for it instead of refusing: on a slow connection the check can take
 * longer than a browser takes to fill in a saved password.
 */
export function SignInForm({ next }: { next?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const needsCheck = Boolean(captchaSiteKey());

  const [pending, setPending] = React.useState<'check' | 'sign-in' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [check, setCheck] = React.useState<CheckState>({ state: 'checking' });
  const [slow, setSlow] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const latest = React.useRef<CheckState>(check);
  const waiters = React.useRef<Array<(check: CheckState) => void>>([]);
  const widget = React.useRef<TurnstileHandle | null>(null);

  const update = React.useCallback((next: CheckState) => {
    latest.current = next;
    setCheck(next);
    if (next.state === 'passed' || next.state === 'failed') {
      const waiting = waiters.current;
      waiters.current = [];
      waiting.forEach((resolve) => resolve(next));
    }
  }, []);

  React.useEffect(() => {
    setSlow(false);
    if (check.state !== 'checking') return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [check]);

  /** The check's outcome, waiting a while for one still running. */
  const outcome = () => {
    const now = latest.current;
    if (now.state === 'passed' || now.state === 'failed') return Promise.resolve(now);
    return new Promise<CheckState>((resolve) => {
      const timer = window.setTimeout(() => resolve(latest.current), WAIT_FOR_CHECK_MS);
      waiters.current.push((done) => {
        window.clearTimeout(timer);
        resolve(done);
      });
    });
  };

  /** A token is good for one sign-in, whatever the answer: get the next. */
  const checkAgain = () => {
    update({ state: 'checking' });
    widget.current?.reset();
  };

  /** Start the check from scratch, reloading Cloudflare's script if it failed. */
  const retry = () => {
    setError(null);
    update({ state: 'checking' });
    setAttempt((n) => n + 1);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    if (needsCheck) {
      setPending('check');
      const done = await outcome();
      if (done.state !== 'passed') {
        setPending(null);
        setError(
          done.state === 'failed'
            ? 'Sign in needs the security check to pass first. See the note under the check.'
            : done.state === 'needs-click'
              ? 'Tick the box in the security check, then press Sign in again.'
              : 'The security check did not finish. An ad or privacy blocker, a VPN or your network may be blocking challenges.cloudflare.com: allow it, or try another browser.',
        );
        return;
      }
      formData.set(CAPTCHA_FIELD, done.token);
    }

    setPending('sign-in');
    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn(formData);
    } catch {
      result = {
        ok: false,
        message: 'Sign in could not reach NexG. Check your connection, then try again.',
      };
    }
    setPending(null);
    if (needsCheck) checkAgain();

    if (!result.ok) {
      setError(result.message);
      return;
    }

    toast({ title: 'Welcome', description: result.message, tone: 'success' });
    router.push(next ?? result.redirectTo ?? '/developers');
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
      <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
        Use the same NexG account you use everywhere else. We need to know who you are so a key can
        be tied to your merchant.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Input id="email" name="email" type="email" label="Email" autoComplete="email" required />

        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
        />

        {needsCheck && (
          <div>
            <TurnstileBox key={attempt} handle={widget} onChange={update} />
            <CheckNote check={check} slow={slow} onRetry={retry} />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-danger border-danger/40 bg-danger/5 rounded border px-3 py-2 text-sm font-semibold"
          >
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending !== null} className="w-full">
          {pending === 'check'
            ? 'Waiting for the security check...'
            : pending === 'sign-in'
              ? 'Signing in...'
              : 'Sign in'}
        </Button>
      </form>

      <p className="text-muted-light mt-6 text-xs font-semibold leading-relaxed">
        No account yet? A merchant account is created from the NexG site. Once you are signed in
        here, your merchants appear by name.
      </p>
    </Card>
  );
}

/** One line under the check saying where it stands, and what to do if it is stuck. */
function CheckNote({
  check,
  slow,
  onRetry,
}: {
  check: CheckState;
  slow: boolean;
  onRetry: () => void;
}) {
  const again = (
    <button type="button" onClick={onRetry} className="text-primary ml-1 font-bold underline">
      Try again
    </button>
  );

  if (check.state === 'failed') {
    return (
      <p className="text-danger mt-1 text-xs font-semibold leading-relaxed" aria-live="polite">
        Security check failed (Cloudflare error {check.code}). {describeFailure(check.code)}
        {again}
      </p>
    );
  }
  return (
    <p className="text-muted mt-1 text-xs font-semibold leading-relaxed" aria-live="polite">
      {check.state === 'passed'
        ? 'Security check passed.'
        : check.state === 'needs-click'
          ? 'Tick the box above to finish the security check.'
          : slow
            ? 'Still checking your browser. If this does not finish, an ad or privacy blocker, a VPN or your network may be stopping it.'
            : 'Checking your browser…'}
      {check.state === 'checking' && slow && again}
    </p>
  );
}
