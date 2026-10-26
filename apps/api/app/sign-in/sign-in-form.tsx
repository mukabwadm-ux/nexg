'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { signIn } from './actions';

/**
 * The sign-in for the developer console.
 *
 * One account across every NexG surface: the same email and password
 * that sign in to nexgapp.com and to the staff console. Asking an
 * integrator to create a second account is asking them to remember a
 * second password, and the ones who forget it do not come back.
 */
export function SignInForm({ next }: { next?: string }) {
  const { toast } = useToast();
  const router = useRouter();

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await signIn(formData);
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    toast({ title: 'Welcome', description: result.message, tone: 'success' });
    router.push(next ?? result.redirectTo ?? '/developers');
    router.refresh();
  };

  return (
    <Card className="p-6 sm:p-8 w-full max-w-md">
      <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
      <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
        Use the same NexG account you use everywhere else. We need to know
        who you are so a key can be tied to your merchant.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
        />

        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
        />

        {error && (
          <p role="alert" className="text-sm font-semibold text-danger border border-danger/40 bg-danger/5 rounded px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="text-muted-light mt-6 text-xs font-semibold leading-relaxed">
        No account yet? A merchant account is created from the NexG site.
        Once you are signed in here, your merchants appear by name.
      </p>
    </Card>
  );
}