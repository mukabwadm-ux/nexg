'use client';

import { Button, cn, Input, useToast } from '@nexg/ui';
import { ArrowRight, MapPin } from 'lucide-react';
import * as React from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { type ActionResult, submitLead } from '@/app/actions';

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
  const [need, setNeed] = React.useState<string>(initialNeed ?? 'Food');
  const [when, setWhen] = React.useState<'asap' | 'later'>('asap');
  const [state, formAction] = useFormState<ActionResult | null, FormData>(submitLead, null);
  const { toast } = useToast();
  const announced = React.useRef<ActionResult | null>(null);

  // A chip clicked in "Popular requests" prefills this form (section 4.1).
  React.useEffect(() => {
    if (initialNeed) setNeed(initialNeed);
  }, [initialNeed]);

  React.useEffect(() => {
    if (state && state !== announced.current) {
      announced.current = state;
      toast({
        title: state.ok ? 'Request received' : 'Something went wrong',
        description: state.message,
        tone: state.ok ? 'success' : 'danger',
      });
    }
  }, [state, toast]);

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
        <Input
          id="staying_at"
          name="staying_at"
          label="Where are you staying?"
          placeholder="Hotel, apartment or address"
          leadingIcon={<MapPin className="h-4 w-4" />}
          required
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
