'use client';

import Link from 'next/link';
import * as React from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { STAY_REVIEW_CATEGORIES, STAY_REVIEW_TEXT_MAX } from '@/lib/stay-review';

import { type ReviewResult, submitStayReview } from './actions';

const field =
  'border-border w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-[#b8901f]';

/**
 * One row of five stars as real radio buttons, so arrow keys, screen readers and an unstyled
 * page all work. The stars up to the chosen one are filled.
 */
function Stars({
  name,
  label,
  hint,
  initial,
  big = false,
}: {
  name: string;
  label: string;
  hint?: string;
  initial: number | null;
  big?: boolean;
}) {
  const [value, setValue] = React.useState<number>(initial ?? 0);
  const size = big ? 'h-12 w-12 text-2xl' : 'h-11 w-11 text-xl';
  return (
    <fieldset className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <legend className="sr-only">
        {label}
        {hint ? ` (${hint.toLowerCase()})` : ''}
      </legend>
      <span aria-hidden="true" className={big ? 'text-base font-extrabold' : 'text-sm font-bold'}>
        {label}
        {hint && <span className="text-muted block text-[0.75rem] font-semibold">{hint}</span>}
      </span>
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => setValue(n)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`${size} peer-focus-visible:outline-ink inline-flex items-center justify-center rounded-full border font-extrabold transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${
                value >= n
                  ? 'border-gold bg-gold text-[#141414]'
                  : 'border-border text-muted bg-white'
              }`}
            >
              ★
            </span>
            <span className="sr-only">
              {n} star{n === 1 ? '' : 's'}
            </span>
          </label>
        ))}
      </span>
    </fieldset>
  );
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-gold focus-visible:outline-ink inline-flex min-h-11 items-center justify-center self-start rounded-full px-6 text-sm font-extrabold text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
    >
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Send rating'}
    </button>
  );
}

export function StayReviewForm({
  stayId,
  initial,
}: {
  stayId: string;
  initial: ({ rating: number; text: string | null } & Record<string, unknown>) | null;
}) {
  const [state, action] = useFormState<ReviewResult | null, FormData>(
    submitStayReview.bind(null, stayId),
    null,
  );
  const [text, setText] = React.useState(initial?.text ?? '');
  const star = (key: string) => {
    const v = initial?.[key];
    return typeof v === 'number' ? v : null;
  };

  return (
    <form action={action} className="flex flex-col gap-5">
      <section className="border-border flex flex-col gap-4 rounded-2xl border bg-white p-5">
        <Stars name="rating" label="Overall" hint="Required" initial={star('rating')} big />
      </section>

      <section
        aria-labelledby="categories-h"
        className="border-border flex flex-col gap-4 rounded-2xl border bg-white p-5"
      >
        <div>
          <h2 id="categories-h" className="text-lg font-extrabold">
            By category
          </h2>
          <p className="text-muted text-sm">Optional. Rate the ones you noticed.</p>
        </div>
        {STAY_REVIEW_CATEGORIES.map((c) => (
          <Stars key={c.key} name={c.key} label={c.label} initial={star(c.key)} />
        ))}
      </section>

      <label className="border-border block rounded-2xl border bg-white p-5">
        <span className="text-lg font-extrabold">Tell the next guest (optional)</span>
        <textarea
          name="text"
          className={`${field} mt-2 min-h-32`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={STAY_REVIEW_TEXT_MAX}
          aria-describedby="text-count"
        />
        <span id="text-count" className="text-muted mt-1 block text-right text-[0.75rem]">
          {text.length} / {STAY_REVIEW_TEXT_MAX}
        </span>
      </label>

      <div aria-live="polite">
        {state && (
          <p
            role={state.ok ? 'status' : 'alert'}
            className={`rounded-xl p-3 text-sm font-semibold ${
              state.ok ? 'bg-[#e8f5ec] text-[#1d6b37]' : 'text-danger bg-[#fdecea]'
            }`}
          >
            {state.message}{' '}
            {state.ok && (
              <Link href="/account?tab=stays" className="text-ink underline">
                Back to your stays
              </Link>
            )}
          </p>
        )}
      </div>

      <SubmitButton editing={initial !== null} />
    </form>
  );
}
