'use client';

import { Button, Card } from '@nexg/ui';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

type Decision = 'approved' | 'changes_requested' | 'rejected';
type Attempt = {
  merchantId: string;
  expectedRevision: number;
  operationId: string;
  decision: Decision;
  reason: string;
};
type Phase = 'ready' | 'pending' | 'unknown' | 'stale' | 'confirmed';
const LABELS: Record<Decision, string> = {
  approved: 'Approve workspace access',
  changes_requested: 'Request changes',
  rejected: 'Reject application',
};

export function ApplicationReviewControls({
  actorId,
  merchantId,
  revision,
  canReview,
}: {
  actorId: string;
  merchantId: string;
  revision: number;
  canReview: boolean;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision>('approved');
  const [reason, setReason] = useState('');
  const [phase, setPhase] = useState<Phase>('ready');
  const [message, setMessage] = useState('');
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function send(retry = false) {
    if (inFlight.current || !canReview || phase === 'confirmed' || phase === 'stale') return;
    if (retry ? phase !== 'unknown' || !attempt.current : phase !== 'ready') return;
    if (!retry && ((decision !== 'approved' && !reason.trim()) || reason.length > 2000)) return;
    if (!retry)
      attempt.current = {
        merchantId,
        expectedRevision: revision,
        operationId: crypto.randomUUID(),
        decision,
        reason: reason.trim(),
      };
    const command = attempt.current!;
    inFlight.current = true;
    setPhase('pending');
    setMessage('');
    const controller = new AbortController();
    request.current = controller;
    let timeout: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('Review deadline exceeded'));
      }, 12_000);
    });
    try {
      // Authentication and response parsing share the write deadline. A late
      // authentication result must never start a POST after explicit retry.
      const result = await Promise.race([
        (async () => {
          const actor = await createClient().auth.getUser();
          controller.signal.throwIfAborted();
          if (actor.error || actor.data.user?.id !== actorId || actor.data.user.is_anonymous)
            return { kind: 'access-ended' } as const;
          const response = await fetch('/api/merchant-applications/review', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', 'x-review-actor-id': actorId },
            body: JSON.stringify(command),
          });
          controller.signal.throwIfAborted();
          const body: unknown = response.ok ? await response.json().catch(() => null) : null;
          controller.signal.throwIfAborted();
          return { kind: 'response', response, body } as const;
        })(),
        expired,
      ]);
      if (!mounted.current || request.current !== controller) return;
      if (result.kind === 'access-ended') {
        window.dispatchEvent(new Event('merchant-application-review-access-ended'));
        return;
      }
      const { response, body } = result;
      if (response.ok) {
        const saved = MerchantApplicationRecord.safeParse(body);
        if (
          !saved.success ||
          saved.data.merchant_id !== merchantId ||
          saved.data.revision !== revision ||
          saved.data.operation_id !== command.operationId ||
          saved.data.review.state !== command.decision
        )
          throw new Error('Unconfirmed review result');
        setPhase('confirmed');
        setMessage(
          command.decision === 'approved'
            ? saved.data.access.operations
              ? 'Application approved. Workspace access is unlocked. Activation is separate.'
              : 'Application approved. Current account restrictions still apply. Activation is separate.'
            : command.decision === 'changes_requested'
              ? 'Changes requested. The merchant can update and resubmit the application.'
              : 'Application rejected.',
        );
        router.refresh();
      } else if ([401, 403, 404].includes(response.status)) {
        window.dispatchEvent(new Event('merchant-application-review-access-ended'));
      } else if (response.status === 409) {
        setPhase('stale');
        setMessage(
          'The application changed or was already reviewed. Reload the current application before making another decision.',
        );
      } else if (response.status === 400 || response.status === 422) {
        attempt.current = null;
        setPhase('ready');
        setMessage(
          'The decision was not accepted. Check the decision and reason, then submit again.',
        );
      } else {
        setPhase('unknown');
        setMessage(
          'The result could not be confirmed. This decision may already be saved. Retry the same decision or reload the application.',
        );
      }
    } catch {
      if (mounted.current && request.current === controller) {
        setPhase('unknown');
        setMessage(
          'The result could not be confirmed. This decision may already be saved. Retry the same decision or reload the application.',
        );
      }
    } finally {
      clearTimeout(timeout!);
      inFlight.current = false;
      if (request.current === controller) request.current = null;
    }
  }

  if (!canReview)
    return (
      <Card className="p-5">
        <h2 className="text-base font-extrabold">Review decision</h2>
        <p className="text-muted mt-2 text-sm">
          This application is read-only. A decision requires the current pending submitted revision
          and current staff permission.
        </p>
      </Card>
    );
  const frozen = phase !== 'ready';
  const reasonMissing = decision !== 'approved' && !reason.trim();
  return (
    <Card className="p-5">
      <h2 className="text-base font-extrabold">Review revision {revision}</h2>
      <p className="text-muted mt-2 text-sm leading-relaxed">
        Approval unlocks workspace access. Publication and accepting work require separate
        activation checks.
      </p>
      <fieldset className="mt-4 space-y-4" disabled={frozen}>
        <legend className="sr-only">Application decision</legend>
        <div>
          <label htmlFor="application-review-decision" className="text-sm font-bold">
            Decision
          </label>
          <select
            id="application-review-decision"
            className="border-border bg-surface mt-2 min-h-11 w-full rounded-lg border px-3 text-sm"
            value={decision}
            onChange={(event) => setDecision(event.target.value as Decision)}
          >
            {Object.entries(LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="application-review-reason" className="text-sm font-bold">
            {decision === 'approved' ? 'Review note (optional)' : 'Reason for the merchant'}
          </label>
          <textarea
            id="application-review-reason"
            className="border-border bg-surface mt-2 w-full rounded-lg border p-3 text-sm"
            rows={5}
            maxLength={2000}
            value={reason}
            required={decision !== 'approved'}
            onChange={(event) => setReason(event.target.value)}
            aria-describedby="application-review-reason-hint"
          />
          <p id="application-review-reason-hint" className="text-muted-light mt-1 text-xs">
            {reason.length}/2000 characters. The reason is saved with this decision.
          </p>
        </div>
      </fieldset>
      {phase === 'unknown' ? (
        <Button block className="mt-4" onClick={() => void send(true)}>
          Retry same decision
        </Button>
      ) : (
        <Button
          block
          className="mt-4"
          loading={phase === 'pending'}
          loadingText="Saving decision…"
          disabled={frozen || reasonMissing || reason.length > 2000}
          variant={decision === 'rejected' ? 'danger' : 'black'}
          onClick={() => void send()}
        >
          Confirm {LABELS[decision].toLowerCase()}
        </Button>
      )}
      {message && (
        <p
          role={phase === 'confirmed' ? 'status' : 'alert'}
          className="mt-3 text-sm leading-relaxed"
        >
          {message}
        </p>
      )}
      {phase === 'unknown' && attempt.current && (
        <p className="text-muted-light mt-2 break-all text-xs">
          Operation {attempt.current.operationId}. Retry keeps this operation and its original
          decision.
        </p>
      )}
      {(phase === 'unknown' || phase === 'stale') && (
        <a
          href={`/merchants/applications/${merchantId}`}
          className="text-gold-text mt-3 inline-flex min-h-11 items-center text-sm font-bold underline"
        >
          Reload current application
        </a>
      )}
    </Card>
  );
}
