'use client';

import { Button, ChipGroup, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight, Bath, BedDouble, CheckCircle2, RefreshCw, Star, Users } from 'lucide-react';
import * as React from 'react';

import { applyAsHost } from '@/app/(customer)/hosts/actions';
import { previewAirbnbListing } from '@/app/(customer)/hosts/listing-actions';
import { parseAirbnbUrl, type AirbnbListing } from '@/lib/airbnb-listing';
import {
  CODE_PATTERN,
  EMAIL_PATTERN,
  HostEmailError,
  sendHostEmailCode,
  verifyHostEmailCode,
} from '@/lib/host-email';
import { createClient } from '@/lib/supabase/client';

import { HostWelcome, useHostWelcome, type HostDone } from './host-welcome';

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

type EmailState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'code'; userId: string; email: string }
  | { kind: 'checking'; userId: string; email: string }
  | { kind: 'verified'; email: string };

type Preview =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; listing: AirbnbListing }
  | { kind: 'error'; message: string };

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/* "Is this your listing?": what we read from the Airbnb link. */
function ListingCard({
  listing,
  confirmed,
  consent,
  onConfirm,
  onReject,
  onConsent,
}: {
  listing: AirbnbListing;
  confirmed: boolean;
  consent: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onConsent: (value: boolean) => void;
}) {
  const facts = [
    listing.bedrooms !== null
      ? {
          icon: BedDouble,
          text: listing.bedrooms === 0 ? 'Studio' : plural(listing.bedrooms, 'bedroom', 'bedrooms'),
        }
      : null,
    listing.bathrooms !== null
      ? { icon: Bath, text: plural(listing.bathrooms, 'bath', 'baths') }
      : null,
    listing.maxGuests !== null
      ? { icon: Users, text: plural(listing.maxGuests, 'guest', 'guests') }
      : null,
    listing.rating !== null
      ? { icon: Star, text: listing.rating.toFixed(2).replace(/0$/, '') }
      : null,
  ].filter(Boolean) as { icon: typeof Bath; text: string }[];

  return (
    <div
      className={`mt-3 overflow-hidden rounded-xl border transition-colors ${
        confirmed ? 'border-[#1F7A3A] bg-[#F3FAF5]' : 'border-[#ECE6D8] bg-[#FBF9F4]'
      }`}
    >
      <div className="flex gap-3 p-3">
        {listing.photoUrl ? (
          // Airbnb's own preview image, shown as-is; it is copied only on submit, with consent.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.photoUrl}
            alt=""
            className="h-20 w-24 shrink-0 rounded-lg object-cover sm:h-24 sm:w-32"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.1em] text-[#8A6A12]">
            {confirmed ? 'Your Airbnb listing' : 'Is this your listing?'}
          </p>
          <p className="mt-0.5 truncate text-[0.9375rem] font-extrabold text-[#141414]">
            {listing.name ?? 'Airbnb listing'}
          </p>
          <p className="text-[0.8125rem] font-semibold text-[#5B5548]">
            {[listing.typeLabel, listing.city].filter(Boolean).join(' · ')}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {facts.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-1 text-[0.75rem] font-bold text-[#3A352B]"
              >
                <Icon className="h-3.5 w-3.5 text-[#8A6A12]" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-[#ECE6D8] px-3 py-2.5">
        {confirmed ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-[#1F7A3A]">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> We will set up your property
              and first unit from this listing.
            </p>
            {listing.photoUrl ? (
              <label className="flex items-start gap-2 text-[0.8125rem] font-semibold text-[#3A352B]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#141414]"
                  checked={consent}
                  onChange={(event) => onConsent(event.target.checked)}
                />
                Also copy the cover photo. I own it or have the right to use it.
              </label>
            ) : null}
            <button
              type="button"
              onClick={onReject}
              className="text-[0.8125rem] font-extrabold text-[#5B5548] underline-offset-4 hover:underline"
            >
              Don’t use this listing
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-9" onClick={onConfirm}>
              Yes, use it
            </Button>
            <Button type="button" variant="outline" className="h-9" onClick={onReject}>
              Not mine
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof HostEmailError ? error.message : fallback;

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="flex items-center gap-2.5 text-[0.9375rem] font-extrabold text-[#141414]">
        <span
          aria-hidden="true"
          className="text-gold flex h-6 w-6 items-center justify-center rounded-full bg-[#141414] text-[0.75rem]"
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
  const [preview, setPreview] = React.useState<Preview>({ kind: 'idle' });
  const [listingConfirmed, setListingConfirmed] = React.useState(false);
  const [photoConsent, setPhotoConsent] = React.useState(false);

  /* Read the Airbnb listing shortly after a link is pasted or typed. Each
     link change starts over: the card and the confirmation belong to it. */
  React.useEffect(() => {
    setListingConfirmed(false);
    setPhotoConsent(false);
    if (!parseAirbnbUrl(listing)) {
      setPreview({ kind: 'idle' });
      return;
    }
    let current = true;
    const timer = setTimeout(async () => {
      setPreview({ kind: 'loading' });
      const result = await previewAirbnbListing(listing.trim());
      if (!current) return;
      setPreview(
        result.ok
          ? { kind: 'ready', listing: result.listing }
          : { kind: 'error', message: result.message },
      );
    }, 600);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [listing]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [emailState, setEmailState] = React.useState<EmailState>({ kind: 'idle' });
  const [code, setCode] = React.useState('');
  const [emailMessage, setEmailMessage] = React.useState('');
  const [lastEmailAt, setLastEmailAt] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const { done, start: sendWelcome } = useHostWelcome();

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
        import_listing: preview.kind === 'ready' && listingConfirmed,
        photo_consent: preview.kind === 'ready' && listingConfirmed && photoConsent,
      });
      if (!result.ok) {
        toast({ title: 'That did not save', description: result.message });
        return;
      }
      const base: HostDone = {
        email: loginEmail,
        welcome: 'sending',
        ...(result.ticketReference ? { reference: result.ticketReference } : {}),
        ...(result.imported ? { imported: result.imported } : {}),
      };
      void sendWelcome(base, lastEmailAt);
    });
  }

  if (done) return <HostWelcome done={done} />;

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
        <Input
          id="host_listing"
          label="Airbnb listing link (optional)"
          placeholder="airbnb.com/rooms/…"
          inputMode="url"
          value={listing}
          onChange={(event) => setListing(event.target.value)}
        />
        <p className="mt-1.5 text-[0.75rem] font-semibold text-[#8A8A8A]">
          Paste it and we fill in your property and unit for you.
        </p>
        {preview.kind === 'loading' ? (
          <p role="status" className="mt-2 text-[0.8125rem] font-semibold text-[#5B5548]">
            Reading your listing…
          </p>
        ) : preview.kind === 'error' ? (
          <p className="mt-2 text-[0.8125rem] font-semibold text-[#8A6A12]">{preview.message}</p>
        ) : preview.kind === 'ready' ? (
          <ListingCard
            listing={preview.listing}
            confirmed={listingConfirmed}
            consent={photoConsent}
            onConfirm={() => setListingConfirmed(true)}
            onReject={() => {
              setListing('');
              setPreview({ kind: 'idle' });
            }}
            onConsent={setPhotoConsent}
          />
        ) : null}

        <div className="mt-4">
          <Input
            id="host_address"
            label="Unit address"
            placeholder="Building, apartment no., area, city"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            {...(errors['address'] ? { error: errors['address'] } : {})}
          />
          <p className="mt-1.5 text-[0.75rem] font-semibold text-[#8A8A8A]">
            The exact address riders deliver to. Airbnb does not share it, so we ask.
          </p>
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
