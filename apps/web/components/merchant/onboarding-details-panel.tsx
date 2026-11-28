'use client';

import {
  onboardingAnswersToSave,
  onboardingProblems,
  parseOnboardingDetails,
  type OnboardingDetails,
} from '@nexg/contracts/merchant-onboarding-details';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { OnboardingDetailsFields } from '@/components/merchant/onboarding-details';
import { createClient } from '@/lib/supabase/client';

/**
 * Business › Documents: the onboarding template answers, kept up to date
 * after applying (a renewed licence, a new vehicle or driver). Hidden where the
 * database does not have the template yet.
 */
export function OnboardingDetailsPanel({
  merchantId,
  details,
}: {
  merchantId: string;
  details: OnboardingDetails | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = React.useState(details?.answers ?? {});
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState(details?.missing ?? []);
  if (!details || !details.fields.length) return null;

  async function save() {
    if (!details) return;
    // Save what is filled in: a merchant hunting for a licence number should
    // not lose the rest. Gaps stay under "Still needed" (and on the go-live
    // list); only a value in the wrong shape stops the save.
    const problems = onboardingProblems(details.fields, answers).filter(
      (problem) => !problem.message.endsWith(': is missing'),
    );
    if (problems.length) {
      setError(problems[0]!.message);
      return;
    }
    setState('saving');
    setError(null);
    const { data, error: saveError } = await createClient().rpc('rpc_merchant_onboarding_save', {
      p_merchant_id: merchantId,
      p_answers: onboardingAnswersToSave(details.fields, answers),
    });
    if (saveError) {
      setState('idle');
      setError(saveError.message);
      return;
    }
    setMissing(parseOnboardingDetails(data).missing);
    setState('saved');
    router.refresh();
  }

  return (
    <section
      aria-labelledby="onboarding-panel-title"
      className="border-border bg-surface rounded-2xl border p-5"
    >
      <h2 id="onboarding-panel-title" className="text-ink text-lg font-extrabold">
        Onboarding details
      </h2>
      <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
        Licence, permit and insurance numbers and the confirmations NexG needs for your category.
        Keep expiry dates current when you renew.
      </p>
      {missing.length ? (
        <p className="bg-warning-bg text-ink mt-3 rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Still needed: {missing.map((m) => m.label).join('; ')}
        </p>
      ) : null}
      <div className="mt-4">
        <OnboardingDetailsFields
          idPrefix="documents-onboarding"
          fields={details.fields}
          answers={answers}
          onChange={(next) => {
            setAnswers(next);
            setState('idle');
            setError(null);
          }}
          disabled={state === 'saving'}
        />
      </div>
      {error ? (
        <p role="alert" className="text-danger mt-3 text-sm font-bold">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={state === 'saving'}
          className="bg-gold text-ink rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-60"
        >
          {state === 'saving' ? 'Saving…' : 'Save details'}
        </button>
        {state === 'saved' ? (
          <span role="status" className="text-success text-sm font-bold">
            Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}
