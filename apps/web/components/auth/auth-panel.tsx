'use client';

import { Button, Card, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight, Bike, Store, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { type AccountRole, createAccount, signIn } from '@/app/sign-in/actions';

const ROLES: { value: AccountRole; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    value: 'guest',
    label: 'Guest',
    hint: 'Ordering & requests',
    icon: <UserRound className="h-4 w-4" />,
  },
  {
    value: 'rider',
    label: 'Rider',
    hint: 'Deliveries & earnings',
    icon: <Bike className="h-4 w-4" />,
  },
  {
    value: 'merchant',
    label: 'Merchant',
    hint: 'Orders & catalogue',
    icon: <Store className="h-4 w-4" />,
  },
];

/**
 * The one sign-in page, for everybody.
 *
 * The role buttons decide where you land, not what you are allowed to do —
 * that is settled by the database on every query. Picking "Rider" when you
 * have no application simply takes you to the page where you would start one.
 *
 * The artboard leads with a phone number and a one-time code. There is no SMS
 * provider yet, so the working path is email and password — which the artboard
 * also offers — and the phone field says so rather than pretending.
 */
export function AuthPanel({ initialTab = 'signin' }: { initialTab?: 'signin' | 'create' }) {
  const { toast } = useToast();
  const router = useRouter();

  const [tab, setTab] = React.useState<'signin' | 'create'>(initialTab);
  const [role, setRole] = React.useState<AccountRole>('guest');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set('role', role);
    if (phone) formData.set('phone', phone);

    const result = tab === 'signin' ? await signIn(formData) : await createAccount(formData);
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    toast({ title: 'Welcome', description: result.message, tone: 'success' });
    router.push(result.redirectTo ?? '/');
    router.refresh();
  };

  return (
    <div className="w-full max-w-xl">
      <Card className="p-6 sm:p-8">
        {/* Tabs */}
        <div className="bg-bg grid grid-cols-2 gap-1 rounded-xl p-1">
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

        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
          {tab === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
          {tab === 'signin'
            ? 'Sign in with your email and password.'
            : 'For guests. You can order without an account — this just saves you time next visit.'}
        </p>

        <form onSubmit={submit} className="mt-6">
          {tab === 'signin' && (
            <fieldset className="mb-5">
              <legend className="text-ink mb-2 text-sm font-bold">I am a…</legend>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRole(option.value)}
                    aria-pressed={role === option.value}
                    className={`rounded-xl border p-3 text-center transition-colors ${
                      role === option.value
                        ? 'border-ink bg-ink text-white'
                        : 'border-border bg-surface hover:border-border-strong'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mx-auto flex h-8 w-8 items-center justify-center ${
                        role === option.value ? 'text-gold' : 'text-muted-light'
                      }`}
                    >
                      {option.icon}
                    </span>
                    <span className="mt-1 block text-[0.8125rem] font-extrabold">
                      {option.label}
                    </span>
                    <span
                      className={`mt-0.5 block text-[0.625rem] font-semibold leading-tight ${
                        role === option.value ? 'text-white/55' : 'text-muted-light'
                      }`}
                    >
                      {option.hint}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

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

          {tab === 'create' && (
            <div className="mt-4">
              <PhoneInput
                id="phone"
                label="Phone number"
                fixedCountry
                hint="So the concierge can reach you about an order."
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
                </Link>
                . NexG uses my details to run my orders and account, and never sells them.
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

        {/*
         * The artboard's primary path. It is described rather than offered,
         * because a button that cannot send a code is worse than a sentence
         * explaining why.
         */}
        <Card tone="muted" className="mt-5 p-4">
          <p className="text-muted text-xs leading-[1.7]">
            <span className="text-ink font-bold">One-time codes by SMS</span>, and Google and Apple
            sign-in, arrive once those accounts are set up. Until then email and password is the way
            in — and it works on any device.
          </p>
        </Card>

        <p className="text-muted-light mt-5 text-center text-xs font-semibold">
          {tab === 'signin' ? (
            <>
              New here?{' '}
              <button
                type="button"
                onClick={() => setTab('create')}
                className="text-ink font-bold underline underline-offset-4"
              >
                Create an account
              </button>{' '}
              — it takes a minute. Riders and merchants: your application login works here too.
            </>
          ) : (
            <>
              Already with us?{' '}
              <button
                type="button"
                onClick={() => setTab('signin')}
                className="text-ink font-bold underline underline-offset-4"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </Card>

      <div className="bg-ink mt-4 rounded-2xl p-5 text-white">
        <p className="text-[0.9375rem] font-extrabold">Want to earn with NexG?</p>
        <p className="mt-1 text-xs font-semibold leading-[1.7] text-white/60">
          Riders and merchants apply separately — your login is set up once you’re approved.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="gold" size="sm" asChild>
            <Link href="/riders/apply">Become a Rider</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="border-gold/50 text-gold hover:bg-gold/10"
          >
            <Link href="/merchants/apply">Register Your Business</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
