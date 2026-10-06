'use client';

import { Button, cn, Input, useToast } from '@nexg/ui';
import { ArrowRight, Check, MessageCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { type ActionResult, submitLead } from '@/app/actions';
import { StayingAtField } from '@/components/location/staying-at-field';

/**
 * The "Start your order" card from the `BookingFirst` artboard.
 *
 * Section 4.1: this captures a concierge lead, not an order. The button copy
 * stays as designed (ground rule 6) and the confirmation says plainly that a
 * person will reply — the page never implies the order is placed.
 */

const NEEDS = [
  'Food',
  'Drinks',
  'Laundry',
  'Beauty & Fashion',
  'Airport Transfer',
  'Register as a Merchant',
] as const;

export function LeadForm({ initialNeed }: { initialNeed?: string }) {
  /*
   * Read here rather than on the page. `searchParams` in a server component
   * makes the whole route dynamic, and the homepage was paying for a render
   * and a database round trip on every visit to prefill one field. Reading it
   * in the client component that uses it lets the page be static.
   */
  const params = useSearchParams();
  const fromQuery = params.get('need') ?? undefined;
  const seeded = initialNeed ?? fromQuery;

  const [need, setNeed] = React.useState<string>(seeded ?? 'Food');
  const [when, setWhen] = React.useState<'asap' | 'later'>('asap');
  const [state, formAction] = useFormState<ActionResult | null, FormData>(submitLead, null);
  const { toast } = useToast();
  const announced = React.useRef<ActionResult | null>(null);

  // A chip clicked in "Popular requests" prefills this form (section 4.1).
  React.useEffect(() => {
    if (seeded) setNeed(seeded);
  }, [seeded]);

  /*
   * A failure gets a toast. A success replaces the card.
   *
   * A toast saying "request received" over a form still holding
   * everything they typed reads as though nothing happened —
   * people re-submit. Taking the form away and saying what
   * happens next is the part that feels like somebody picked up.
   */
  React.useEffect(() => {
    if (state && state !== announced.current) {
      announced.current = state;
      if (!state.ok) {
        toast({
          title: 'That did not send',
          description: state.message,
          tone: 'danger',
        });
      }
    }
  }, [state, toast]);

  if (state?.ok) {
    return <ThankYou reference={state.reference} need={need} when={when} />;
  }

  return (
    <form
      action={formAction}
      id="start"
      className="border-border bg-surface shadow-raised rounded-2xl border p-4 sm:p-5"
    >
      <h2 className="text-lg font-extrabold tracking-tight">Start your order</h2>
      <p className="text-muted-light mt-0.5 text-xs font-semibold">
        Takes about a minute. No account needed to ask.
      </p>

      <div className="mt-4">
        {/* Fills itself from the resolved delivery location, and
            is the picker when there is not one yet. */}
        <StayingAtField />
      </div>

      {/*
        * The field that makes the rest of it answerable.
        *
        * This card took no contact detail at all, so a request
        * arrived with what somebody wanted and no way to tell
        * them it was on the way. WhatsApp because that is where
        * the reply goes.
        */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Input
          id="phone"
          name="phone"
          type="tel"
          label="WhatsApp number"
          placeholder="07.. or +254.."
          inputMode="tel"
          autoComplete="tel"
          required
        />
        <Input
          id="full_name"
          name="full_name"
          label="Your name"
          placeholder="So we know who we are helping"
          autoComplete="given-name"
        />
      </div>

      <fieldset className="mt-4">
        <legend className="text-ink text-sm font-bold">What do you need?</legend>
        <input type="hidden" name="need" value={need} />
        <div className="mt-2 flex flex-wrap gap-2">
          {NEEDS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={need === option}
              onClick={() => setNeed(option)}
              className={cn(
                'min-h-[2.25rem] rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
                'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                need === option
                  ? 'border-gold bg-gold text-ink'
                  : 'border-border-strong bg-surface text-ink hover:bg-bg',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-ink text-sm font-bold">When?</legend>
        <input type="hidden" name="when" value={when} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              { value: 'asap', label: 'As soon as possible' },
              { value: 'later', label: 'Pick a time' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={when === option.value}
              onClick={() => setWhen(option.value)}
              className={cn(
                'min-h-[2.75rem] rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                when === option.value
                  ? 'border-ink bg-surface text-ink shadow-card'
                  : 'border-border-strong bg-surface text-muted hover:bg-bg',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {when === 'later' && (
        <div className="mt-3">
          <Input
            id="when_detail"
            name="when_detail"
            label="What time suits you?"
            placeholder="e.g. tonight at 8pm"
          />
        </div>
      )}

      <div className="mt-3">
        <Input
          id="notes"
          name="notes"
          label="Anything else we should know?"
          placeholder="Room number, allergies, a budget, a brand you like…"
        />
      </div>

      <div className="mt-4">
        <SubmitButton />
      </div>

      <p className="text-muted-light mt-2 text-center text-[0.6875rem] font-semibold">
        You&apos;ll see the price and delivery time before you confirm.
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      block
      size="lg"
      loading={pending}
      loadingText="Sending…"
      trailingIcon={<ArrowRight className="h-4 w-4" />}
    >
      Place your Order
    </Button>
  );
}

/**
 * What replaces the card once it is sent.
 *
 * Three things, in the order somebody wants them: that a person
 * has it, what they asked for read back so they can see we
 * understood, and the reference to quote. Then a way to keep
 * talking, because the next thought after "sent" is usually
 * "actually, one more thing".
 *
 * No form underneath. Leaving it there invites a second
 * submission of the same request, and the desk then has two
 * tickets and has to work out whether they are one person.
 */
function ThankYou({
  reference,
  need,
  when,
}: {
  reference?: string;
  need: string;
  when: 'asap' | 'later';
}) {
  return (
    <div
      className="border-border bg-surface shadow-raised rounded-2xl border p-5 sm:p-6"
      role="status"
      aria-live="polite"
    >
      <span className="bg-gold flex h-11 w-11 items-center justify-center rounded-full">
        <Check className="text-ink h-5 w-5" aria-hidden="true" />
      </span>

      <h2 className="mt-3 text-lg font-extrabold tracking-tight">
        Thank you — a concierge has your request.
      </h2>
      <p className="text-muted mt-1.5 text-[0.875rem] leading-[1.7]">
        Somebody is reading it now, not a bot. You will hear from us on WhatsApp shortly to confirm
        the price and the timing before anything is ordered.
      </p>

      <dl className="border-border bg-bg mt-4 space-y-1.5 rounded-xl border p-3.5">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-light text-xs font-bold uppercase">You asked for</dt>
          <dd className="text-right text-[0.8125rem] font-extrabold">{need}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-light text-xs font-bold uppercase">When</dt>
          <dd className="text-right text-[0.8125rem] font-extrabold">
            {when === 'asap' ? 'As soon as possible' : 'At a time to arrange'}
          </dd>
        </div>
        {reference ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-light text-xs font-bold uppercase">Your reference</dt>
            <dd className="text-right font-mono text-[0.8125rem] font-extrabold">{reference}</dd>
          </div>
        ) : null}
      </dl>

      <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.6]">
        Quote that reference if you call or message us and whoever answers will already know what
        this is about.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href="/explore">
            Browse while you wait
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
          trailingIcon={<MessageCircle className="h-4 w-4" />}
        >
          Ask for something else
        </Button>
      </div>
    </div>
  );
}
