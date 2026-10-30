'use client';

import { Button, formatBytes, useToast } from '@nexg/ui';
import { Camera, Check, MessageCircle, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';
import { uploadDocument } from '@/lib/uploads';
import { DocumentsNote, QuestionCard } from './controls';
import { NoDraft } from './no-draft';
import { ContinueButton, FooterNote, OnboardingShell } from './shell';
import { useOnboarding } from './store';
import { questionHasAnswer, questionIsVisible } from './question-logic';
import { questionsForSubcategory } from './subcategory-questions';

interface Requirement {
  id: string;
  kind: string;
  label: string;
  why_text: string | null;
  has_expiry: boolean;
  essential: boolean;
  sort: number;
}

interface Existing {
  requirement_id: string;
  status: string;
  expires_at: string | null;
  size_bytes: number;
  rejection_reason: string | null;
}

/**
 * Step 5 — the paperwork.
 *
 * The list is not a constant. It comes from fn_merchant_required_docs, which
 * read the category and the answers from step 2 — so a laundry is asked for
 * three things and a dispensing pharmacy for five, and neither is shown a row
 * that does not apply to them.
 *
 * Essential and non-essential are kept apart deliberately. A missing food
 * handler certificate should not hold up a whole restaurant for a fortnight,
 * and a missing business permit should hold up everything.
 */
export function DocumentsStep() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, categories, refresh, setAnswers, flush } = useOnboarding();

  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [existing, setExisting] = React.useState<Record<string, Existing>>({});
  const [requested, setRequested] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const [expiry, setExpiry] = React.useState<Record<string, string>>({});
  const [loaded, setLoaded] = React.useState(false);

  const draftId = draft?.id ?? null;
  const categoryId = draft?.category_key ?? draft?.category ?? null;
  const config = categories.find((category) => category.category === categoryId);
  const answers = draft?.answers ?? {};
  const selectedSubcategories =
    config?.subcategories?.filter((subcategory) =>
      Array.isArray(answers.business_types)
        ? answers.business_types.includes(subcategory.id)
        : subcategory.id === draft?.subcategory,
    ) ?? [];
  const foodSafetyQuestions = [
    ...(config?.questions ?? []).filter((question) => questionIsVisible(question, 5, answers)),
    ...selectedSubcategories.flatMap((subcategory) =>
      (
        subcategory.questions ??
        questionsForSubcategory(subcategory as Parameters<typeof questionsForSubcategory>[0])
      ).filter((question) => questionIsVisible(question, 5, answers)),
    ),
  ];
  const foodSafetyAnswered = foodSafetyQuestions.every((question) =>
    questionHasAnswer(question, answers),
  );

  const load = React.useCallback(async () => {
    if (!draftId) return;
    const supabase = createClient();
    const [{ data: reqs }, { data: docs }, { data: chases }] = await Promise.all([
      supabase.rpc('fn_merchant_required_docs', { p_merchant_id: draftId }),
      supabase
        .from('document')
        .select('requirement_id, status, expires_at, size_bytes, rejection_reason')
        .eq('owner_type', 'merchant')
        .eq('owner_id', draftId),
      supabase
        .from('document_request')
        .select('requirement_id')
        .eq('owner_type', 'merchant')
        .eq('owner_id', draftId)
        .is('fulfilled_document_id', null),
    ]);

    setRequirements((reqs as Requirement[] | null) ?? []);
    setExisting(
      Object.fromEntries(((docs as Existing[] | null) ?? []).map((d) => [d.requirement_id, d])),
    );
    setRequested(
      new Set(((chases as { requirement_id: string }[] | null) ?? []).map((c) => c.requirement_id)),
    );
    setLoaded(true);
  }, [draftId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const send = async (requirement: Requirement, file: File) => {
    if (!draftId) return;
    setBusy(requirement.kind);
    setActive(requirement.kind);

    const result = await uploadDocument({
      ownerType: 'merchant',
      ownerId: draftId,
      kind: requirement.kind,
      file,
      expiresAt: expiry[requirement.kind] ?? null,
    });
    setBusy(null);

    if (!result.ok) {
      toast({ title: 'That did not upload', description: result.message, tone: 'danger' });
      return;
    }
    await load();
    await refresh();
  };

  const chase = async (requirement: Requirement) => {
    if (!draftId) return;
    setBusy(requirement.kind);
    const supabase = createClient();
    const { error } = await supabase.rpc('rpc_document_request_via_whatsapp', {
      p_merchant_id: draftId,
      p_requirement_kind: requirement.kind,
    });
    setBusy(null);

    if (error) {
      toast({ title: 'We could not note that', description: error.message, tone: 'danger' });
      return;
    }
    setRequested(new Set([...requested, requirement.id]));
    toast({
      title: 'Noted',
      description:
        'It is on your list and the merchant team can see it. We cannot message you on WhatsApp yet, so bring it to the onboarding call.',
      tone: 'success',
    });
  };

  const done = requirements.filter((r) => existing[r.id]).length;
  const missingEssential = requirements.filter((r) => r.essential && !existing[r.id]);
  const pendingOptional = requirements.filter((r) => !r.essential && !existing[r.id]);
  const canContinue = missingEssential.length === 0 && foodSafetyAnswered;

  /* No application at all is a different thing from one still
     loading, and only the first is permanent. */
  if (!draftId)
    return (
      <NoDraft
        step={5}
        eyebrow="Verification"
        startHref="/merchants/apply/start"
        what="upload documents for"
      />
    );
  if (!loaded) return null;

  return (
    <OnboardingShell
      step={5}
      eyebrow="Verification"
      title={
        done > 0
          ? `${requirements.length} documents. ${done} ${done === 1 ? 'is' : 'are'} already done.`
          : `${requirements.length} documents, and we tell you exactly why.`
      }
      intro="Our team checks each one and tells you exactly what, if anything, needs fixing. You can go live with the essentials and send the rest within 14 days."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => router.push('/merchants/apply/hours')}>
            Back
          </Button>
          <ContinueButton
            disabled={!canContinue}
            onClick={async () => {
              await flush();
              router.push('/merchants/apply/payout');
            }}
          >
            {canContinue
              ? pendingOptional.length > 0
                ? `Continue with ${pendingOptional.length} pending`
                : 'Continue'
              : missingEssential.length > 0
                ? `Add your ${missingEssential[0]?.label.toLowerCase()}`
                : 'Complete the food-safety questions'}
          </ContinueButton>
          <FooterNote>
            Policy assumption: 14-day grace for non-essential documents — confirm
          </FooterNote>
        </>
      }
    >
      {foodSafetyQuestions.length > 0 && (
        <section aria-labelledby="food-safety-heading" className="mb-5">
          <h2 id="food-safety-heading" className="text-ink text-sm font-bold">
            Food-safety readiness
          </h2>
          <p className="text-muted mt-1 text-xs leading-relaxed">
            Confirm the practices you currently use. Requirements and documents depend on your
            operating market; these answers do not replace local inspections or certification.
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {foodSafetyQuestions.map((question) => (
              <QuestionCard
                key={question.key}
                question={question}
                value={answers[question.key]}
                onChange={(next) => setAnswers({ ...answers, [question.key]: next })}
              />
            ))}
          </div>
        </section>
      )}

      <DocumentsNote>
        Based on your business type and answers, we need {requirements.length} documents. Check each
        requirement and its status below; additional market-specific requirements may apply.
      </DocumentsNote>

      <ul className="mt-5 space-y-3">
        {requirements.map((requirement) => {
          const saved = existing[requirement.id];
          const chasing = requested.has(requirement.id);
          const isActive = active === requirement.kind && !saved;

          return (
            <li
              key={requirement.id}
              className={`rounded-2xl border p-4 transition-colors sm:p-5 ${
                isActive ? 'border-gold bg-surface' : 'border-border bg-surface'
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    saved ? 'bg-gold text-ink' : 'border-border-strong border-2'
                  }`}
                >
                  {saved && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-extrabold">
                    {requirement.label}
                    {!requirement.essential && (
                      <span className="text-muted-light ml-2 text-[0.6875rem] font-bold uppercase tracking-wide">
                        · can follow
                      </span>
                    )}
                  </p>
                  {requirement.why_text && (
                    <p className="text-muted mt-0.5 text-xs font-semibold leading-[1.6]">
                      {requirement.why_text}
                    </p>
                  )}
                </div>

                {saved ? (
                  <p className="text-success shrink-0 text-[0.8125rem] font-bold">
                    <Check className="mr-1 inline h-4 w-4" aria-hidden="true" />
                    Uploaded
                    {saved.expires_at ? ` · expires ${saved.expires_at}` : ''}
                    {saved.size_bytes ? ` · ${formatBytes(saved.size_bytes)}` : ''}
                  </p>
                ) : chasing ? (
                  <p className="text-warning shrink-0 text-[0.8125rem] font-bold">
                    <MessageCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />
                    Sending on WhatsApp
                  </p>
                ) : (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <FileButton
                      icon={<Camera className="h-3.5 w-3.5" />}
                      label="Take photo"
                      capture
                      busy={busy === requirement.kind}
                      onPick={(file) => void send(requirement, file)}
                      onFocus={() => setActive(requirement.kind)}
                    />
                    <FileButton
                      icon={<Upload className="h-3.5 w-3.5" />}
                      label="Upload"
                      busy={busy === requirement.kind}
                      onPick={(file) => void send(requirement, file)}
                      onFocus={() => setActive(requirement.kind)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === requirement.kind}
                      onClick={() => void chase(requirement)}
                    >
                      <span className="flex items-center gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Send later on WhatsApp
                      </span>
                    </Button>
                  </div>
                )}
              </div>

              {requirement.has_expiry && !saved && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label
                    htmlFor={`expiry_${requirement.kind}`}
                    className="text-muted text-xs font-bold"
                  >
                    Expiry date
                  </label>
                  <input
                    id={`expiry_${requirement.kind}`}
                    type="date"
                    value={expiry[requirement.kind] ?? ''}
                    onChange={(event) =>
                      setExpiry({ ...expiry, [requirement.kind]: event.target.value })
                    }
                    className="border-border-strong bg-bg rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  />
                  <span className="text-muted-light text-xs font-semibold">
                    Set it before you upload and we will store it with the file.
                  </span>
                </div>
              )}

              {saved?.status === 'rejected' && (
                <p className="border-danger/30 bg-danger-bg text-danger mt-3 rounded-lg border p-3 text-xs font-bold leading-[1.6]">
                  Rejected: {saved.rejection_reason} Upload a replacement.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="border-border bg-surface flex items-start gap-3 rounded-2xl border p-5">
          <span className="bg-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
            <Camera className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[0.9375rem] font-extrabold">On your phone? Snap them now.</p>
            <p className="text-muted mt-1 text-xs font-semibold leading-[1.7]">
              The camera opens straight into the right slot. Blurry ones get sent back, so check the
              whole document is in frame before you send it.
            </p>
          </div>
        </div>

        <div className="border-border bg-surface flex items-start gap-3 rounded-2xl border p-5">
          <span className="bg-success-bg text-success flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[0.9375rem] font-extrabold">Documents are at the shop?</p>
            <p className="text-muted mt-1 text-xs font-semibold leading-[1.7]">
              Tap “Send later” and it goes on your list. The merchant team brings it up on the
              onboarding call, and you can upload from your dashboard any time.
            </p>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

/** A button that is really a file input, because a styled label is not one. */
function FileButton({
  icon,
  label,
  capture,
  busy,
  onPick,
  onFocus,
}: {
  icon: React.ReactNode;
  label: string;
  capture?: boolean;
  busy: boolean;
  onPick: (file: File) => void;
  onFocus: () => void;
}) {
  const id = React.useId();
  return (
    <>
      <input
        id={id}
        type="file"
        accept={capture ? 'image/*' : 'image/*,application/pdf'}
        {...(capture ? { capture: 'environment' as const } : {})}
        className="sr-only"
        /*
         * Both handlers sit on the input, not on the label. Clicking a label
         * forwards the click to its control, so this catches the pointer and
         * the keyboard alike — and a click handler on the label itself is a
         * non-interactive element pretending to be one.
         */
        onFocus={onFocus}
        onClick={onFocus}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
      <label
        htmlFor={id}
        className={`border-border-strong bg-surface hover:bg-bg inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-extrabold ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        {icon}
        {label}
      </label>
    </>
  );
}
