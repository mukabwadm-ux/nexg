'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import SharedRegistration from '../../../../merchant-onboarding/src/MerchantOnboarding';
import {
  applicationCapture,
  payoutDeclaration,
  payoutForm,
} from '@/lib/merchant-application-client';
import { createClient } from '@/lib/supabase/client';
import { subscribeProtectedActor } from '@/lib/supabase/protected-actor';
import type { MerchantSavedHomeSource } from '@/lib/merchant-home-source';
import { merchantSessionSignInHref } from '@/lib/merchant-journey-navigation';
import { browserUuid } from '@/lib/browser-uuid';
import {
  createMerchantOnboardingDemoContext,
  merchantOnboardingDemoHref,
  type MerchantOnboardingDemoSelection,
} from '@/lib/merchant-onboarding-demo';

const Form = SharedRegistration;
type PayoutRecord = { version: number; payout: Record<string, string> | null };
export function ConnectedApplication({
  initialRecord,
  initialPayout,
  home = false,
  actorId,
  anonymousSession = false,
  emailOtpEnabled = false,
  savedHome,
}: {
  initialRecord?: MerchantApplicationRecord;
  initialPayout?: PayoutRecord;
  home?: boolean;
  actorId: string;
  anonymousSession?: boolean;
  emailOtpEnabled?: boolean;
  savedHome?: MerchantSavedHomeSource;
}) {
  const router = useRouter();
  const record = useRef(initialRecord);
  const payout = useRef(initialPayout);
  const [applicationStarted, setApplicationStarted] = useState(Boolean(initialRecord));
  const [status, setStatus] = useState(initialRecord?.review.state ?? 'draft');
  const [expired, setExpired] = useState(false);
  const alive = useRef(true);
  const abort = useRef(new AbortController());
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const keys = useRef(new Map<string, string>());
  const lastActivity = useRef(0);
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
    setApplicationStarted(true);
    setStatus(saved.review.state);
    if (!home)
      window.history.replaceState(null, '', `/merchants/register?merchantId=${saved.merchant_id}`);
    return saved;
  }
  async function submit(input: Record<string, unknown>) {
    return serialize(async () => {
      const saved = await save(input);
      const next = anonymousSession && emailOtpEnabled ? '/merchants/verify-email' : '/merchant';
      if (
        saved.review.submitted_revision === saved.revision &&
        ['pending', 'approved'].includes(saved.review.state)
      ) {
        router.push(next);
        router.refresh();
        return { applicationId: saved.merchant_id, status: saved.review.state, redirecting: true };
      }
      const submitted = MerchantApplicationRecord.parse(
        await post({
          command: 'submit',
          merchantId: saved.merchant_id,
          expectedRevision: saved.revision,
        }),
      );
      record.current = submitted;
      setStatus(submitted.review.state);
      router.push(next);
      router.refresh();
      return {
        applicationId: submitted.merchant_id,
        status: submitted.review.state,
        redirecting: true,
      };
    });
  }
  async function saveTask(input: Record<string, any>, { step }: { step: number }) {
    return serialize(async () => {
      if (step === 0) {
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
  return (
    <>
      {!home && anonymousSession && !applicationStarted ? (
        <p className="text-muted mx-4 mt-4 text-sm sm:mx-6 lg:mx-7">
          Already have a NEXG account?{' '}
          <Link
            href="/sign-in?role=merchant&next=%2Fmerchants%2Fregister"
            prefetch={false}
            className="font-bold underline"
          >
            Sign in before filling this form
          </Link>{' '}
          so the application is saved to that account.
        </p>
      ) : null}
      {home && anonymousSession ? (
        <aside
          className="border-border bg-surface mx-4 mt-4 rounded-xl border p-4 sm:mx-6 lg:mx-7"
          aria-label="Secure your workspace"
        >
          <p className="font-bold">Your application and setup are saved in this browser.</p>
          <p className="text-muted mt-1 text-sm">
            {emailOtpEnabled ? 'Verify your email to keep access to this workspace on other devices.' : 'Create your account to keep access to this workspace on other devices.'}
          </p>
          <Link
            href={emailOtpEnabled ? '/merchants/verify-email' : '/sign-in?tab=create&role=merchant&next=%2Fmerchant'}
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
            : undefined
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
        onSaveTask={saveTask}
        onTaskNavigation={(step: number, rowId?: string) => {
          // The Team page and its invite actions require operational access.
          // Keep the pre-approval Home row informational until that access is
          // granted rather than sending the merchant to a page that redirects.
          if (rowId === 'team' && !savedHome?.access.operations) return false;
          const taskRoutes: Record<string, string> = {
            offerings: '/merchant/menu',
            location: '/merchant/stores',
            hours: '/merchant/hours',
            documents: '/merchant/documents',
            team: '/merchant/team',
          };
          const href = rowId?.startsWith('model:')
            ? '/merchant/calendar'
            : rowId
              ? taskRoutes[rowId] ?? null
              // The Home location summary tile has no row id, but still opens
              // the same saved branch records as the location task.
              : step === 2
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
    </>
  );
}
