'use client';

import { Button, Card, Input, PhoneInput, useToast, withCaptcha } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createAccount, signIn } from '@/app/(customer)/sign-in/actions';
import { goTo } from '@/components/auth/password-recovery';
import { PORTALS, type Portal } from '@/lib/auth-portals';
import { DATA_PROTECTION_POLICY_URL, NEW_TAB } from '@/lib/legal-documents';

const COPY: Record<Portal, { title: string; lead: string }> = {
  customer: {
    title: 'Welcome back',
    lead: 'Sign in to order, book stays and follow your requests.',
  },
  merchant: {
    title: 'Merchant sign in',
    lead: 'Sign in to your merchant workspace: orders, catalogue and setup.',
  },
  rider: {
    title: 'Rider sign in',
    lead: 'Sign in to your rider dashboard: jobs, shifts and earnings.',
  },
  host: {
    title: 'Host sign in',
    lead: 'Sign in to your host workspace: units, stays and guests.',
  },
};

/**
 * A sign-in form for one portal.
 *
 * /sign-in is for customers; merchants, riders and hosts each sign in on
 * their own page. All four use the same server action, the same Turnstile
 * handling and the same database answer (`fn_partner_home`) for where the
 * account lands, so a merchant who uses the customer page anyway still ends
 * up in their workspace.
 *
 * The merchant portal keeps a "Create account" tab for one existing path: an
 * anonymous merchant workspace upgrading to an email and password. Customers
 * create accounts at /sign-up.
 */
export function AuthPanel({
  portal = 'customer',
  initialTab = 'signin',
  next,
  emailOtpEnabled = false,
  initialEmail,
  setupEmail,
  notice,
  social,
}: {
  portal?: Portal;
  initialTab?: 'signin' | 'create';
  next?: string;
  emailOtpEnabled?: boolean;
  initialEmail?: string;
  setupEmail?: string;
  /** A one-line message above the form, e.g. "your session ended". */
  notice?: string;
  /** Social sign-in buttons, shown above the email form when enabled. */
  social?: React.ReactNode;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const canCreate = portal === 'merchant' && initialTab === 'create';
  const [tab, setTab] = React.useState<'signin' | 'create'>(canCreate ? 'create' : 'signin');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState<string | null>(null);
  const info = PORTALS[portal];

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set('portal', portal);
    formData.set('role', portal === 'merchant' ? 'merchant' : 'guest');
    if (next) formData.set('next', next);
    if (phone) formData.set('phone', phone);
    await withCaptcha(formData);

    const result = tab === 'signin' ? await signIn(formData) : await createAccount(formData);
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    toast({ title: 'Welcome', description: result.message, tone: 'success' });
    goTo(router, result.redirectTo ?? next ?? info.home);
  };

  const forgotHref =
    portal === 'customer' ? '/forgot-password' : `/forgot-password?portal=${portal}`;

  return (
    <div className="w-full max-w-md">
      <Card className="p-6 sm:p-8">
        {canCreate && (
          <div className="bg-bg mb-6 grid grid-cols-2 gap-1 rounded-xl p-1">
            {(
              [
                ['signin', 'Sign in'],
                ['create', 'Create account'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                  setError(null);
                }}
                aria-pressed={tab === value}
                className={`rounded-lg py-2.5 text-sm font-extrabold transition-colors ${
                  tab === value ? 'bg-ink text-gold' : 'text-ink hover:text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <h1 className="text-3xl font-extrabold tracking-tight">
          {tab === 'signin' ? COPY[portal].title : 'Create your merchant account'}
        </h1>
        {setupEmail ? (
          <div
            role="status"
            className="bg-gold-soft text-ink border-gold mt-4 rounded-xl border-l-4 p-4 text-sm leading-6"
          >
            <p className="text-base font-extrabold">Application received. Check your email.</p>
            <p className="mt-1">
              We sent a welcome email to <strong className="break-all">{setupEmail}</strong>.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Your username is <strong className="break-all">{setupEmail}</strong>.
              </li>
              <li>
                Open the email and choose <strong>Set your password</strong>, then sign in here.
              </li>
              <li>Not there after a few minutes? Check spam or Promotions. The link works once.</li>
            </ul>
          </div>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="bg-surface border-border text-ink mt-4 rounded-xl border px-4 py-3 text-sm font-semibold"
          >
            {notice}
          </p>
        ) : null}
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
          {tab === 'signin'
            ? COPY[portal].lead
            : 'Create your merchant account, then continue your saved registration.'}
        </p>

        {tab === 'signin' && social ? <div className="mt-6">{social}</div> : null}

        <form method="post" onSubmit={submit} className="mt-6">
          {tab === 'create' && (
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <Input
                id="first_name"
                name="first_name"
                label="First name"
                placeholder="Your first name"
                required
              />
              <Input
                id="last_name"
                name="last_name"
                label="Last name"
                placeholder="Your last name"
                required
              />
            </div>
          )}

          <Input
            id="email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            placeholder="you@example.com"
            defaultValue={initialEmail}
            required
          />

          <div className="mt-4">
            <Input
              id="password"
              name="password"
              type="password"
              label="Password"
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              hint={tab === 'create' ? 'At least 6 characters.' : undefined}
              {...(error ? { error } : {})}
              required
            />
          </div>

          {tab === 'signin' && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <Link
                href={forgotHref}
                className="text-ink inline-block text-sm font-bold underline underline-offset-4"
              >
                Forgot password?
              </Link>
              {portal === 'merchant' && emailOtpEnabled ? (
                <Link
                  href="/merchants/sign-in/email"
                  className="text-ink inline-block text-sm font-bold underline underline-offset-4"
                >
                  Sign in with an email code
                </Link>
              ) : null}
            </div>
          )}

          {tab === 'create' && (
            <div className="mt-4">
              <PhoneInput
                id="phone"
                label="Phone number"
                fixedCountry
                hint="So NexG can reach you about your business."
                value={phone}
                onChange={setPhone}
              />
            </div>
          )}

          {tab === 'create' && (
            <label className="mt-5 flex items-start gap-3">
              <input
                type="checkbox"
                name="accepted"
                required
                className="accent-gold mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-muted text-xs font-semibold leading-[1.7]">
                I agree to the{' '}
                <Link
                  href="/legal/terms"
                  className="text-ink font-bold underline underline-offset-2"
                >
                  Terms
                </Link>{' '}
                and{' '}
                <Link
                  href="/legal/privacy"
                  className="text-ink font-bold underline underline-offset-2"
                >
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
          )}

          <Button
            type="submit"
            block
            size="lg"
            className="mt-6 h-14 rounded-xl text-base"
            loading={pending}
            loadingText={tab === 'signin' ? 'Signing in…' : 'Creating…'}
            trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
          >
            {tab === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="text-muted-light mt-6 text-center text-xs font-semibold leading-[1.7]">
          {portal === 'customer' ? (
            <>
              New to NexG?{' '}
              <Link
                href={next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'}
                className="text-ink font-bold underline underline-offset-4"
              >
                Create an account
              </Link>
            </>
          ) : tab === 'create' ? (
            <>
              Already have a password?{' '}
              <button
                type="button"
                onClick={() => setTab('signin')}
                className="text-ink font-bold underline underline-offset-4"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Not registered yet?{' '}
              <Link href={info.start} className="text-ink font-bold underline underline-offset-4">
                {portal === 'host' ? 'List your property' : `Apply as a ${portal}`}
              </Link>
            </>
          )}
        </p>
      </Card>

      {portal === 'customer' ? (
        <div className="bg-ink mt-4 rounded-2xl p-5 text-white">
          <p className="text-[0.9375rem] font-extrabold">Merchant, rider or host?</p>
          <p className="mt-1 text-xs font-semibold leading-[1.7] text-white/60">
            Partners sign in on their own page.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['merchant', 'rider', 'host'] as const).map((partner) => (
              <Button
                key={partner}
                variant="outline"
                size="sm"
                asChild
                className="border-gold/50 text-gold hover:bg-gold/10"
              >
                <Link href={PORTALS[partner].signIn}>{PORTALS[partner].label} sign in</Link>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-muted-light mt-4 text-center text-xs font-semibold">
          Ordering or booking a stay?{' '}
          <Link href="/sign-in" className="text-ink font-bold underline underline-offset-4">
            Customer sign in
          </Link>
        </p>
      )}
    </div>
  );
}
