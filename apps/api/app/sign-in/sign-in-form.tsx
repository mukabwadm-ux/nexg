'use client';

import { Button, CAPTCHA_FIELD, Card, captchaSiteKey, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { signIn } from './actions';
import { TurnstileBox, type TurnstileHandle } from './turnstile-box';

/**
 * The sign-in for the developer console.
 *
 * One account across every NexG surface: the same email and password
 * that sign in to nexgapp.com and to the staff console. Asking an
 * integrator to create a second account is asking them to remember a
 * second password, and the ones who forget it do not come back.
 *
 * The security check (Cloudflare Turnstile) sits in the form, above the
 * button: run invisibly in a corner, a check that wanted a click went
 * unnoticed and every sign-in was refused.
 */
export function SignInForm({ next }: { next?: string }) {
  const { toast } = useToast();
  const router = useRouter();

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const check = React.useRef<TurnstileHandle | null>(null);
  const needsCheck = Boolean(captchaSiteKey());

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    if (needsCheck) {
      if (!token) {
        setError(
          checkError
            ? `The security check could not run on this page (Cloudflare error ${checkError}). Reload the page and try again; if it keeps happening, tell NexG support this code.`
            : 'Complete the security check above the Sign in button first.',
        );
        return;
      }
      formData.set(CAPTCHA_FIELD, token);
    }

    setPending(true);
    const result = await signIn(formData);
    setPending(false);
    // A token is good for one sign-in, whatever the answer.
    check.current?.reset();

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

        <TurnstileBox
          handle={check}
          onToken={(value) => {
            setToken(value);
            if (value) setCheckError(null);
          }}
          onError={setCheckError}
        />

        {error && (
          <p
            role="alert"
            className="text-danger border-danger/40 bg-danger/5 rounded border px-3 py-2 text-sm font-semibold"
          >
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="text-muted-light mt-6 text-xs font-semibold leading-relaxed">
        No account yet? A merchant account is created from the NexG site. Once you are signed in
        here, your merchants appear by name.
      </p>
    </Card>
  );
}
