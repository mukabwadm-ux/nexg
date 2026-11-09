'use client';

import { Button, Card, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { finishOAuthProfile } from '@/app/(customer)/sign-in/actions';
import { goTo } from '@/components/auth/password-recovery';
import { DATA_PROTECTION_POLICY_URL, NEW_TAB } from '@/lib/legal-documents';

/** The one short step after a first Google or Apple sign-in. */
export function FinishProfile({
  next,
  email,
  privateRelay,
  initialFirstName,
  initialLastName,
  initialPhone,
}: {
  next?: string;
  email: string;
  privateRelay: boolean;
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [firstName, setFirstName] = React.useState(initialFirstName);
  const [lastName, setLastName] = React.useState(initialLastName);
  const [phone, setPhone] = React.useState<string | null>(initialPhone);
  const [accepted, setAccepted] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await finishOAuthProfile({ firstName, lastName, phone, accepted, next });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast({ title: 'Welcome', description: result.message, tone: 'success' });
    goTo(router, result.redirectTo ?? next ?? '/');
  }

  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Finish your profile</h1>
      <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
        Signed in as <strong className="text-ink break-all">{email}</strong>.
        {privateRelay
          ? ' Apple is hiding your email from us; messages still reach you through Apple.'
          : null}
      </p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="first_name"
            label="First name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
          />
          <Input
            id="last_name"
            label="Last name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
          />
        </div>
        <PhoneInput
          id="phone"
          label="Phone number (optional)"
          fixedCountry
          hint="So the concierge can reach you about an order."
          value={phone}
          onChange={setPhone}
        />
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="accent-gold mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="text-muted text-xs font-semibold leading-[1.7]">
            I agree to the{' '}
            <Link href="/legal/terms" className="text-ink font-bold underline underline-offset-2">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/legal/privacy" className="text-ink font-bold underline underline-offset-2">
              Privacy Policy
            </Link>{' '}
            (see our{' '}
            <a
              href={DATA_PROTECTION_POLICY_URL}
              {...NEW_TAB}
              className="text-ink font-bold underline underline-offset-2"
            >
              Data Protection Policy
            </a>
            ).
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-danger text-sm font-semibold">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          block
          size="lg"
          className="h-14 rounded-xl text-base"
          loading={pending}
          loadingText="Saving…"
          trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
        >
          Continue
        </Button>
      </form>
    </Card>
  );
}
