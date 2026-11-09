'use client';

import { Button, Card, Input, PhoneInput, getCaptchaToken } from '@nexg/ui';
import { ArrowRight, CheckCircle2, MailCheck, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { completeCustomerSignUp } from '@/app/(customer)/sign-in/actions';
import { SocialSignIn } from '@/components/auth/social-sign-in';
import {
  CODE_PATTERN,
  EMAIL_GAP_MS,
  EMAIL_PATTERN,
  EmailCodeError,
  sendEmailCode,
  verifyEmailCode,
  type EmailCodeWording,
} from '@/lib/email-code';
import { DATA_PROTECTION_POLICY_URL, NEW_TAB } from '@/lib/legal-documents';
import { createClient } from '@/lib/supabase/client';

type EmailState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'code'; userId: string; email: string }
  | { kind: 'checking'; userId: string; email: string }
  | { kind: 'verified'; email: string };

type Welcome =
  | { kind: 'waiting'; seconds: number }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'failed'; message: string };

const WORDING: EmailCodeWording = {
  exists: 'This email already has a NexG account. Sign in instead.',
  signedInAs: (email) =>
    `You are already signed in as ${email}. Sign out first to create a different account.`,
};

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Customer account creation.
 *
 * The same shape as host registration: the email is confirmed with a code
 * before anything else (it becomes the login), then the welcome email brings
 * a single-use "Set your password" link. The visitor is signed in on this
 * device from the moment the code is confirmed, so they can carry on
 * straight away and set the password from the email when they like.
 */
export function CustomerSignUp({ next }: { next?: string }) {
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [emailState, setEmailState] = React.useState<EmailState>({ kind: 'idle' });
  const [emailMessage, setEmailMessage] = React.useState<{ text: string; exists?: boolean }>();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [lastEmailAt, setLastEmailAt] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState<{ email: string; welcome: Welcome } | null>(null);

  const verified = emailState.kind === 'verified';
  const emailLocked = emailState.kind !== 'idle';
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in';

  async function sendCode() {
    setEmailMessage(undefined);
    const clean = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(clean)) {
      setErrors((e) => ({ ...e, email: 'Enter a valid email address.' }));
      return;
    }
    setErrors(({ email: _ignored, ...rest }) => rest);
    setEmailState({ kind: 'sending' });
    try {
      const result = await sendEmailCode(createClient().auth, clean, WORDING);
      if (result.verified) {
        setEmailState({ kind: 'verified', email: clean });
        return;
      }
      setLastEmailAt(Date.now());
      setCode('');
      setEmailState({ kind: 'code', userId: result.userId, email: clean });
    } catch (error) {
      setEmailState({ kind: 'idle' });
      setEmailMessage({
        text: messageOf(error, 'We could not send a code. Try again.'),
        exists: error instanceof EmailCodeError && error.exists,
      });
    }
  }

  async function checkCode() {
    if (emailState.kind !== 'code') return;
    if (!CODE_PATTERN.test(code)) {
      setEmailMessage({ text: 'Enter the 6- or 8-digit code from the email.' });
      return;
    }
    const { userId, email: clean } = emailState;
    setEmailState({ kind: 'checking', userId, email: clean });
    setEmailMessage(undefined);
    try {
      await verifyEmailCode(createClient().auth, userId, clean, code, WORDING);
      setEmailState({ kind: 'verified', email: clean });
    } catch (error) {
      setEmailState({ kind: 'code', userId, email: clean });
      setEmailMessage({ text: messageOf(error, 'That code did not work. Send a new one.') });
    }
  }

  /* The welcome email, waiting out Supabase's one-email-a-minute limit after
     the code that was sent moments ago, then retrying once if still early. */
  const sendWelcome = React.useCallback(
    async (
      address: string,
      sentAt: number,
      profile: Parameters<typeof completeCustomerSignUp>[0],
    ) => {
      const pause = async (ms: number) => {
        setDone({ email: address, welcome: { kind: 'waiting', seconds: Math.ceil(ms / 1000) } });
        await new Promise((resolve) => setTimeout(resolve, ms));
      };
      const wait = sentAt + EMAIL_GAP_MS - Date.now();
      if (wait > 0) await pause(wait);
      setDone({ email: address, welcome: { kind: 'sending' } });
      let result = await completeCustomerSignUp(profile, await getCaptchaToken());
      if (!result.ok && result.rateLimited) {
        await pause(EMAIL_GAP_MS);
        setDone({ email: address, welcome: { kind: 'sending' } });
        result = await completeCustomerSignUp(profile, await getCaptchaToken());
      }
      setDone({
        email: address,
        welcome: result.ok ? { kind: 'sent' } : { kind: 'failed', message: result.message },
      });
    },
    [],
  );

  /* A visible countdown while the welcome email waits. */
  React.useEffect(() => {
    if (done?.welcome.kind !== 'waiting' || done.welcome.seconds <= 1) return;
    const timer = setTimeout(
      () =>
        setDone((d) =>
          d && d.welcome.kind === 'waiting'
            ? { ...d, welcome: { kind: 'waiting', seconds: d.welcome.seconds - 1 } }
            : d,
        ),
      1000,
    );
    return () => clearTimeout(timer);
  }, [done]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!firstName.trim()) problems['firstName'] = 'Enter your first name.';
    if (!lastName.trim()) problems['lastName'] = 'Enter your last name.';
    if (!verified)
      problems['email'] = 'Confirm your email with the code first. It becomes your login.';
    if (!accepted) problems['accepted'] = 'Please accept the Terms and Privacy Policy to continue.';
    setErrors(problems);
    if (Object.keys(problems).length || emailState.kind !== 'verified') return;

    setPending(true);
    const profile = { firstName, lastName, phone, accepted };
    const address = emailState.email;
    /* Save the details now, so they are kept even if the visitor leaves
       during the countdown; the welcome email then waits its turn. */
    const saved = await completeCustomerSignUp(profile, undefined, false);
    if (!saved.ok) {
      setPending(false);
      setErrors({ form: saved.message });
      return;
    }
    await sendWelcome(address, lastEmailAt, profile);
    setPending(false);
  }

  if (done) {
    const { welcome } = done;
    return (
      <Card className="w-full max-w-md p-6 sm:p-8">
        <span className="bg-gold-soft text-ink flex h-12 w-12 items-center justify-center rounded-full">
          {welcome.kind === 'sent' ? (
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          )}
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
          You’re in, {firstName.trim()}.
        </h1>
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
          Your NexG account is ready and you are signed in on this device.
        </p>
        <div
          role="status"
          aria-live="polite"
          className="bg-surface border-border text-ink mt-5 rounded-xl border p-4 text-sm font-semibold leading-6"
        >
          {welcome.kind === 'waiting' ? (
            <>
              Sending your welcome email in {welcome.seconds}s. We can send one email a minute to
              the same address.
            </>
          ) : welcome.kind === 'sending' ? (
            <>Sending your welcome email…</>
          ) : welcome.kind === 'sent' ? (
            <>
              We sent a welcome email to <strong className="break-all">{done.email}</strong>. Open
              it and choose <strong>Set your password</strong> so you can sign in on any device. Not
              there in a few minutes? Check spam or Promotions.
            </>
          ) : (
            <>{welcome.message}</>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button asChild size="lg" className="h-12 rounded-xl">
            <Link href={next ?? '/'}>
              {next ? 'Continue' : 'Start exploring'}{' '}
              <ArrowRight className="text-gold h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          {welcome.kind === 'failed' ? (
            <Link
              href="/forgot-password"
              className="text-ink text-sm font-extrabold underline underline-offset-4"
            >
              Send the password link again
            </Link>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Create your account</h1>
      <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
        Save your places, follow your orders and book stays faster.
      </p>

      <div className="mt-6">
        <SocialSignIn next={next} label="or sign up with email" />
      </div>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="first_name"
            label="First name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            error={errors['firstName']}
            required
          />
          <Input
            id="last_name"
            label="Last name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            error={errors['lastName']}
            required
          />
        </div>

        <div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id="email"
                type="email"
                label="Email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                readOnly={emailLocked}
                onChange={(event) => setEmail(event.target.value)}
                error={errors['email']}
                hint={
                  verified ? undefined : 'We’ll send a code to confirm it. It becomes your login.'
                }
                required
              />
            </div>
            {emailState.kind === 'idle' || emailState.kind === 'sending' ? (
              <Button
                type="button"
                className="mb-[3px] h-11 shrink-0"
                disabled={emailState.kind === 'sending'}
                onClick={() => void sendCode()}
              >
                {emailState.kind === 'sending' ? 'Sending…' : 'Send code'}
              </Button>
            ) : null}
          </div>

          {verified ? (
            <p className="text-success mt-2 flex items-center gap-1.5 text-sm font-bold">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Email confirmed
            </p>
          ) : null}

          {emailState.kind === 'code' || emailState.kind === 'checking' ? (
            <div className="bg-bg border-border mt-3 rounded-xl border p-4">
              <p className="text-[0.8125rem] font-semibold">
                We sent a code to <strong className="break-all">{emailState.email}</strong>. Enter
                it to confirm this is your email.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="w-40">
                  <Input
                    id="email_code"
                    label="Code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={8}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void checkCode();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  className="mb-[3px] h-11"
                  disabled={emailState.kind === 'checking'}
                  onClick={() => void checkCode()}
                >
                  {emailState.kind === 'checking' ? 'Checking…' : 'Confirm'}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => void sendCode()}
                  className="text-muted inline-flex items-center gap-1 text-[0.8125rem] font-extrabold underline-offset-4 hover:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Send again
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailState({ kind: 'idle' });
                    setCode('');
                    setEmailMessage(undefined);
                  }}
                  className="text-muted text-[0.8125rem] font-extrabold underline-offset-4 hover:underline"
                >
                  Change email
                </button>
              </div>
            </div>
          ) : null}

          {emailMessage ? (
            <p role="alert" className="text-danger mt-2 text-sm font-semibold">
              {emailMessage.text}{' '}
              {emailMessage.exists ? (
                <Link href={signInHref} className="text-ink underline underline-offset-4">
                  Sign in
                </Link>
              ) : null}
            </p>
          ) : null}
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
            ). NexG uses my details to run my orders and account, and never sells them.
          </span>
        </label>
        {errors['accepted'] ? (
          <p role="alert" className="text-danger -mt-2 text-sm font-semibold">
            {errors['accepted']}
          </p>
        ) : null}

        {errors['form'] ? (
          <p role="alert" className="text-danger text-sm font-semibold">
            {errors['form']}
          </p>
        ) : null}
        <Button
          type="submit"
          block
          size="lg"
          className="h-14 rounded-xl text-base"
          loading={pending}
          loadingText="Creating your account…"
          trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
        >
          Create account
        </Button>
      </form>

      <p className="text-muted-light mt-6 text-center text-xs font-semibold">
        Already have an account?{' '}
        <Link href={signInHref} className="text-ink font-bold underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
