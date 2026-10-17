'use client';

import { Button } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';
import { getCategoryById } from '@nexg/contracts';

import { CategoryTile, DocumentsNote, QuestionCard } from './controls';
import { ContinueButton, FooterNote, OnboardingShell } from './shell';
import { useOnboarding } from './store';

interface RequiredDocument {
  label: string;
  kind: string;
}

/**
 * Step 2 — choose a business type and the specialty-specific setup it needs.
 * Category questions and document rules remain driven by category_config and
 * fn_merchant_required_docs; the shared taxonomy supplies all 21 choices.
 */
export function CategoryStep() {
  const router = useRouter();
  const { draft, categories, categoryNotice, setCategory, setSubcategory, setAnswers, flush } =
    useOnboarding();
  const [docs, setDocs] = React.useState<RequiredDocument[]>([]);
  const [docsLoading, setDocsLoading] = React.useState(false);
  const [docsError, setDocsError] = React.useState(false);
  const [savingCategory, setSavingCategory] = React.useState(false);
  const [savingSubcategory, setSavingSubcategory] = React.useState(false);
  const [categorySaveFailed, setCategorySaveFailed] = React.useState(false);
  const [subcategorySaveFailed, setSubcategorySaveFailed] = React.useState(false);

  const selectedCategoryId = draft?.category
    ? (getCategoryById(draft.category)?.id ?? draft.category)
    : null;
  const config = categories.find((category) => category.category === selectedCategoryId);
  const answers = draft?.answers ?? {};
  const draftId = draft?.id ?? null;
  const selectedSubcategory = config?.subcategories?.find(
    (subcategory) => subcategory.id === draft?.subcategory,
  );

  /*
   * The document list is computed by the same database rules as the documents
   * step, so the merchant sees only requirements for this business and its
   * answers.
   */
  const answersKey = JSON.stringify(answers);
  React.useEffect(() => {
    if (!draftId || !draft?.category) {
      setDocs([]);
      setDocsError(false);
      setDocsLoading(false);
      return;
    }

    let cancelled = false;
    setDocsLoading(true);
    setDocsError(false);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.rpc('fn_merchant_required_docs', {
            p_merchant_id: draftId,
          });
          if (cancelled) return;
          setDocs((data as RequiredDocument[] | null) ?? []);
          setDocsError(!!error);
        } catch {
          if (cancelled) return;
          setDocs([]);
          setDocsError(true);
        } finally {
          if (!cancelled) setDocsLoading(false);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftId, draft?.category, answersKey]);

  const answered = config
    ? config.questions.every((question) => {
        const value = answers[question.key];
        return Array.isArray(value) ? value.length > 0 : !!value;
      })
    : false;
  const canContinue =
    !!draft?.category &&
    !!selectedSubcategory &&
    answered &&
    !savingCategory &&
    !savingSubcategory &&
    !categorySaveFailed &&
    !subcategorySaveFailed;

  const continueToLocation = async () => {
    if (!draft?.category || !canContinue) return;
    setSavingCategory(true);
    setCategorySaveFailed(false);
    const categorySaved = await setCategory(draft.category, answers);
    const setupSaved = categorySaved && (await flush());
    setSavingCategory(false);
    if (!setupSaved) {
      setCategorySaveFailed(true);
      return;
    }
    router.push('/merchants/apply/location');
  };

  const selectCategory = async (category: (typeof categories)[number]) => {
    const isRetry = category.category === draft?.category && categorySaveFailed;
    if (category.category === draft?.category && !isRetry) return;

    setCategorySaveFailed(false);
    setSavingCategory(true);
    let saved = await setCategory(category.category, isRetry ? answers : {});
    if (saved) saved = await setSubcategory(null);
    setSavingCategory(false);
    setCategorySaveFailed(!saved);
    setSubcategorySaveFailed(false);
  };

  const chooseSubcategory = async (subcategoryId: string) => {
    if (draft?.subcategory === subcategoryId && !subcategorySaveFailed) return;
    setSavingSubcategory(true);
    setSubcategorySaveFailed(false);
    const saved = await setSubcategory(subcategoryId);
    setSavingSubcategory(false);
    setSubcategorySaveFailed(!saved);
  };

  return (
    <OnboardingShell
      step={2}
      eyebrow="About your business"
      title="What do you sell?"
      intro="Tap one. We’ll only ask follow-up questions for this kind of business, then show the setup steps for your specialty."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => router.push('/merchants/apply/start')}>
            Back
          </Button>
          <ContinueButton disabled={!canContinue} onClick={() => void continueToLocation()}>
            Continue
          </ContinueButton>
          <FooterNote>Your answers decide which documents we ask for</FooterNote>
        </>
      }
    >
      {categoryNotice && (
        <p
          role="status"
          className="border-warning/40 bg-warning-bg text-warning mb-4 rounded-xl border px-4 py-3 text-[0.8125rem] leading-relaxed"
        >
          {categoryNotice}
        </p>
      )}

      {(categorySaveFailed || subcategorySaveFailed) && (
        <p
          role="alert"
          className="border-danger/30 bg-danger/5 text-danger mb-4 rounded-xl border px-4 py-3 text-[0.8125rem] leading-relaxed"
        >
          We couldn’t save your {subcategorySaveFailed ? 'specialty' : 'business type'}. Your
          selection is still shown; tap it again to retry or contact our team if the problem
          continues.
        </p>
      )}

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-ink text-sm font-bold">Choose a business category</h2>
        <span className="text-muted-light text-xs font-semibold">
          {categories.length} business types
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => (
          <CategoryTile
            key={category.category}
            icon={category.icon}
            label={category.label}
            description={category.description}
            selected={selectedCategoryId === category.category}
            disabled={savingCategory}
            onClick={() => void selectCategory(category)}
          />
        ))}
      </div>

      {config && (
        <section
          aria-labelledby="specialty-heading"
          className="border-border bg-surface mt-6 rounded-2xl border p-4 sm:p-5"
        >
          <div className="mb-3">
            <h2 id="specialty-heading" className="text-ink text-sm font-bold">
              What kind of {config.label.toLowerCase()} business?
            </h2>
            <p className="text-muted mt-1 text-xs leading-relaxed">
              Select the closest match to tailor your listing and setup.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.subcategories?.map((subcategory) => {
              const selected = draft?.subcategory === subcategory.id;
              return (
                <button
                  key={subcategory.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={savingSubcategory || savingCategory}
                  onClick={() => void chooseSubcategory(subcategory.id)}
                  className={`focus-visible:ring-gold rounded-full px-3.5 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                    selected
                      ? 'bg-ink text-white'
                      : 'border-border-strong bg-surface text-ink hover:border-ink border'
                  }`}
                >
                  {subcategory.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {selectedSubcategory && (
        <section
          aria-labelledby="setup-heading"
          className="border-border bg-surface mt-4 rounded-2xl border p-4 sm:p-5"
        >
          <h2 id="setup-heading" className="text-ink text-sm font-bold">
            Your {selectedSubcategory.name.toLowerCase()} setup
          </h2>
          <p className="text-muted mt-1 text-xs leading-relaxed">
            We’ll guide you through this process as you build your listing.
          </p>
          <ol className="mt-4 flex flex-wrap gap-2">
            {(selectedSubcategory.defaultWorkflow ?? '')
              .split(/\s*→\s*/)
              .filter(Boolean)
              .map((step, index) => (
                <li
                  key={`${step}-${index}`}
                  className="border-border bg-bg text-ink flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                >
                  <span className="bg-gold/20 text-gold-text flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-extrabold">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
          </ol>
          {!!selectedSubcategory.fields?.length && (
            <p className="text-muted mt-4 text-xs leading-relaxed">
              Setup details include{' '}
              <span className="text-ink font-semibold">
                {selectedSubcategory.fields.map(humanizeField).join(', ')}
              </span>
              .
            </p>
          )}
        </section>
      )}

      {config && config.questions.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

      {config && (
        <div className="mt-4">
          {docsLoading ? (
            <p className="text-muted-light text-xs" role="status">
              Checking the documents for this business type…
            </p>
          ) : docsError ? (
            <p
              className="border-warning/40 bg-warning-bg text-warning rounded-xl border p-4 text-xs leading-relaxed"
              role="status"
            >
              We couldn’t check the document requirements right now. You can continue, and the
              verification step will show the requirements when they’re available.
            </p>
          ) : docs.length > 0 ? (
            <DocumentsNote>
              As a {config.label.toLowerCase()} you will need{' '}
              <strong>{docs.length} documents</strong> (
              {docs.map((document) => document.label).join(', ')}). The verification step will
              confirm whether anything else applies.
              {!config.featured_eligible &&
                ` ${config.label} businesses are not eligible for paid featured placement.`}
            </DocumentsNote>
          ) : (
            <DocumentsNote>
              No additional documents are currently listed for this business type. If your specialty
              needs a licence or permit, our team will confirm it during verification.
            </DocumentsNote>
          )}
        </div>
      )}
    </OnboardingShell>
  );
}

function humanizeField(field: string): string {
  return field
    .replace(/_(text|hrs|min|kes|sqm|sqft)$/g, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
