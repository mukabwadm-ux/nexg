'use client';

import { Button, ChipGroup, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { applyAsHost, type HostApplyResult } from '@/app/(customer)/hosts/actions';
import { HostEmailVerification } from '@/components/hosts/host-email-verification';
import { createClient } from '@/lib/supabase/client';

/**
 * The "List your Airbnb" form from the `Hosts` artboard.
 *
 * Everything here carries into onboarding step 2, so nothing is asked
 * twice. The hand-off chips are the one field worth collecting before
 * anybody signs in: it is the question hosts actually think about, and
 * it sets the tone that NexG follows their rule rather than imposing
 * one.
 */

const UNIT_BANDS = [
  { value: '1', label: '1' },
  { value: '2_5', label: '2–5' },
  { value: '6_20', label: '6–20' },
  { value: '20_plus', label: '20+' },
];

const HANDOFFS = [
  { value: 'guest_meets_at_gate', label: 'Guest meets at gate' },
  { value: 'leave_with_askari', label: 'Leave with askari · caretaker' },
  { value: 'lockbox', label: 'Lockbox' },
  { value: 'call_guest_first', label: 'Call guest first' },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * form → verify (email code, which turns the anonymous session into the
 * host's login) → done (welcome email with a set-password link sent).
 */
type Step =
  | { kind: 'form' }
  | { kind: 'verify'; actorId: string; email: string; reference?: string }
  | { kind: 'done'; ok: boolean; message: string; email: string; reference?: string };

export function HostRegisterCard() {
  const { toast } = useToast();
  const router = useRouter();
  const [step, setStep] = React.useState<Step>({ kind: 'form' });
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState('');
  const [listing, setListing] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [band, setBand] = React.useState<string | null>('1');
  const [handoff, setHandoff] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next['name'] = 'We need a name to put on the QR pack.';
    if (!phone) next['phone'] = 'This is how we reach you about your guests.';
    if (!EMAIL.test(email.trim())) next['email'] = 'This becomes your login. We send a code to it.';
    if (!address.trim()) next['address'] = 'Where is the unit?';
    if (!handoff) next['handoff'] = 'Choose how riders should hand over.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    startTransition(async () => {
      const cleanEmail = email.trim().toLowerCase();
      const auth = createClient().auth;

      /* The application belongs to whoever submits it, so it needs a session:
         an anonymous one becomes the host's login once the email is verified. */
      let { data } = await auth.getUser();
      if (!data.user) {
        const signedIn = await auth.signInAnonymously();
        if (signedIn.error || !signedIn.data.user) {
          toast({
            title: 'That did not save',
            description: 'We could not start your application. Reload the page and try again.',
          });
          return;
        }
        data = { user: signedIn.data.user };
      }
      const user = data.user!;
      if (!user.is_anonymous && user.email?.toLowerCase() !== cleanEmail) {
        toast({
          title: 'You are signed in with another email',
          description: `Use ${user.email} or sign out first.`,
        });
        return;
      }

      const result: HostApplyResult = await applyAsHost({
        contact_name: name.trim(),
        display_name: name.trim(),
        phone: phone!,
        email: cleanEmail,
        listing_link: listing.trim() || null,
        address: address.trim(),
        units_band: band ?? '1',
        handoff: handoff!,
      });

      if (!result.ok) {
        toast({ title: 'That did not save', description: result.message });
        return;
      }
      /* Already a verified account (a guest who signed up earlier): straight in. */
      if (!user.is_anonymous && user.email_confirmed_at) {
        router.push('/host');
        return;
      }
      setStep({
        kind: 'verify',
        actorId: user.id,
        email: cleanEmail,
        ...(result.ticketReference ? { reference: result.ticketReference } : {}),
      });
    });
  }

  if (step.kind === 'verify') {
    return (
      <HostEmailVerification
        actorId={step.actorId}
        email={step.email}
        onDone={(outcome) =>
          setStep({
            kind: 'done',
            ok: outcome.ok,
            message: outcome.message,
            email: step.email,
            ...(step.reference ? { reference: step.reference } : {}),
          })
        }
      />
    );
  }

  if (step.kind === 'done') {
    return (
      <div className="rounded-2xl border border-[#ECE8DF] bg-white p-6 sm:p-8">
        <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-[#B8901F]">
          Email verified
        </p>
        <h3 className="mt-2 text-[1.5rem] font-extrabold leading-tight tracking-tight">
          {step.ok ? 'Check your inbox to set your password.' : 'Your application is saved.'}
        </h3>
        <p className="mt-3 text-sm font-semibold leading-[1.8] text-[#5B5B5B]">
          {step.ok
            ? `We sent a welcome email to ${step.email} with a link to set your password.`
            : step.message}
        </p>
        <ol className="mt-4 space-y-2 text-sm font-semibold leading-[1.7] text-[#3A352B]">
          <li>1. Set your password from the email, then sign in to your host workspace.</li>
          <li>2. Upload your ID or passport and proof of authority to let the property.</li>
          <li>
            3. NexG reviews them, usually within one working day. Once approved, you can list and
            manage your units.
          </li>
        </ol>
        <p className="mt-4 text-sm font-semibold leading-[1.8] text-[#5B5B5B]">
          Your first month of management is free.
          {step.reference ? (
            <>
              {' '}
              Your reference is{' '}
              <span className="font-extrabold text-[#1A1A1A]">{step.reference}</span>.
            </>
          ) : null}
        </p>
        {!step.ok ? (
          <Link
            href="/forgot-password"
            className="mt-4 inline-block text-sm font-extrabold underline underline-offset-4"
          >
            Send the password link again
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[#ECE8DF] bg-white p-6 sm:p-8"
      noValidate
    >
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
        <Input
          id="host_email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          {...(errors['email'] ? { error: errors['email'] } : {})}
        />
        <Input
          id="host_listing"
          label="Listing link"
          placeholder="airbnb.com/rooms/… (optional)"
          value={listing}
          onChange={(event) => setListing(event.target.value)}
        />
      </div>

      <div className="mt-4">
        <Input
          id="host_address"
          label="First unit address"
          placeholder="Building, apartment no., area, city"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          {...(errors['address'] ? { error: errors['address'] } : {})}
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

      <div className="mt-5">
        <ChipGroup
          id="host_handoff"
          label="How should riders hand over?"
          options={HANDOFFS}
          value={handoff}
          onChange={setHandoff}
        />
        {errors['handoff'] ? (
          <p role="alert" className="mt-1.5 text-[0.75rem] font-semibold text-[#B42318]">
            {errors['handoff']}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="mt-6 w-full" disabled={pending}>
        {pending ? 'Sending…' : 'List my Airbnb'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <p className="mt-3 text-center text-[0.6875rem] font-semibold leading-relaxed text-[#8A8A8A]">
        Next we send a code to your email to create your login. By continuing you agree to the Host
        Terms. We use these details only to set up your units.
      </p>
    </form>
  );
}
