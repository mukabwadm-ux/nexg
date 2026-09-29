'use client';

import { Button } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { CategoryTile, DocumentsNote, QuestionCard } from './controls';
import { ContinueButton, FooterNote, OnboardingShell } from './shell';
import { useOnboarding } from './store';

/**
 * Step 2 — what kind of business this is, and the follow-ups that implies.
 *
 * The questions are not in this file. They come from category_config, which
 * is also what fn_merchant_required_docs reads to decide which licences to
 * demand. That matters more than it looks: the merchant is told "your
 * answers decide which documents we ask for", and the only way to keep that
 * promise is for both halves to read the same row.
 */
export function CategoryStep() {
  const router = useRouter();
  const { draft, categories, setCategory, setAnswers } = useOnboarding();
  const [docs, setDocs] = React.useState<{ label: string; kind: string }[]>([]);

  const config = categories.find((c) => c.category === draft?.category);
  const answers = draft?.answers ?? {};
  const draftId = draft?.id ?? null;

  /*
   * The document list is asked of the database rather than worked out here,
   * so the count under the questions is the same count the documents step
   * will show and the same one a reviewer will see.
   */
  const answersKey = JSON.stringify(answers);
  React.useEffect(() => {
    if (!draftId || !draft?.category) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const supabase = createClient();
        const { data } = await supabase.rpc('fn_merchant_required_docs', {
          p_merchant_id: draftId,
        });
        if (!cancelled) setDocs((data as { label: string; kind: string }[] | null) ?? []);
      })();
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftId, draft?.category, answersKey]);

  const answered = config
    ? config.questions.every((q) => {
        const value = answers[q.key];
        return Array.isArray(value) ? value.length > 0 : !!value;
      })
    : false;

  return (
    <OnboardingShell
      step={2}
      eyebrow="About your business"
      title="What do you sell?"
      intro="Tap one. We will only ask the follow-ups that apply to that kind of business — a laundry never sees restaurant questions."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => router.push('/merchants/apply/start')}>
            Back
          </Button>
          <ContinueButton
            disabled={!draft?.category || !answered}
            onClick={() => router.push('/merchants/apply/location')}
          >
            Continue
          </ContinueButton>
          <FooterNote>Your answers decide which documents we ask for</FooterNote>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {categories.map((category) => (
          <CategoryTile
            key={category.category}
            icon={category.icon}
            label={category.label}
            selected={draft?.category === category.category}
            onClick={() => void setCategory(category.category, {})}
          />
        ))}
      </div>

      {config && config.questions.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-2 mt-6 grid gap-4 duration-300 lg:grid-cols-2">
          {config.questions.map((question) => (
            <QuestionCard
              key={question.key}
              question={question}
              value={answers[question.key]}
              onChange={(next) => setAnswers({ ...answers, [question.key]: next })}
            />
          ))}
        </div>
      )}

      {config && docs.length > 0 && (
        <div className="mt-6">
          <DocumentsNote>
            As a {config.label.toLowerCase()} you will need <strong>{docs.length} documents</strong>{' '}
            ({docs.map((d) => d.label).join(', ')})
            {docs.some((d) => d.kind === 'liquor_licence' || d.kind === 'food_handler_cert')
              ? '.'
              : ' — no food or liquor paperwork.'}
            {!config.featured_eligible &&
              ` · ${config.label.toLowerCase()} businesses are not eligible for paid featured placement.`}
          </DocumentsNote>
        </div>
      )}
    </OnboardingShell>
  );
}
