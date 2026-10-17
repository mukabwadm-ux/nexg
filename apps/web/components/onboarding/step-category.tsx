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
  const { draft, categories, categoryNotice, save, setCategory, setAnswers, patch } =
    useOnboarding();
  const [docs, setDocs] = React.useState<{ label: string; kind: string }[]>([]);
  const [docsError, setDocsError] = React.useState<string | null>(null);
  const [selectingCategory, setSelectingCategory] = React.useState(false);
  const [categorySaveError, setCategorySaveError] = React.useState<string | null>(null);

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
    setDocs([]);
    setDocsError(null);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.rpc('fn_merchant_required_docs', {
            p_merchant_id: draftId,
          });
          if (cancelled) return;
          if (error) {
            setDocsError(error.message);
            return;
          }
          setDocs((data as { label: string; kind: string }[] | null) ?? []);
        } catch (error) {
          if (!cancelled) {
            setDocsError(error instanceof Error ? error.message : 'Please try again.');
          }
        }
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
            disabled={
              !draft?.category ||
              !answered ||
              selectingCategory ||
              save.saving ||
              !!categorySaveError
            }
            onClick={() => router.push('/merchants/apply/location')}
          >
            Continue
          </ContinueButton>
          <FooterNote>Your answers decide which documents we ask for</FooterNote>
        </>
      }
    >
      {categoryNotice && (
        <p
          role="status"
          className="border-warning/40 bg-warning-bg text-warning mb-5 rounded-xl border p-4 text-sm font-semibold leading-relaxed"
        >
          {categoryNotice}
        </p>
      )}
      {categorySaveError && (
        <p role="alert" className="text-danger mb-4 text-sm font-semibold">
          {categorySaveError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {categories.map((category) => (
          <CategoryTile
            key={category.category}
            icon={category.icon}
            label={category.label}
            selected={draft?.category === category.category}
            disabled={selectingCategory}
            onClick={() => {
              setCategorySaveError(null);
              setSelectingCategory(true);
              void (async () => {
                try {
                  const changed = category.category !== draft?.category;
                  const saved = await setCategory(
                    category.category,
                    changed ? {} : (draft?.answers ?? {}),
                  );
                  if (!saved) {
                    setCategorySaveError(
                      'We could not save this business type. Tap it again to retry.',
                    );
                    return;
                  }
                  if (changed) patch({ subcategory: null });
                } catch (error) {
                  setCategorySaveError(
                    error instanceof Error
                      ? `We could not save this business type: ${error.message}`
                      : 'We could not save this business type. Tap it again to retry.',
                  );
                } finally {
                  setSelectingCategory(false);
                }
              })();
            }}
          />
        ))}
      </div>

      {config && config.subcategories && config.subcategories.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-2 border-border bg-surface mt-6 rounded-2xl border p-5 duration-300">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-ink text-sm font-bold">
              Choose your primary vertical or specialty
            </h3>
            {draft?.subcategory && (
              <span className="text-muted-light text-xs font-medium">Selected</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {config.subcategories.map((sub) => {
              const isSelected = draft?.subcategory === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => patch({ subcategory: sub.id })}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-gold text-ink font-bold shadow-sm'
                      : 'border-border bg-surface hover:border-ink text-ink/80 border'
                  }`}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
      {docsError && (
        <p role="alert" className="text-danger mt-4 text-sm font-semibold">
          We could not load the document requirements: {docsError}
        </p>
      )}
    </OnboardingShell>
  );
}
