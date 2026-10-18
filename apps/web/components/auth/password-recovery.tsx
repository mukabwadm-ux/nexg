'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  requestPasswordRecovery,
  updateRecoveredPassword,
} from '@/app/sign-in/actions';

export function ForgotPasswordForm({ invalidLink = false }: { invalidLink?: boolean }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await requestPasswordRecovery(new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
  };

  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-ink text-2xl font-extrabold tracking-tight">Forgot your password?</h1>
      <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
        Enter the email address on your account and we’ll send you a secure reset link.
      </p>

      {invalidLink && (
        <p role="alert" className="text-danger mt-4 text-sm font-semibold">
          That recovery link is invalid or has expired. Request a new one below.
        </p>
      )}

      {sent ? (
        <p role="status" className="text-ink bg-surface mt-5 rounded-xl p-4 text-sm font-semibold">
          If an account uses that email, a password recovery link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6">
          <Input
            id="recovery-email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            placeholder="you@example.com"
            error={error ?? undefined}
            required
          />
          <Button
            type="submit"
            block
            size="lg"
            className="mt-5 h-14 rounded-xl text-base"
            loading={pending}
            loadingText="Sending link…"
            trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
          >
            Send recovery link
          </Button>
        </form>
      )}

      <Link
        href="/sign-in"
        className="text-ink mt-6 block text-center text-sm font-bold underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </Card>
  );
}

export function ResetPasswordForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await updateRecoveredPassword(new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    toast({ title: 'Password updated', description: result.message, tone: 'success' });
    router.push('/');
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-ink text-2xl font-extrabold tracking-tight">Choose a new password</h1>
      <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
        Use at least 6 characters. You’ll be able to sign in with it right away.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Input
          id="new-password"
          name="password"
          type="password"
          label="New password"
          autoComplete="new-password"
          required
          minLength={6}
          maxLength={72}
        />
        <Input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          required
          minLength={6}
          maxLength={72}
          error={error ?? undefined}
        />
        <Button
          type="submit"
          block
          size="lg"
          className="h-14 rounded-xl text-base"
          loading={pending}
          loadingText="Updating password…"
          trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
        >
          Update password
        </Button>
      </form>
    </Card>
  );
}
