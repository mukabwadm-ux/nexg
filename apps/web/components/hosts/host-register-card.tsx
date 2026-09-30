'use client';

import { Button, ChipGroup, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';

import { applyAsHost, type HostApplyResult } from '@/app/hosts/actions';

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

export function HostRegisterCard() {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState('');
  const [listing, setListing] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [band, setBand] = React.useState<string | null>('1');
  const [handoff, setHandoff] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const [done, setDone] = React.useState<HostApplyResult | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next['name'] = 'We need a name to put on the QR pack.';
    if (!phone) next['phone'] = 'This is how we reach you about your guests.';
    if (!address.trim()) next['address'] = 'Where is the unit?';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    startTransition(async () => {
      const result = await applyAsHost({
        contact_name: name.trim(),
        display_name: name.trim(),
        phone: phone!,
        email: email.trim() || null,
        listing_link: listing.trim() || null,
        address: address.trim(),
        units_band: band ?? '1',
        handoff,
      });

      if (!result.ok) {
        toast({ title: 'That did not save', description: result.message });
        return;
      }
      setDone(result);
    });
  }

  if (done?.ok) {
    return (
      <div className="rounded-2xl border border-[#ECE8DF] bg-white p-6 sm:p-8">
        <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-[#B8901F]">
          List your Airbnb
        </p>
        <h3 className="mt-2 text-[1.5rem] font-extrabold leading-tight tracking-tight">
          Got it. We&rsquo;ll be in touch.
        </h3>
        <p className="mt-3 text-sm font-semibold leading-[1.8] text-[#5B5B5B]">
          We verify your first unit — usually within one working day — and send your QR pack the
          moment you&rsquo;re verified. Nothing to pay, now or later: guests pay per order.
        </p>
        <p className="mt-3 text-sm font-semibold leading-[1.8] text-[#5B5B5B]">
          We&rsquo;ve saved what you typed, so setting up the hand-off rule picks up where you left
          off.
        </p>
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
      </div>

      <Button type="submit" className="mt-6 w-full" disabled={pending}>
        {pending ? 'Sending…' : 'List my Airbnb'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <p className="mt-3 text-center text-[0.6875rem] font-semibold leading-relaxed text-[#8A8A8A]">
        By continuing you agree to the Host Terms. We use these details only to set up your units.
      </p>
    </form>
  );
}
