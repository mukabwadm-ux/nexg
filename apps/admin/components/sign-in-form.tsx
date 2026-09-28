'use client';

import { Button, Card, Input } from '@nexg/ui';
import { Lock } from 'lucide-react';
import * as React from 'react';

import { type SignInResult, signIn } from '@/app/sign-in/actions';

export function SignInForm({
  next,
  denied,
  domain,
}: {
  next: string;
  denied: boolean;
  domain: string | null;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    denied ? 'That account is not on the staff list. Ask your manager to add you.' : null,
  );

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    /*
     * A successful sign-in redirects. Next resolves the call with nothing in
     * that case rather than rejecting, so the result is only read when it is
     * actually there — reading `.ok` off undefined threw an error into the
     * console on every successful sign-in.
     */
    const result: SignInResult | undefined = await signIn(null, formData);

    if (!result) return; // redirecting; leave the button busy until it lands.

    setPending(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="w-full max-w-md">
      <Card className="p-8">
        <span
          aria-hidden="true"
          className="bg-bg text-ink flex h-10 w-10 items-center justify-center rounded-xl"
        >
          <Lock className="h-4 w-4" />
        </span>

        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Staff sign in</h1>
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
          Use your NexG work account. Your role decides what you can see once you are in.
        </p>

        <form onSubmit={onSubmit} className="mt-6">
          <input type="hidden" name="next" value={next} />

          <Input
            id="email"
            name="email"
            type="email"
            label="Work email"
            autoComplete="username"
            placeholder={domain ? `you@${domain}` : 'you@example.com'}
            required
          />

          <div className="mt-4">
            <Input
              id="password"
              name="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              {...(error ? { error } : {})}
              required
            />
          </div>

          <Button
            type="submit"
            block
            size="lg"
            className="mt-6"
            loading={pending}
            loadingText="Signing in…"
          >
            Sign in
          </Button>
        </form>

        <Card tone="muted" className="mt-5 p-4">
          <p className="text-muted text-xs leading-[1.7]">
            {domain ? (
              <>
                Only <span className="font-bold">@{domain}</span> accounts that an admin has added
                to Staff &amp; roles can sign in.
              </>
            ) : (
              <>Only accounts an admin has added to Staff &amp; roles can sign in.</>
            )}{' '}
            Google Workspace sign-in replaces this once the OAuth credentials are in place.
          </p>
        </Card>
      </Card>

      <p className="text-muted-light mt-4 text-center text-xs font-semibold">
        Signed in by mistake?{' '}
        <a
          href={process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}
          className="text-ink font-bold underline underline-offset-4"
        >
          Guest, rider or merchant sign in
        </a>
      </p>
    </div>
  );
}
