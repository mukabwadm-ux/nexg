'use client';

import { Button, Input, PhoneInput, useToast } from '@nexg/ui';
import { Check, Clock, MessageCircle, RefreshCw, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Chip } from '@/components/onboarding/controls';
import { ContinueButton, FooterNote } from '@/components/onboarding/shell-frame';
import {
  CODE_PATTERN,
  EMAIL_PATTERN,
  sendEmailCode,
  verifyEmailCode,
  type EmailCodeWording,
} from '@/lib/email-code';
import { createClient } from '@/lib/supabase/client';

import { RiderShell } from './rider-shell';
import { useRiderOnboarding } from './store';
import { VEHICLES, type RiderDraft, type Vehicle } from './types';

const WORDING: EmailCodeWording = {
  exists:
    'This email already has a NexG account. Sign in at the rider sign-in page, or use a different email.',
  signedInAs: (email) =>
    `You are signed in as ${email}. Sign out to apply as a rider with a different email.`,
};

/** What the /riders card already asked, so nobody types it twice. */
export interface RiderStartPrefill {
  firstName?: string;
  phone?: string;
  cityId?: string;
  vehicle?: string;
}

/**
 * Step 1 — a name, a number, and which city.
 *
 * Deliberately three things. A rider standing next to their bike deciding
 * whether this is worth their afternoon will not fill a form; they will fill
 * three fields and see what happens. Everything else is taps.
 */
export function RiderStartStep({
  fleetToken,
  prefill = {},
}: {
  fleetToken?: string | null;
  prefill?: RiderStartPrefill;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, setDraft, cities, patch, flushNow } = useRiderOnboarding();

  const [firstName, setFirstName] = React.useState(draft?.first_name ?? prefill.firstName ?? '');
  const [phone, setPhone] = React.useState<string | null>(draft?.phone ?? prefill.phone ?? null);
  const [cityId, setCityId] = React.useState<string | null>(
    draft?.city_id ?? (cities.some((c) => c.id === prefill.cityId) ? prefill.cityId! : null),
  );
  const [email, setEmail] = React.useState('');
  const [starting, setStarting] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [codeSentTo, setCodeSentTo] = React.useState<{ userId: string; email: string } | null>(
    null,
  );
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [verified, setVerified] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);

  /* Already confirmed on this device (a returning applicant): skip the code. */
  React.useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        const user = data.user;
        if (user && !user.is_anonymous && user.email && user.email_confirmed_at) {
          setEmail(user.email);
          setVerified(true);
        }
      });
  }, []);

  const chosenCity = cities.find((c) => c.id === cityId) ?? null;
  const isWaitlist = chosenCity?.status === 'waitlist';
  const started = !!draft;

  /*
   * One button: send the email code. The first time, this also opens the
   * application (an anonymous session, then the draft); the code confirms the
   * email on that same session, so it becomes the rider's login.
   */
  const start = async () => {
    const clean = email.trim().toLowerCase();
    if (!firstName.trim() || !phone || !EMAIL_PATTERN.test(clean)) {
      toast({
        title: 'We need three things',
        description: 'Your first name, an M-Pesa phone number and your email.',
        tone: 'danger',
      });
      return;
    }
    setStarting(true);
    setEmailError(null);
    const supabase = createClient();
    try {
      const sent = await sendEmailCode(supabase.auth, clean, WORDING);

      if (!draft) {
        const { data: riderId, error } = await supabase.rpc('rpc_rider_start', {
          p_first_name: firstName,
          p_phone: phone,
          p_city_id: cityId ?? undefined,
          p_fleet_token: fleetToken ?? undefined,
        });
        if (error || !riderId)
          throw new Error(error?.message ?? 'We could not save that. Try again.');
        const vehicle = VEHICLES.find((v) => v.value === prefill.vehicle)?.value as
          | Vehicle
          | undefined;
        if (vehicle)
          await supabase.rpc('rpc_rider_set_vehicle', {
            p_rider_id: riderId as string,
            p_vehicle: vehicle,
          });
        const { data: row } = await supabase
          .from('rider')
          .select('*')
          .eq('id', riderId as string)
          .maybeSingle();
        if (row) setDraft(row as unknown as RiderDraft);
      }

      if (sent.verified) setVerified(true);
      else {
        setCode('');
        setCodeSentTo({ userId: sent.userId, email: clean });
      }
    } catch (error) {
      setEmailError(
        error instanceof Error ? error.message : 'We could not send a code. Try again.',
      );
    } finally {
      setStarting(false);
    }
  };

  const verify = async () => {
    if (!codeSentTo) return;
    if (!CODE_PATTERN.test(code)) {
      setEmailError('Enter the 6- or 8-digit code from the email.');
      return;
    }
    setVerifying(true);
    setEmailError(null);
    try {
      await verifyEmailCode(
        createClient().auth,
        codeSentTo.userId,
        codeSentTo.email,
        code,
        WORDING,
      );
      setVerified(true);
      setCodeSentTo(null);
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'That code did not work.');
    } finally {
      setVerifying(false);
    }
  };

  const waitlist = async () => {
    if (!draft || !cityId) return;
    const supabase = createClient();
    const { error } = await supabase.rpc('rpc_rider_waitlist', {
      p_rider_id: draft.id,
      p_city_id: cityId,
    });
    if (error) {
      toast({ title: 'We could not save that', description: error.message, tone: 'danger' });
      return;
    }
    toast({
      title: 'You are first in line',
      description: 'We keep your details and call you when the city opens.',
      tone: 'success',
    });
    router.push('/riders/status');
  };

  const canContinue = started && verified && !!cityId && !isWaitlist;

  return (
    <RiderShell
      step={1}
      eyebrow="Ride with NexG"
      title={
        isWaitlist
          ? `${chosenCity?.name} is coming. You’re early.`
          : 'Two minutes now, paperwork later.'
      }
      intro={
        isWaitlist
          ? 'We are not dispatching there yet. Save your details and you are first in line — early riders get the first onboarding slots.'
          : 'Your name, phone and email are all we need to start. Your email becomes your rider login. Everything else is a few taps, and you can switch to your phone to snap the documents.'
      }
      footer={
        isWaitlist && started ? (
          <>
            <ContinueButton onClick={() => void waitlist()}>
              Save my place &amp; finish
            </ContinueButton>
            <FooterNote>Nothing is lost — we keep your answers</FooterNote>
          </>
        ) : (
          <>
            <ContinueButton
              disabled={!canContinue}
              onClick={async () => {
                patch({ city_id: cityId }, 2);
                await flushNow();
                router.push('/riders/apply/ride');
              }}
            >
              Start · what do you ride?
            </ContinueButton>
            <FooterNote>Your name is all a guest sees until you are active</FooterNote>
          </>
        )
      }
    >
      {fleetToken && (
        <p className="border-gold/40 bg-gold-soft text-gold-text mb-5 rounded-xl border p-3 text-[0.8125rem] font-bold leading-[1.7]">
          Added by a NexG merchant · you still complete the same verification as any NexG rider.
        </p>
      )}

      {/* --------------------------------------------------------- about you */}
      <div className="border-border bg-surface rounded-2xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[0.9375rem] font-extrabold">About you</p>
          <p className="text-muted-light text-xs font-semibold">
            Your email becomes your login · no paperwork yet
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            id="first_name"
            label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            disabled={started}
            required
          />
          <PhoneInput
            id="rider_phone"
            label="Phone — this becomes your M-Pesa payout number"
            value={phone}
            onChange={setPhone}
            disabled={started}
            required
          />
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-64">
            <Input
              id="rider_email"
              type="email"
              label="Email — this becomes your rider login"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={verified || codeSentTo !== null}
              required
            />
          </div>
          {!verified && codeSentTo === null && (
            <Button
              className="mb-[3px] h-11"
              loading={starting}
              loadingText="Sending…"
              disabled={!firstName.trim() || !phone || !EMAIL_PATTERN.test(email.trim())}
              onClick={() => void start()}
            >
              Send email code
            </Button>
          )}
        </div>

        {codeSentTo && !verified && (
          <div className="border-border bg-bg mt-4 rounded-xl border p-4">
            <p className="text-[0.8125rem] font-semibold">
              We sent a code to <strong className="break-all">{codeSentTo.email}</strong>. Enter it
              to confirm your email.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="w-40">
                <Input
                  id="rider_email_code"
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
                      void verify();
                    }
                  }}
                />
              </div>
              <Button className="mb-[3px] h-11" loading={verifying} onClick={() => void verify()}>
                Confirm
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => void start()}
                className="text-gold-text inline-flex items-center gap-1 text-xs font-bold underline underline-offset-4"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Send again
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeSentTo(null);
                  setCode('');
                  setEmailError(null);
                }}
                className="text-gold-text text-xs font-bold underline underline-offset-4"
              >
                Change email
              </button>
            </div>
          </div>
        )}

        {emailError && (
          <p role="alert" className="text-danger mt-3 text-[0.8125rem] font-bold">
            {emailError}
          </p>
        )}

        {verified && (
          <p className="border-success/30 bg-success-bg text-success mt-4 flex items-center gap-2 rounded-xl border p-3 text-[0.8125rem] font-bold">
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            Email confirmed · progress saves automatically from here
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------- city */}
      <div className="border-border bg-surface mt-4 rounded-2xl border p-5 sm:p-6">
        <p className="text-[0.9375rem] font-extrabold">Where will you ride?</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {cities.map((city) => (
            <Chip
              key={city.id}
              selected={cityId === city.id}
              onClick={() => {
                setCityId(city.id);
                if (started) patch({ city_id: city.id }, 1);
              }}
            >
              {city.name}
              {city.status === 'waitlist' ? ' · soon' : ''}
            </Chip>
          ))}
        </div>
        <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
          Pick a city that is live. If yours is not yet, we save your place and call you first when
          it opens.
        </p>
      </div>

      {/* ----------------------------------------------------- reassurance row */}
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Shield, text: 'Nothing is shared until our team verifies you' },
          { icon: Clock, text: '5 short steps · about 6 minutes' },
          { icon: MessageCircle, text: 'Finish on your phone or WhatsApp any time' },
        ].map((item) => (
          <li key={item.text} className="flex items-start gap-2.5">
            <item.icon className="text-gold-text mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-muted text-[0.8125rem] font-semibold leading-[1.6]">
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </RiderShell>
  );
}
