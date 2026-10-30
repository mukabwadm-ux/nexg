'use client';

import { Button, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { getCategoryById } from '@nexg/contracts';

import { CategoryTile, DocumentsNote, QuestionCard } from './controls';
import { ContinueButton, FooterNote, OnboardingShell } from './shell';
import { useOnboarding } from './store';
import { questionHasAnswer, questionIsVisible } from './question-logic';
import { questionsForSubcategory } from './subcategory-questions';

interface RequiredDocument {
  label: string;
  kind: string;
}

/**
 * Step 2 — choose a business type and the specialty-specific setup it needs.
 * Existing questions and document rules remain database-driven; taxonomy
 * fields supply required setup questions for categories without existing forms.
 */
export function CategoryStep() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    draft,
    categories,
    categoryNotice,
    save,
    setCategory,
    setSubcategory,
    setAnswers,
    flush,
  } = useOnboarding();
  const [docs, setDocs] = React.useState<RequiredDocument[]>([]);
  const [docsLoading, setDocsLoading] = React.useState(false);
  const [docsError, setDocsError] = React.useState<string | null>(null);
  const [savingCategory, setSavingCategory] = React.useState(false);
  const [savingSubcategory, setSavingSubcategory] = React.useState(false);
  const [categorySaveFailed, setCategorySaveFailed] = React.useState(false);
  const [subcategorySaveFailed, setSubcategorySaveFailed] = React.useState(false);

  const savedCategory = draft?.category_key ?? draft?.category;
  const selectedCategoryId = savedCategory
    ? (getCategoryById(savedCategory)?.id ?? savedCategory)
    : null;
  const config = categories.find((category) => category.category === selectedCategoryId);
  const answers = draft?.answers ?? {};
  const draftId = draft?.id ?? null;
  const businessTypesQuestion = config?.questions.find(
    (question) => question.key === 'business_types' && question.type === 'multi',
  );
  const selectedBusinessTypeIds = Array.isArray(answers.business_types)
    ? answers.business_types
    : draft?.subcategory && businessTypesQuestion
      ? [draft.subcategory]
      : [];
  const selectedSubcategories =
    config?.subcategories?.filter((subcategory) =>
      selectedBusinessTypeIds.includes(subcategory.id),
    ) ?? [];
  const selectedSubcategory =
    selectedSubcategories[0] ??
    config?.subcategories?.find((subcategory) => subcategory.id === draft?.subcategory);
  const subcategoryQuestions = selectedSubcategories.flatMap(
    (subcategory) =>
      subcategory.questions ??
      questionsForSubcategory(subcategory as Parameters<typeof questionsForSubcategory>[0]),
  );
  const questions = [
    ...(config?.questions ?? []).filter((question) => questionIsVisible(question, 2, answers)),
    ...subcategoryQuestions.filter((question) => questionIsVisible(question, 2, answers)),
  ];

  /*
   * The document list is computed by the same database rules as the documents
   * step, so the merchant sees only requirements for this business and its
   * answers.
   */
  const answersKey = JSON.stringify(answers);
  React.useEffect(() => {
    if (!draftId || !draft?.category) {
      setDocs([]);
      setDocsError(null);
      setDocsLoading(false);
      return;
    }

    let cancelled = false;
    setDocsLoading(true);
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
          setDocs((data as RequiredDocument[] | null) ?? []);
        } catch (error) {
          if (cancelled) return;
          setDocsError(error instanceof Error ? error.message : 'Please try again.');
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

  const answered = !!config && questions.every((question) => questionHasAnswer(question, answers));
  const canContinue =
    !!savedCategory &&
    (!config?.subcategories?.length || !!businessTypesQuestion || !!selectedSubcategory) &&
    answered &&
    !savingCategory &&
    !savingSubcategory &&
    !save.saving &&
    !categorySaveFailed &&
    !subcategorySaveFailed;

  const continueToLocation = async () => {
    if (!savedCategory || !canContinue) return;
    setSavingCategory(true);
    setCategorySaveFailed(false);
    try {
      const categorySaved = await setCategory(savedCategory, answers);
      const subcategorySaved =
        categorySaved && businessTypesQuestion
          ? await setSubcategory(selectedBusinessTypeIds[0] ?? null)
          : categorySaved;
      const setupSaved = subcategorySaved && (await flush());
      if (!setupSaved) {
        setCategorySaveFailed(true);
        toast({
          title: 'We could not save your business type',
          description: 'Please try again before continuing.',
          tone: 'danger',
        });
        return;
      }
      router.push('/merchants/apply/location');
    } catch {
      setCategorySaveFailed(true);
      toast({
        title: 'We could not save your business type',
        description: 'Please try again before continuing.',
        tone: 'danger',
      });
    } finally {
      setSavingCategory(false);
    }
  };

  const selectCategory = async (category: (typeof categories)[number]) => {
    const currentCategory = draft?.category_key ?? draft?.category;
    const isRetry = category.category === currentCategory && categorySaveFailed;
    if (category.category === currentCategory && !isRetry) return;

    setCategorySaveFailed(false);
    setSavingCategory(true);
    let saved = await setCategory(category.category, isRetry ? answers : {});
    if (saved && draft?.subcategory) saved = await setSubcategory(null);
    setSavingCategory(false);
    setCategorySaveFailed(!saved);
    setSubcategorySaveFailed(false);
    if (!saved) {
      toast({
        title: 'We could not save your business type',
        description: 'Please try selecting it again.',
        tone: 'danger',
      });
    }
  };

  const chooseSubcategory = async (subcategoryId: string) => {
    if (draft?.subcategory === subcategoryId && !subcategorySaveFailed) return;
    setSavingSubcategory(true);
    setSubcategorySaveFailed(false);
    const nextSubcategory = config?.subcategories?.find((item) => item.id === subcategoryId);
    const categoryId = draft?.category_key ?? draft?.category;
    let saved = !!nextSubcategory && !!categoryId;
    if (nextSubcategory && categoryId) {
      const retainedKeys = new Set([
        ...(config?.questions.map((question) => question.key) ?? []),
        ...(
          nextSubcategory.questions ??
          questionsForSubcategory(nextSubcategory as Parameters<typeof questionsForSubcategory>[0])
        ).map((question) => question.key),
      ]);
      const retainedAnswers = Object.fromEntries(
        Object.entries(answers).filter(([key]) => retainedKeys.has(key)),
      );
      saved = await setCategory(categoryId, retainedAnswers);
    }
    if (saved) saved = await setSubcategory(subcategoryId);
    setSavingSubcategory(false);
    setSubcategorySaveFailed(!saved);
    if (!saved) {
      toast({
        title: 'We could not save your specialty',
        description: 'Please try selecting it again.',
        tone: 'danger',
      });
    }
  };

  const changeBusinessTypes = async (nextValues: string[]) => {
    if (!savedCategory) return;
    const nextAnswers = { ...answers, business_types: nextValues };
    setAnswers(nextAnswers);
    setSavingSubcategory(true);
    setSubcategorySaveFailed(false);
    let saved = await setCategory(savedCategory, nextAnswers);
    if (saved) saved = await setSubcategory(nextValues[0] ?? null);
    setSavingSubcategory(false);
    setSubcategorySaveFailed(!saved);
    if (!saved) {
      toast({
        title: 'We could not save your business types',
        description: 'Please try selecting them again.',
        tone: 'danger',
      });
    }
  };

  return (
    <OnboardingShell
      step={2}
      eyebrow="About your business"
      title="What do you sell?"
      intro="Choose the business types you run and how customers can order. We’ll tailor the follow-up questions to your selections."
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
            imageUrl={category.image_url}
            selected={selectedCategoryId === category.category}
            disabled={savingCategory || savingSubcategory}
            onClick={() => void selectCategory(category)}
          />
        ))}
      </div>

      {config && !businessTypesQuestion && (
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

      {selectedSubcategories.map((subcategory) => (
        <section
          key={subcategory.id}
          aria-labelledby={`setup-heading-${subcategory.id}`}
          className="border-border bg-surface mt-4 rounded-2xl border p-4 sm:p-5"
        >
          <h2 id={`setup-heading-${subcategory.id}`} className="text-ink text-sm font-bold">
            {subcategory.workflow
              ? `How ${subcategory.name.toLowerCase()} will work`
              : `Your ${subcategory.name.toLowerCase()} setup`}
          </h2>
          <p className="text-muted mt-1 text-xs leading-relaxed">
            {subcategory.workflow
              ? subcategory.workflow.status === 'live'
                ? 'A workflow tailored to this specialty, from setup through order handling.'
                : 'The intended journey from merchant setup through guest fulfilment. Some steps still need to be built.'
              : 'We’ll guide you through this process as you build your listing.'}
          </p>
          {subcategory.workflow ? (
            <div className="mt-4 grid gap-5 md:grid-cols-3">
              {subcategory.workflow.groups.map((group) => (
                <section key={group.title} aria-label={group.title}>
                  <h3 className="text-ink text-xs font-bold">{group.title}</h3>
                  <ol className="mt-2 space-y-2">
                    {group.steps.map((step, index) => (
                      <li
                        key={`${group.title}-${step}`}
                        className="text-muted flex items-start gap-2 text-xs leading-relaxed"
                      >
                        <span className="bg-gold/20 text-gold-text flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-extrabold">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <ol className="mt-4 flex flex-wrap gap-2">
              {(subcategory.defaultWorkflow ?? '')
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
          )}
          {subcategory.workflow?.policyNote && (
            <p
              role="note"
              className="border-warning/40 bg-warning-bg text-warning mt-4 rounded-xl border px-4 py-3 text-xs leading-relaxed"
            >
              {subcategory.workflow.policyNote}
            </p>
          )}
          {!!subcategory.fields?.length && (
            <p className="text-muted mt-4 text-xs leading-relaxed">
              Setup details include{' '}
              <span className="text-ink font-semibold">
                {subcategory.fields.map(humanizeField).join(', ')}
              </span>
              .
            </p>
          )}
        </section>
      ))}

      {questions.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {questions.map((question) => (
            <QuestionCard
              key={question.key}
              question={question}
              value={answers[question.key]}
              onChange={(next) =>
                question.key === 'business_types' && Array.isArray(next)
                  ? void changeBusinessTypes(next)
                  : setAnswers({ ...answers, [question.key]: next })
              }
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
      {docsError && (
        <p role="alert" className="text-danger mt-4 text-sm font-semibold">
          We could not load the document requirements: {docsError}
        </p>
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
