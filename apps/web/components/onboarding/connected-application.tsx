'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import { getCaptchaToken } from '@nexg/ui';
import SharedRegistration from '../../../../merchant-onboarding/src/MerchantOnboarding';
import {
  applicationCapture,
  payoutDeclaration,
  payoutForm,
} from '@/lib/merchant-application-client';
import { agreementForCategory } from '@nexg/contracts/merchant-agreements';
import { sendMerchantPasswordSetupLink } from '@/app/(customer)/sign-in/actions';
import { AgreementConsent } from '@/components/merchant/agreement-consent';
import { createClient } from '@/lib/supabase/client';
import { subscribeProtectedActor } from '@/lib/supabase/protected-actor';
import type { MerchantSavedHomeSource } from '@/lib/merchant-home-source';
import { merchantSessionSignInHref } from '@/lib/merchant-journey-navigation';
import { browserUuid } from '@/lib/browser-uuid';
import {
  requestMerchantEmailCode,
  resendMerchantEmailCode,
  verifyMerchantEmailCode,
} from '@/lib/merchant-email-otp';
import {
  createMerchantOnboardingDemoContext,
  merchantOnboardingDemoHref,
  type MerchantOnboardingDemoSelection,
} from '@/lib/merchant-onboarding-demo';

const Form = SharedRegistration;
const SetupOfferings = dynamic(() =>
  import('@/components/merchant/offerings/setup-offerings').then((module) => module.SetupOfferings),
);
const SetupLocationEditor = dynamic(() =>
  import('@/components/merchant/business/setup-location').then(
    (module) => module.SetupLocationEditor,
  ),
);
const SetupDocuments = dynamic(() =>
  import('@/components/merchant/setup-documents').then((module) => module.SetupDocuments),
);
const SetupHours = dynamic(() =>
  import('@/components/merchant/availability/setup-hours').then((module) => module.SetupHours),
);
const SetupPayout = dynamic(() =>
  import('@/components/merchant/setup-payout').then((module) => module.SetupPayout),
);

type SetupEditor = 'offerings' | 'location' | 'hours' | 'documents' | 'payout';
const taskRoutes: Record<string, string> = {
  offerings: '/merchant/menu',
  location: '/merchant/stores',
  hours: '/merchant/hours',
  documents: '/merchant/documents',
  team: '/merchant/team',
};
const liveSetupRoutes = {
  offerings: '/merchant/offerings',
  location: '/merchant/business',
  hours: '/merchant/availability',
};

type PayoutRecord = { version: number; payout: Record<string, string> | null };
export function ConnectedApplication({
  initialRecord,
  initialPayout,
  home = false,
  actorId,
  anonymousSession = false,
  emailOtpEnabled = false,
  savedHome,
  prefill,
}: {
  initialRecord?: MerchantApplicationRecord;
  initialPayout?: PayoutRecord;
  home?: boolean;
  actorId: string;
  anonymousSession?: boolean;
  emailOtpEnabled?: boolean;
  savedHome?: MerchantSavedHomeSource;
  /* Answers from the register card on /merchants, for a brand-new application only. */
  prefill?: Record<string, unknown>;
}) {
  const router = useRouter();
  const record = useRef(initialRecord);
  const payout = useRef(initialPayout);
  const [status, setStatus] = useState(initialRecord?.review.state ?? 'draft');
  const [setupEditor, setSetupEditor] = useState<SetupEditor | null>(null);
  /* The category whose merchant agreement the applicant has ticked. */
  const [agreementAcceptedFor, setAgreementAcceptedFor] = useState<string | null>(null);
  const [agreementError, setAgreementError] = useState<string | null>(null);
  const closeSetupEditor = () => setSetupEditor(null);
  const refreshSetup = () => router.refresh();
  const openLegacySetup = useCallback(
    (editor: 'offerings' | 'location' | 'hours') => {
      if (!savedHome?.access.operations && savedHome?.publication.status === 'live') return;
      setSetupEditor(null);
      router.push(savedHome?.access.operations ? liveSetupRoutes[editor] : taskRoutes[editor]!);
    },
    [router, savedHome?.access.operations, savedHome?.publication.status],
  );
  const [expired, setExpired] = useState(false);
  const [businessEmail, setBusinessEmail] = useState(initialRecord?.payload.business.email ?? '');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'sending' | 'ready' | 'error'>(
    'ready',
  );
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const abort = useRef(new AbortController());
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const keys = useRef(new Map<string, string>());
  const lastActivity = useRef(0);
  const currentEmail = useRef('');
  const setupLinkSent = useRef(false);
  useEffect(() => {
    alive.current = true;
    abort.current = new AbortController();
    const client = createClient();
    const unsubscribe = subscribeProtectedActor(client, actorId, () => {
      alive.current = false;
      abort.current.abort();
      record.current = undefined;
      payout.current = undefined;
      keys.current.clear();
      setExpired(true);
      router.replace(merchantSessionSignInHref(home));
      router.refresh();
    });
    const activity = (event: Event) => {
      if (!event.isTrusted) return;
      if (!record.current || Date.now() - lastActivity.current < 60000 || !alive.current) return;
      lastActivity.current = Date.now();
      void fetch('/api/merchant/application', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: 'activity', merchantId: record.current.merchant_id }),
        signal: abort.current.signal,
      })
        .then((response) => {
          if (response.status === 401) {
            alive.current = false;
            abort.current.abort();
            setExpired(true);
            router.replace(merchantSessionSignInHref(home));
            router.refresh();
          }
        })
        .catch(() => {});
    };
    if (!home && !anonymousSession) {
      window.addEventListener('pointerdown', activity, { passive: true });
      window.addEventListener('keydown', activity);
    }
    return () => {
      alive.current = false;
      abort.current.abort();
      unsubscribe();
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
    };
  }, [router, home, actorId, anonymousSession]);
  async function post(command: Record<string, unknown>) {
    if (!alive.current) throw new Error('Sign in again before saving your application.');
    const fingerprint = JSON.stringify(command);
    let operationId = keys.current.get(fingerprint);
    if (!operationId) {
      operationId =
        command.command === 'start'
          ? (new URL(window.location.href).searchParams.get('operationId') ?? browserUuid())
          : browserUuid();
      keys.current.set(fingerprint, operationId);
    }
    if (command.command === 'start')
      window.history.replaceState(
        null,
        '',
        `/merchants/register?operationId=${encodeURIComponent(operationId)}`,
      );
    const response = await fetch('/api/merchant/application', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...command, operationId }),
      signal: abort.current.signal,
    });
    const result = await response.json();
    if (!alive.current)
      throw new Error('Your session ended. Sign in to check the saved application.');
    if (!response.ok) {
      if (response.status === 401) {
        setExpired(true);
        router.replace(merchantSessionSignInHref(home));
      }
      throw new Error(
        result.detail ?? 'The operation outcome could not be confirmed. Reload before retrying.',
      );
    }
    keys.current.delete(fingerprint);
    return result.data;
  }
  function serialize<T>(action: () => Promise<T>): Promise<T> {
    const pending = tail.current.then(action, action);
    tail.current = pending.catch(() => {});
    return pending;
  }
  async function requestEmailCode(email: string) {
    const address = email.trim().toLowerCase();
    currentEmail.current = address;
    setVerificationEmail(address);
    setVerificationStatus('sending');
    setVerificationMessage('');
    try {
      const result = await requestMerchantEmailCode(createClient().auth, actorId, address);
      if (currentEmail.current !== address) return false;
      if (result === 'verified') {
        setVerifiedEmail(address);
        setVerificationEmail(null);
        setVerificationStatus('ready');
        setVerificationCode('');
        return true;
      }
      setVerificationCode('');
      setVerificationStatus('ready');
      setVerificationMessage('Enter the code sent to your email.');
      return false;
    } catch (error) {
      if (currentEmail.current === address) {
        setVerificationStatus('error');
        setVerificationMessage(
          error instanceof Error ? error.message : 'We could not send a verification code.',
        );
      }
      throw error;
    }
  }
  async function verifyEmailCode(email: string, code: string) {
    const address = email.trim().toLowerCase();
    if (currentEmail.current !== address)
      throw new Error('The business email changed. Request a new code for the current address.');
    await verifyMerchantEmailCode(createClient().auth, actorId, address, code);
    if (currentEmail.current !== address)
      throw new Error('The business email changed. Request a new code for the current address.');
    setVerifiedEmail(address);
    setVerificationEmail(null);
    setVerificationStatus('ready');
    setVerificationCode('');
    setVerificationMessage('');
  }
  async function verifyInlineEmailCode() {
    if (!/^(?:\d{6}|\d{8})$/.test(verificationCode) || verifyingEmail) return;
    setVerifyingEmail(true);
    setVerificationMessage('');
    try {
      await verifyEmailCode(normalizedBusinessEmail, verificationCode);
    } catch (error) {
      setVerificationMessage(
        error instanceof Error ? error.message : 'We could not verify this code.',
      );
    } finally {
      setVerifyingEmail(false);
    }
  }
  const normalizedBusinessEmail = businessEmail.trim().toLowerCase();
  const emailVerificationPending = verificationEmail === normalizedBusinessEmail;
  const emailIsVerified =
    verifiedEmail === normalizedBusinessEmail && normalizedBusinessEmail.length > 0;
  const businessEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedBusinessEmail);
  function emailVerificationAction() {
    if (!emailOtpEnabled || !businessEmailIsValid) return null;
    if (emailIsVerified)
      return (
        <span className="mo-email-verified" role="status">
          Email verified
        </span>
      );
    if (emailVerificationPending && verificationStatus === 'sending')
      return (
        <button
          type="button"
          className="mo-button mo-button-secondary mo-email-verify-button"
          disabled
        >
          Sending code…
        </button>
      );
    if (emailVerificationPending && verificationStatus === 'error')
      return (
        <button
          type="button"
          className="mo-button mo-button-secondary mo-email-verify-button"
          onClick={() => void requestEmailCode(normalizedBusinessEmail).catch(() => {})}
        >
          Try again
        </button>
      );
    if (emailVerificationPending)
      return (
        <button
          type="button"
          className="mo-button mo-button-secondary mo-email-verify-button"
          onClick={() => codeInput.current?.focus()}
        >
          Enter verification code
        </button>
      );
    return (
      <button
        type="button"
        className="mo-button mo-button-secondary mo-email-verify-button"
        onClick={() => void requestEmailCode(normalizedBusinessEmail).catch(() => {})}
      >
        Verify email
      </button>
    );
  }
  function emailVerificationContent() {
    if (!emailOtpEnabled || !emailVerificationPending) return null;
    if (verificationStatus === 'sending')
      return (
        <p className="mo-email-code-message" role="status">
          Sending a verification code…
        </p>
      );
    if (verificationStatus === 'error')
      return (
        <p className="mo-email-code-message mo-email-code-error" role="alert">
          {verificationMessage}
        </p>
      );
    return (
      <div className="mo-email-code-panel">
        <label htmlFor="merchant-registration-email-code">Enter verification code</label>
        <div className="mo-email-code-row">
          <input
            ref={codeInput}
            id="merchant-registration-email-code"
            name="merchant-registration-email-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={verificationCode}
            disabled={verifyingEmail || resendingCode}
            aria-describedby="merchant-registration-email-code-message"
            onChange={(event) => {
              setVerificationCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 8));
              setVerificationMessage('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void verifyInlineEmailCode();
              }
            }}
          />
          <button
            type="button"
            className="mo-button mo-button-primary mo-email-code-verify"
            disabled={
              verifyingEmail || resendingCode || !/^(?:\d{6}|\d{8})$/.test(verificationCode)
            }
            onClick={() => void verifyInlineEmailCode()}
          >
            {verifyingEmail ? 'Checking…' : 'Verify code'}
          </button>
          <button
            type="button"
            className="mo-button mo-button-ghost mo-email-code-resend"
            disabled={resendingCode || verifyingEmail}
            onClick={async () => {
              setResendingCode(true);
              setVerificationMessage('');
              try {
                await resendMerchantEmailCode(
                  createClient().auth,
                  actorId,
                  normalizedBusinessEmail,
                );
                setVerificationMessage('A new code has been sent.');
              } catch (error) {
                setVerificationMessage(
                  error instanceof Error ? error.message : 'We could not send a new code.',
                );
              } finally {
                setResendingCode(false);
              }
            }}
          >
            {resendingCode ? 'Sending…' : 'Resend code'}
          </button>
        </div>
        <p
          id="merchant-registration-email-code-message"
          className={`mo-email-code-message ${verificationMessage && !verificationMessage.startsWith('A new code') ? 'mo-email-code-error' : ''}`}
          role={
            verificationMessage && !verificationMessage.startsWith('A new code')
              ? 'alert'
              : 'status'
          }
        >
          {verificationMessage}
        </p>
      </div>
    );
  }
  async function completeSubmission(email: string) {
    if (anonymousSession && emailOtpEnabled) {
      if (!setupLinkSent.current) {
        const result = await sendMerchantPasswordSetupLink(await getCaptchaToken());
        if (!result.ok) throw new Error(result.message);
        setupLinkSent.current = true;
      }
      const { error } = await createClient().auth.signOut();
      if (error)
        throw new Error(
          'Your password setup link was sent, but we could not sign out. Please try again.',
        );
      const params = new URLSearchParams({ next: '/merchant', setup: 'sent', email });
      router.push(`/merchants/sign-in?${params.toString()}`);
    } else {
      router.push('/merchant');
    }
    router.refresh();
  }
  async function save(input: Record<string, unknown>) {
    let capture;
    try {
      capture = applicationCapture(input);
    } catch {
      throw new Error(
        'Check the business details and Kenyan phone number before saving. Your edits are still here.',
      );
    }
    const previous = record.current;
    const result = await post(
      previous
        ? {
            command: 'save',
            merchantId: previous.merchant_id,
            expectedRevision: previous.revision,
            capture,
          }
        : { command: 'start', capture },
    );
    const saved = MerchantApplicationRecord.parse(result);
    record.current = saved;
    setStatus(saved.review.state);
    if (!home)
      window.history.replaceState(null, '', `/merchants/register?merchantId=${saved.merchant_id}`);
    return saved;
  }
  /*
   * The merchant agreement for the application's category. Ticking the box
   * is remembered per category, so changing category asks again; the
   * acceptance itself is recorded (agreement, version, who, when) just
   * before submitting, and the database refuses a submission without it.
   */
  async function acceptAgreement(merchantId: string, categoryId: string) {
    const agreement = agreementForCategory(categoryId);
    if (!agreement) throw new Error('Choose your business category before submitting.');
    if (agreementAcceptedFor !== categoryId) {
      setAgreementError('Tick "I have read and agree" to accept the NexG Merchant Agreement.');
      throw new Error(
        'Read and accept the NexG Merchant Agreement for your category (Registration and policies) before submitting.',
      );
    }
    const { error } = await createClient().rpc('rpc_merchant_agreement_accept', {
      p_merchant_id: merchantId,
      p_agreement_id: agreement.id,
      p_version: agreement.version,
    });
    if (error)
      throw new Error(
        error.message ||
          'Your acceptance of the merchant agreement could not be saved. Please retry.',
      );
  }

  async function submit(input: Record<string, unknown>) {
    if (emailOtpEnabled) {
      const email = String((input.business as { email?: unknown } | undefined)?.email ?? '')
        .trim()
        .toLowerCase();
      if (verifiedEmail !== email) return { verificationRequired: true };
      currentEmail.current = email;
      const { data, error } = await createClient().auth.getUser();
      if (error || !data.user || data.user.id !== actorId)
        throw new Error('Your registration session changed. Sign in again before submitting.');
      if (
        data.user.is_anonymous ||
        data.user.email?.trim().toLowerCase() !== email ||
        !data.user.email_confirmed_at
      )
        throw new Error('Verify the business email above before submitting your application.');
    }
    return serialize(async () => {
      const saved = await save(input);
      if (
        saved.review.submitted_revision === saved.revision &&
        ['pending', 'approved'].includes(saved.review.state)
      ) {
        await completeSubmission(
          String((input.business as { email?: unknown } | undefined)?.email ?? '')
            .trim()
            .toLowerCase(),
        );
        return { applicationId: saved.merchant_id, status: saved.review.state, redirecting: true };
      }
      await acceptAgreement(saved.merchant_id, String(input.categoryId ?? ''));
      const submitted = MerchantApplicationRecord.parse(
        await post({
          command: 'submit',
          merchantId: saved.merchant_id,
          expectedRevision: saved.revision,
        }),
      );
      record.current = submitted;
      setStatus(submitted.review.state);
      await completeSubmission(
        String((input.business as { email?: unknown } | undefined)?.email ?? '')
          .trim()
          .toLowerCase(),
      );
      return {
        applicationId: submitted.merchant_id,
        status: submitted.review.state,
        redirecting: true,
      };
    });
  }
  async function saveTask(
    input: Record<string, unknown> & {
      business?: { email?: unknown };
      policies?: { cancellation?: unknown; complaintContact?: unknown };
      payout: Record<string, string | number | boolean | undefined>;
    },
    { step }: { step: number },
  ) {
    return serialize(async () => {
      if (step === 0) {
        const email = String((input.business as { email?: unknown } | undefined)?.email ?? '')
          .trim()
          .toLowerCase();
        if (emailOtpEnabled && verifiedEmail !== email)
          throw new Error('Verify the business email above before saving these changes.');
        const saved = await save(input);
        router.refresh();
        return saved;
      }
      if (step === 1) {
        const saved = await save(input);
        router.refresh();
        return saved;
      }
      if (step === 5) {
        if (anonymousSession)
          throw new Error(
            'Create your merchant account before adding payout details. Your application and Home setup are saved.',
          );
        if (input.policies?.cancellation || input.policies?.complaintContact)
          throw new Error(
            'Customer policy edits need their business settings task. They have not been saved here.',
          );
        if (!record.current)
          throw new Error('Save your registration before adding a payout destination.');
        const declaration = payoutDeclaration(input.payout);
        const receipt = await post({
          command: 'payout',
          merchantId: record.current.merchant_id,
          expectedVersion: payout.current?.version ?? 0,
          payout: declaration,
        });
        payout.current = { version: receipt.version, payout: declaration };
        router.refresh();
        return receipt;
      }
      throw new Error(
        'This setup task is not connected to saving yet. Your edits remain here. Returning without saving will discard them.',
      );
    });
  }
  if (expired)
    return (
      <p role="status" className="p-6">
        Your session ended. Sign in again to open your saved application.
      </p>
    );
  const setupActivities =
    savedHome?.projection.profiles.map((profile) => ({
      id: profile.subcategoryId,
      name: profile.name,
    })) ?? [];
  const savedPayout = payoutForm(payout.current?.payout ?? null);
  return (
    <>
      {home && anonymousSession ? (
        <aside
          className="border-border bg-surface mx-4 mt-4 rounded-xl border p-4 sm:mx-6 lg:mx-7"
          aria-label="Secure your workspace"
        >
          <p className="font-bold">Your application and setup are saved in this browser.</p>
          <p className="text-muted mt-1 text-sm">
            {emailOtpEnabled
              ? 'Verify your email to keep access to this workspace on other devices.'
              : 'Create your account to keep access to this workspace on other devices.'}
          </p>
          <Link
            href={
              emailOtpEnabled
                ? '/merchants/verify-email'
                : '/merchants/sign-in?tab=create&next=%2Fmerchant'
            }
            prefetch={false}
            className="bg-gold text-ink mt-3 inline-flex rounded-lg px-4 py-2.5 font-bold"
          >
            {emailOtpEnabled ? 'Verify your email' : 'Create your merchant account'}
          </Link>
        </aside>
      ) : null}
      <Form
        initialData={
          initialRecord
            ? { ...initialRecord.payload, payout: payoutForm(initialPayout?.payout ?? null) }
            : prefill
        }
        initialHome={home}
        savedHome={savedHome}
        embedded={home}
        applicationStatus={status}
        onStatusChange={undefined}
        onBackToMarketplace={undefined}
        authenticatedSession={undefined}
        onSaveDraft={(input: Record<string, unknown>) => serialize(() => save(input))}
        onSubmit={submit}
        renderAgreement={(categoryId: string) => (
          <AgreementConsent
            categoryId={categoryId}
            checked={agreementAcceptedFor === categoryId && Boolean(categoryId)}
            error={agreementError}
            onChange={(checked) => {
              setAgreementAcceptedFor(checked ? categoryId : null);
              setAgreementError(null);
            }}
          />
        )}
        canSubmit={!emailOtpEnabled || emailIsVerified}
        emailFieldDisabled={
          emailOtpEnabled && (verificationStatus === 'sending' || verifyingEmail || resendingCode)
        }
        emailVerificationAction={emailVerificationAction()}
        emailVerificationContent={emailVerificationContent()}
        onBusinessEmailChange={(email: string) => {
          const address = email.trim().toLowerCase();
          setBusinessEmail(email);
          currentEmail.current = address;
          if (verifiedEmail && verifiedEmail !== address) {
            setVerifiedEmail(null);
            setVerificationCode('');
          }
          if (verificationEmail && verificationEmail !== address) {
            setVerificationEmail(null);
            setVerificationStatus('ready');
            setVerificationMessage('');
            setVerificationCode('');
          }
        }}
        onSaveTask={saveTask}
        onTaskNavigation={(step: number, rowId?: string) => {
          if (home && savedHome) {
            const task = rowId ?? (step === 2 ? 'location' : undefined);
            if (
              task === 'offerings' ||
              task === 'location' ||
              task === 'hours' ||
              task === 'documents' ||
              (task === 'payout' && !anonymousSession)
            ) {
              setSetupEditor(task);
              return true;
            }
          }
          // The Team page and its invite actions require operational access.
          // Keep the pre-approval Home row informational until that access is
          // granted rather than sending the merchant to a page that redirects.
          if (rowId === 'team' && !savedHome?.access.operations) return false;
          const href = rowId?.startsWith('model:')
            ? '/merchant/calendar'
            : rowId
              ? (taskRoutes[rowId] ?? null)
              : // The Home location summary tile has no row id, but still opens
                // the same saved branch records as the location task.
                step === 2
                ? '/merchant/stores'
                : null;
          if (!href) return false;
          router.push(href);
          return true;
        }}
        onDemo={
          home
            ? undefined
            : (selection: MerchantOnboardingDemoSelection) => {
                const context = createMerchantOnboardingDemoContext(selection);
                if (context) window.location.assign(merchantOnboardingDemoHref(context));
              }
        }
        onExitDemo={undefined}
      />
      {setupEditor === 'offerings' && (
        <SetupOfferings
          open
          onClose={closeSetupEditor}
          onSaved={refreshSetup}
          activities={setupActivities}
          onUnavailable={openLegacySetup}
        />
      )}
      {setupEditor === 'location' && (
        <SetupLocationEditor
          open
          onClose={closeSetupEditor}
          onSaved={refreshSetup}
          activities={setupActivities}
          onUnavailable={openLegacySetup}
        />
      )}
      {setupEditor === 'documents' && (
        <SetupDocuments open onClose={closeSetupEditor} onSaved={refreshSetup} />
      )}
      {setupEditor === 'hours' && (
        <SetupHours
          open
          onClose={closeSetupEditor}
          onSaved={refreshSetup}
          activities={setupActivities}
          onUnavailable={openLegacySetup}
        />
      )}
      {setupEditor === 'payout' && (
        <SetupPayout
          open
          onClose={closeSetupEditor}
          initialValue={{ ...savedPayout, method: savedPayout?.method ?? '' }}
          onSave={async (value) => {
            await saveTask({ payout: value, policies: {} }, { step: 5 });
          }}
        />
      )}
    </>
  );
}
