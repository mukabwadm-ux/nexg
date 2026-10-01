'use client';

import { Button, ChipGroup, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight, Check } from 'lucide-react';
import * as React from 'react';

import { requestStay } from '@/app/stays/actions';

/**
 * "Tell us what you need" — the hero form.
 *
 * The questions are the ones that actually narrow a shortlist: where,
 * when, how many of you, what the stay is for, and the two or three
 * things that would make it wrong. Everything else is a conversation
 * the desk has afterwards.
 *
 * Budget is optional and phrased as a ceiling, not a filter. Somebody
 * who leaves it blank gets a range back rather than nothing.
 */

const PURPOSES = [
  { value: 'business', label: 'Work trip' },
  { value: 'leisure', label: 'Holiday' },
  { value: 'family', label: 'Family' },
  { value: 'relocation', label: 'Relocating' },
  { value: 'crew', label: 'Team or crew' },
  { value: 'event', label: 'Event' },
];

const MUST_HAVES = [
  'Fast Wi-Fi',
  'Workspace',
  'Backup generator',
  'Full kitchen',
  'Parking',
  'Garden',
  'Pet friendly',
  'Gym',
  'Step-free access',
];

export function TailorForm({
  areas,
  compact,
  subject,
  heading,
}: {
  areas: string[];
  compact?: boolean;
  /** The property or unit this enquiry is about, if it came from one. */
  subject?: string;
  heading?: string;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState('');
  const [checkIn, setCheckIn] = React.useState('');
  const [checkOut, setCheckOut] = React.useState('');
  const [guests, setGuests] = React.useState('2');
  const [bedrooms, setBedrooms] = React.useState('');
  const [budget, setBudget] = React.useState('');
  const [purpose, setPurpose] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [pickedAreas, setPickedAreas] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const [reference, setReference] = React.useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!phone && !email.trim()) {
      next['contact'] = 'A phone number or an email — otherwise we cannot come back to you.';
    }
    if (checkIn && checkOut && checkOut <= checkIn) {
      next['dates'] = 'The second date needs to be after the first.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    startTransition(async () => {
      const result = await requestStay({
        name: name.trim(),
        phone,
        email: email.trim() || null,
        city: 'nairobi',
        areas: pickedAreas,
        check_in: checkIn || null,
        check_out: checkOut || null,
        guests: guests ? Number(guests) : null,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        budget: budget ? Number(budget) : null,
        purpose,
        must_haves: picked,
        /* The place they were looking at leads the note, so the desk
           does not have to work out which one "the one with the
           balcony" was. */
        notes: [subject ? `Asking about ${subject}.` : null, notes.trim() || null]
          .filter(Boolean)
          .join(' ') || null,
        consent_marketing: false,
        source: subject ? 'stays_property' : 'stays_hero',
      });

      if (!result.ok) {
        toast({ title: 'That did not send', description: result.message });
        return;
      }
      setReference(result.reference ?? null);
    });
  }

  if (reference) {
    return (
      <div className="border-border rounded-2xl border bg-white p-6 sm:p-8">
        <span
          aria-hidden="true"
          className="bg-gold flex h-10 w-10 items-center justify-center rounded-full"
        >
          <Check className="text-ink h-5 w-5" />
        </span>
        <h3 className="mt-4 text-[1.375rem] font-extrabold leading-tight tracking-tight">
          We have it. Reference {reference}.
        </h3>
        <p className="text-muted mt-3 text-sm font-semibold leading-[1.8]">
          Somebody on the desk reads this — it is not a search. They will come back with two or
          three places that actually fit what you said, with what each one costs and why they
          picked it.
        </p>
        <p className="text-muted-light mt-3 text-[0.75rem] font-semibold leading-relaxed">
          Quote the reference if you call. Nothing is booked and nothing is charged yet.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border-border rounded-2xl border bg-white p-5 sm:p-7"
      noValidate
    >
      {!compact && (
        <>
          <p className="text-gold-text text-[0.6875rem] font-extrabold uppercase tracking-[0.12em]">
            {heading ?? 'Tell us what you need'}
          </p>
          <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.7]">
            A person reads this and comes back with two or three places that fit — not a list of
            everything.
          </p>
        </>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          id="stay_in"
          type="date"
          label="Check in"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          {...(errors['dates'] ? { error: errors['dates'] } : {})}
        />
        <Input
          id="stay_out"
          type="date"
          label="Check out"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
        />
        <Input
          id="stay_guests"
          type="number"
          min={1}
          label="Guests"
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
        />
        <Input
          id="stay_bedrooms"
          type="number"
          min={0}
          label="Bedrooms"
          placeholder="Any"
          value={bedrooms}
          onChange={(e) => setBedrooms(e.target.value)}
        />
      </div>

      {areas.length > 0 && (
        <fieldset className="mt-5">
          <legend className="text-muted text-[0.75rem] font-bold">Where, roughly?</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {areas.map((area) => (
              <Toggle
                key={area}
                on={pickedAreas.includes(area)}
                onClick={() => toggle(pickedAreas, setPickedAreas, area)}
              >
                {area}
              </Toggle>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-5">
        <ChipGroup
          id="stay_purpose"
          label="What is the stay for?"
          options={PURPOSES}
          value={purpose}
          onChange={setPurpose}
          selectedTone="gold"
        />
      </div>

      <fieldset className="mt-5">
        <legend className="text-muted text-[0.75rem] font-bold">
          Anything that would make it wrong without it?
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MUST_HAVES.map((m) => (
            <Toggle key={m} on={picked.includes(m)} onClick={() => toggle(picked, setPicked, m)}>
              {m}
            </Toggle>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input
          id="stay_budget"
          type="number"
          min={0}
          label="Up to, per night (KES)"
          placeholder="Optional"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
        <Input
          id="stay_name"
          label="Your name"
          placeholder="Optional"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <PhoneInput
          id="stay_phone"
          label="Phone"
          value={phone}
          onChange={setPhone}
          {...(errors['contact'] ? { error: errors['contact'] } : {})}
        />
        <Input
          id="stay_email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <Input
          id="stay_notes"
          label="Anything else"
          placeholder="Arriving late, travelling with a baby, need a quiet street…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="submit" className="mt-5 w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Find me a place'}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Button>

      <p className="text-muted-light mt-3 text-center text-[0.6875rem] font-semibold leading-relaxed">
        No account, no payment, no obligation. We use these details to answer you and nothing else.
      </p>
    </form>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[0.75rem] font-bold transition-colors ${
        on
          ? 'bg-ink text-white'
          : 'border-border-strong text-ink hover:border-ink border bg-white'
      }`}
    >
      {children}
    </button>
  );
}
