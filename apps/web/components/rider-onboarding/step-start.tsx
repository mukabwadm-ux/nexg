'use client';

import { Button, Input, PhoneInput, useToast } from '@nexg/ui';
import { Check, Clock, MessageCircle, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Chip } from '@/components/onboarding/controls';
import { ContinueButton, FooterNote } from '@/components/onboarding/shell-frame';
import { createClient } from '@/lib/supabase/client';
import { ensureApplicantSession } from '@/lib/uploads';

import { RiderShell } from './rider-shell';
import { useRiderOnboarding } from './store';
import type { RiderDraft } from './types';

/**
 * Step 1 — a name, a number, and which city.
 *
 * Deliberately three things. A rider standing next to their bike deciding
 * whether this is worth their afternoon will not fill a form; they will fill
 * three fields and see what happens. Everything else is taps.
 */
export function RiderStartStep({ fleetToken }: { fleetToken?: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, setDraft, cities, patch, flushNow } = useRiderOnboarding();

  const [firstName, setFirstName] = React.useState(draft?.first_name ?? '');
  const [phone, setPhone] = React.useState<string | null>(draft?.phone ?? null);
  const [cityId, setCityId] = React.useState<string | null>(draft?.city_id ?? null);
  const [starting, setStarting] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [verified, setVerified] = React.useState(!!draft?.phone_verified_at);
  const [verifying, setVerifying] = React.useState(false);

  const chosenCity = cities.find((c) => c.id === cityId) ?? null;
  const isWaitlist = chosenCity?.status === 'waitlist';
  const started = !!draft;

  const start = async () => {
    if (!firstName.trim() || !phone) {
      toast({
        title: 'We need two things',
        description: 'Your first name and a phone number.',
        tone: 'danger',
      });
      return;
    }
    setStarting(true);

    const session = await ensureApplicantSession();
    if (!session) {
      setStarting(false);
      toast({
        title: 'We could not start a secure session',
        description: 'Check your connection and try again.',
        tone: 'danger',
      });
      return;
    }

    const supabase = createClient();
    const { data: riderId, error } = await supabase.rpc('rpc_rider_start', {
      p_first_name: firstName,
      p_phone: phone,
      p_city_id: cityId ?? undefined,
      p_fleet_token: fleetToken ?? undefined,
    });

    if (error || !riderId) {
      setStarting(false);
      toast({
        title: 'We could not save that',
        description: error?.message ?? 'Try again.',
        tone: 'danger',
      });
      return;
    }

    const { data: row } = await supabase
      .from('rider')
      .select('*')
      .eq('id', riderId as string)
      .maybeSingle();
    if (row) setDraft(row as unknown as RiderDraft);

    const { data: sent } = await supabase.rpc('rpc_rider_request_phone_code', {
      p_rider_id: riderId as string,
    });
    setStarting(false);

    const result = sent as { verified?: boolean; code?: string } | null;
    if (result?.verified) {
      setVerified(true);
      return;
    }
    setDevCode(result?.code ?? null);
  };

  const verify = async () => {
    if (!draft) return;
    setVerifying(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('rpc_rider_verify_phone_code', {
      p_rider_id: draft.id,
      p_code: code,
    });
    setVerifying(false);

    if (error) {
      toast({ title: 'That did not work', description: error.message, tone: 'danger' });
      return;
    }
    setVerified(true);
    await patch({ phone_verified_at: new Date().toISOString() } as Partial<RiderDraft>);
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
          : 'Your name and phone are all we need to start. Everything else is a few taps, and you can switch to your phone to snap the documents.'
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
            No account · no password · no paperwork yet
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

        {!started && (
          <Button
            className="mt-4"
            loading={starting}
            loadingText="Saving…"
            disabled={!firstName.trim() || !phone}
            onClick={() => void start()}
          >
            Send me a code
          </Button>
        )}

        {started && !verified && (
          <div className="mt-4">
            <CodeEntry
              code={code}
              onChange={setCode}
              onVerify={() => void verify()}
              verifying={verifying}
              onResend={() => void start()}
            />
            {devCode && (
              <p className="border-warning/40 bg-warning-bg text-warning mt-3 rounded-xl border p-3 text-xs font-bold leading-[1.7]">
                SMS is not connected on this environment, so we cannot text you. Your code is{' '}
                <strong className="font-mono text-sm tracking-widest">{devCode}</strong>. Once a
                sender is configured this code only ever exists in the message.
              </p>
            )}
          </div>
        )}

        {verified && (
          <p className="border-success/30 bg-success-bg text-success mt-4 flex items-center gap-2 rounded-xl border p-3 text-[0.8125rem] font-bold">
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            Phone verified · progress saves automatically from here
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

/** Six boxes, one code. Pasting the whole thing fills them all. */
function CodeEntry({
  code,
  onChange,
  onVerify,
  verifying,
  onResend,
}: {
  code: string;
  onChange: (next: string) => void;
  onVerify: () => void;
  verifying: boolean;
  onResend: () => void;
}) {
  const digits = code.padEnd(6, ' ').slice(0, 6).split('');

  React.useEffect(() => {
    if (code.length === 6) onVerify();
    // Verifying as the sixth digit lands: nobody wants to press a button
    // after typing a code they were just given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="max-w-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="rider_otp" className="text-[0.8125rem] font-bold">
          Enter the code we texted
        </label>
        <span className="flex gap-3">
          <button
            type="button"
            onClick={onResend}
            className="text-gold-text text-xs font-bold underline underline-offset-4"
          >
            resend
          </button>
          <button
            type="button"
            onClick={onResend}
            className="text-gold-text text-xs font-bold underline underline-offset-4"
          >
            get it on WhatsApp
          </button>
        </span>
      </div>

      <div className="relative mt-2">
        <input
          id="rider_otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          disabled={verifying}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
          className="absolute inset-0 h-full w-full cursor-pointer text-transparent caret-transparent opacity-0"
          aria-label="Six digit code"
        />
        <div aria-hidden="true" className="pointer-events-none flex gap-2">
          {digits.map((digit, index) => (
            <span
              key={index}
              className={`border-border-strong bg-surface flex h-12 w-full max-w-[3rem] items-center justify-center rounded-xl border text-lg font-extrabold ${
                index === code.length ? 'border-ink' : ''
              }`}
            >
              {digit.trim()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
