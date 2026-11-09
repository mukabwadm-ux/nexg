'use client';

import { Button, ChipGroup, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight, CheckCircle2, Mail, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { applyAsHost } from '@/app/(customer)/hosts/actions';
import { sendHostPasswordSetupLink } from '@/app/(customer)/sign-in/actions';
import {
  CODE_PATTERN,
  EMAIL_PATTERN,
  HostEmailError,
  sendHostEmailCode,
  verifyHostEmailCode,
} from '@/lib/host-email';
import { createClient } from '@/lib/supabase/client';

/**
 * The host registration form on /hosts.
 *
 * 1. About you: name, phone (may be shared with a merchant account) and the
 *    login email, verified right here with a code before submitting.
 * 2. The first unit: address, listing link and how many units they manage.
 *    The rider hand-off rule is set per unit later, in the workspace.
 *
 * Submitting creates the host on the verified login and sends the welcome
 * email (set-password link + how to reach the workspace), as for merchants.
 */

const UNIT_BANDS = [
  { value: '1', label: '1' },
  { value: '2_5', label: '2–5' },
  { value: '6_20', label: '6–20' },
  { value: '20_plus', label: '20+' },
];

/* Supabase sends one auth email per address per minute. */
const EMAIL_GAP_MS = 61_000;

type EmailState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'code'; userId: string; email: string }
  | { kind: 'checking'; userId: string; email: string }
  | { kind: 'verified'; email: string };

type Done = {
  email: string;
  reference?: string;
  welcome: 'sending' | 'waiting' | 'sent' | 'failed';
  message?: string;
  wait?: number;
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof HostEmailError ? error.message : fallback;

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="flex items-center gap-2.5 text-[0.9375rem] font-extrabold text-[#141414]">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#141414] text-[0.75rem] text-[#F2C94C]"
        >
          {n}
        </span>
        {title}
      </legend>
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

export function HostRegisterCard() {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState('');
  const [listing, setListing] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [band, setBand] = React.useState<string | null>('1');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [emailState, setEmailState] = React.useState<EmailState>({ kind: 'idle' });
  const [code, setCode] = React.useState('');
  const [emailMessage, setEmailMessage] = React.useState('');
  const [lastEmailAt, setLastEmailAt] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const [done, setDone] = React.useState<Done | null>(null);

  const verified = emailState.kind === 'verified';
  const emailLocked = emailState.kind !== 'idle';

  async function sendCode() {
    setEmailMessage('');
    if (!EMAIL_PATTERN.test(email.trim())) {
      setErrors((e) => ({ ...e, email: 'Enter a valid email address.' }));
      return;
    }
    setErrors(({ email: _ignored, ...rest }) => rest);
    setEmailState({ kind: 'sending' });
    try {
      const clean = email.trim().toLowerCase();
      const result = await sendHostEmailCode(createClient().auth, clean);
      if (result.verified) {
        setEmailState({ kind: 'verified', email: clean });
        return;
      }
      setLastEmailAt(Date.now());
      setCode('');
      setEmailState({ kind: 'code', userId: result.userId, email: clean });
    } catch (error) {
      setEmailState({ kind: 'idle' });
      setEmailMessage(errorText(error, 'We could not send a code. Try again.'));
    }
  }

  async function checkCode() {
    if (emailState.kind !== 'code') return;
    if (!CODE_PATTERN.test(code)) {
      setEmailMessage('Enter the 6- or 8-digit code from the email.');
      return;
    }
    const { userId, email: clean } = emailState;
    setEmailState({ kind: 'checking', userId, email: clean });
    setEmailMessage('');
    try {
      await verifyHostEmailCode(createClient().auth, userId, clean, code);
      setEmailState({ kind: 'verified', email: clean });
    } catch (error) {
      setEmailState({ kind: 'code', userId, email: clean });
      setEmailMessage(errorText(error, 'That code did not work. Send a new one.'));
    }
  }

  function changeEmail() {
    setEmailState({ kind: 'idle' });
    setCode('');
    setEmailMessage('');
  }

  /* The welcome email, waiting out Supabase's one-email-a-minute limit when
     the code was sent moments ago. */
  const sendWelcome = React.useCallback(async (base: Done, sentAt: number) => {
    const wait = sentAt + EMAIL_GAP_MS - Date.now();
    if (wait > 0) {
      setDone({ ...base, welcome: 'waiting', wait: Math.ceil(wait / 1000) });
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    setDone({ ...base, welcome: 'sending' });
    let result = await sendHostPasswordSetupLink();
    if (!result.ok && result.rateLimited) {
      setDone({ ...base, welcome: 'waiting', wait: Math.ceil(EMAIL_GAP_MS / 1000) });
      await new Promise((resolve) => setTimeout(resolve, EMAIL_GAP_MS));
      result = await sendHostPasswordSetupLink();
    }
    setDone({ ...base, welcome: result.ok ? 'sent' : 'failed', message: result.message });
  }, []);

  /* A visible countdown while the welcome email waits. */
  React.useEffect(() => {
    if (done?.welcome !== 'waiting' || !done.wait) return;
    const timer = setTimeout(
      () =>
        setDone((d) => (d && d.welcome === 'waiting' && d.wait ? { ...d, wait: d.wait - 1 } : d)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [done]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next['name'] = 'We need a name to put on the QR pack.';
    if (!phone) next['phone'] = 'This is how we reach you about your guests.';
    if (!verified) next['email'] = 'Verify your email first. It becomes your login.';
    if (!address.trim()) next['address'] = 'Where is the unit?';
    setErrors(next);
    if (Object.keys(next).length > 0 || emailState.kind !== 'verified') return;
    const loginEmail = emailState.email;

    startTransition(async () => {
      const result = await applyAsHost({
        contact_name: name.trim(),
        display_name: name.trim(),
        phone: phone!,
        listing_link: listing.trim() || null,
        address: address.trim(),
        units_band: band ?? '1',
      });
      if (!result.ok) {
        toast({ title: 'That did not save', description: result.message });
        return;
      }
      const base: Done = {
        email: loginEmail,
        welcome: 'sending',
        ...(result.ticketReference ? { reference: result.ticketReference } : {}),
      };
      setDone(base);
      void sendWelcome(base, lastEmailAt);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[#ECE8DF] bg-white p-6 sm:p-8">
        <p className="flex items-center gap-2 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-[#1F7A3A]">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Host account created
        </p>
        <h3 className="mt-2 text-[1.5rem] font-extrabold leading-tight tracking-tight">
          Welcome to NexG Hosts.
        </h3>

        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-xl bg-[#F6F3EC] p-4 text-sm font-semibold leading-[1.6] text-[#3A352B]"
        >
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#B8901F]" aria-hidden="true" />
          <span>
            {done.welcome === 'sent' ? (
              <>
                We sent your welcome email to <strong>{done.email}</strong>. It has your login and a
                link to set your password.
              </>
            ) : done.welcome === 'waiting' ? (
              <>
                Sending your welcome email to <strong>{done.email}</strong> in {done.wait ?? 60}s
                (we can send one email a minute to the same address).
              </>
            ) : done.welcome === 'failed' ? (
              done.message
            ) : (
              <>
                Sending your welcome email to <strong>{done.email}</strong>…
              </>
            )}
          </span>
        </div>

        <ol className="mt-5 space-y-2 text-sm font-semibold leading-[1.7] text-[#3A352B]">
          <li>1. Open your host workspace. You are already signed in on this device.</li>
          <li>2. Upload your ID or passport and proof of authority to let the property.</li>
          <li>
            3. NexG reviews them, usually within one working day. Once approved, you can list and
            manage your units.
          </li>
        </ol>
        <p className="mt-4 text-sm font-semibold leading-[1.8] text-[#5B5B5B]">
          Your first month of management is free.
          {done.reference ? (
            <>
              {' '}
              Your reference is{' '}
              <span className="font-extrabold text-[#1A1A1A]">{done.reference}</span>.
            </>
          ) : null}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button asChild>
            <a href="/host">
              Open my host workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
          {done.welcome === 'failed' ? (
            <Link
              href="/forgot-password"
              className="text-sm font-extrabold underline underline-offset-4"
            >
              Send the password link again
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-7 rounded-2xl border border-[#ECE8DF] bg-white p-6 sm:p-8"
      noValidate
    >
      <Section n={1} title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="host_name"
            label="Your name"
            placeholder="Host or property manager"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            {...(errors['name'] ? { error: errors['name'] } : {})}
          />
          <PhoneInput
            id="host_phone"
            label="Phone"
            value={phone}
            onChange={setPhone}
            {...(errors['phone'] ? { error: errors['phone'] } : {})}
          />
        </div>

        <div className="mt-4">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id="host_email"
                type="email"
                label="Email (your login)"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                readOnly={emailLocked}
                onChange={(event) => setEmail(event.target.value)}
                {...(errors['email'] ? { error: errors['email'] } : {})}
              />
            </div>
            {verified ? (
              <span className="mb-[3px] inline-flex h-11 items-center gap-1.5 rounded-lg bg-[#E9F5EC] px-3 text-[0.8125rem] font-extrabold text-[#1F7A3A]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Verified
              </span>
            ) : emailState.kind === 'idle' || emailState.kind === 'sending' ? (
              <Button
                type="button"
                variant="outline"
                className="mb-[3px] h-11 shrink-0"
                disabled={emailState.kind === 'sending'}
                onClick={() => void sendCode()}
              >
                {emailState.kind === 'sending' ? 'Sending…' : 'Verify email'}
              </Button>
            ) : null}
          </div>

          {emailState.kind === 'code' || emailState.kind === 'checking' ? (
            <div className="mt-3 rounded-xl border border-[#ECE6D8] bg-[#FBF9F4] p-4">
              <p className="text-[0.8125rem] font-semibold text-[#3A352B]">
                We sent a code to <strong>{emailState.email}</strong>. Enter it to confirm this is
                your email.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="w-44">
                  <Input
                    id="host_email_code"
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
                <button
                  type="button"
                  onClick={() => void sendCode()}
                  className="mb-3 inline-flex items-center gap-1 text-[0.8125rem] font-extrabold text-[#5B5548] underline-offset-4 hover:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Send again
                </button>
                <button
                  type="button"
                  onClick={changeEmail}
                  className="mb-3 text-[0.8125rem] font-extrabold text-[#5B5548] underline-offset-4 hover:underline"
                >
                  Change email
                </button>
              </div>
            </div>
          ) : null}

          {emailMessage ? (
            <p role="alert" className="mt-2 text-[0.8125rem] font-semibold text-[#B42318]">
              {emailMessage}
            </p>
          ) : null}
        </div>
      </Section>

      <Section n={2} title="Your first unit">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="host_address"
            label="Unit address"
            placeholder="Building, apartment no., area, city"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            {...(errors['address'] ? { error: errors['address'] } : {})}
          />
          <Input
            id="host_listing"
            label="Listing link (optional)"
            placeholder="airbnb.com/rooms/…"
            value={listing}
            onChange={(event) => setListing(event.target.value)}
          />
        </div>

        <div className="mt-5">
          <ChipGroup
            id="host_units"
            label="How many units do you manage?"
            options={UNIT_BANDS}
            value={band}
            onChange={setBand}
            selectedTone="gold"
          />
        </div>
      </Section>

      <div>
        <Button type="submit" className="w-full" disabled={pending || !verified}>
          {pending ? 'Creating your account…' : 'Create my host account'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="mt-3 text-center text-[0.6875rem] font-semibold leading-relaxed text-[#8A8A8A]">
          {verified
            ? 'We will email your login and a link to set your password.'
            : 'Verify your email above to continue.'}{' '}
          By continuing you agree to the Host Terms.
        </p>
      </div>
    </form>
  );
}
