'use client';

import { Button, DetailPanel, useToast } from '@nexg/ui';
import { Check, MessageSquareText, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { activateMerchant, sendBackDocuments } from '@/app/merchants/verification/actions';
import {
  ApplicationReviewControls,
  type Decision,
} from '@/components/merchants/application-review-controls';
import { PaneButton } from '@/components/portal/dash-detail';

/**
 * The three buttons along the bottom of the review pane. What they do
 * depends on where the merchant is:
 *
 *  review    an application on the form, submitted and waiting: each
 *            button opens the same decision form as the application page,
 *            already on that decision (the server checks every document
 *            before approving, then takes the merchant live).
 *  activate  the application is approved but the merchant is not live:
 *            Approve & Activate finishes going live.
 *  legacy    applied before the form: Request More Info sends documents
 *            back with reasons; Approve & Activate takes them live once
 *            every required document is verified. There is no rejection
 *            for these in the database, so Reject says so.
 *  waiting   nothing to decide yet (not submitted, or changes requested).
 *  closed    live, or rejected.
 */
export type DecisionMode = 'review' | 'activate' | 'legacy' | 'waiting' | 'closed';

export function VerificationDecision({
  merchantId,
  name,
  mode,
  actorId,
  revision,
  ready,
  blocker,
  note,
  sendable,
}: {
  merchantId: string;
  name: string;
  mode: DecisionMode;
  /** The signed-in person's user id, for the review form. */
  actorId: string | null;
  revision: number | null;
  /** Every required document verified (legacy and activate). */
  ready: boolean;
  /** Why Approve & Activate is not available, when it is not. */
  blocker: string | null;
  /** Why the buttons are off, for waiting and closed. */
  note: string | null;
  /** Documents on file that can be sent back (legacy). */
  sendable: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const [sendBack, setSendBack] = React.useState(false);
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setDecision(null);
    setSendBack(false);
    setReasons({});
    setChosen(new Set());
  }, [merchantId]);

  async function activate() {
    setBusy(true);
    try {
      const result = await activateMerchant(merchantId);
      toast({
        title: result.ok ? `${name} is live` : 'Not activated',
        description: result.message,
        tone: result.ok ? 'success' : 'danger',
      });
      if (result.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitSendBack() {
    const picked = Object.fromEntries([...chosen].map((id) => [id, reasons[id] ?? '']));
    if (Object.values(picked).some((r) => !r.trim()) || chosen.size === 0) {
      toast({
        title: 'Say what needs fixing',
        description: 'Each document you send back needs a reason. The merchant reads it.',
        tone: 'warning',
      });
      return;
    }
    setBusy(true);
    try {
      const result = await sendBackDocuments(merchantId, picked);
      toast({
        title: result.ok ? 'Sent back' : 'Not sent back',
        description: result.message,
        tone: result.ok ? 'success' : 'danger',
      });
      if (result.ok) {
        setSendBack(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const reviewing = mode === 'review' && actorId && revision != null;
  const offNote = mode === 'waiting' || mode === 'closed' ? (note ?? undefined) : undefined;

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-3">
        <PaneButton
          icon={MessageSquareText}
          disabled={busy || !(reviewing || (mode === 'legacy' && sendable.length > 0))}
          title={
            offNote ??
            (mode === 'activate'
              ? 'The application is already approved.'
              : mode === 'legacy' && sendable.length === 0
                ? 'Nothing is on file to send back. Chase missing documents from Submitted Documents.'
                : undefined)
          }
          onClick={() => (mode === 'legacy' ? setSendBack(true) : setDecision('changes_requested'))}
        >
          Request More Info
        </PaneButton>
        <PaneButton
          icon={X}
          tone="danger"
          disabled={busy || !reviewing}
          title={
            offNote ??
            (mode === 'legacy'
              ? 'This merchant applied before the application form, which is the only thing that can be rejected. Send documents back instead, or remove the merchant from its record.'
              : mode === 'activate'
                ? 'The application is already approved.'
                : undefined)
          }
          onClick={() => setDecision('rejected')}
        >
          Reject
        </PaneButton>
        <PaneButton
          icon={Check}
          tone="gold"
          disabled={busy || !(reviewing || ((mode === 'activate' || mode === 'legacy') && ready))}
          title={offNote ?? (!ready && mode !== 'review' ? (blocker ?? undefined) : undefined)}
          onClick={() => (mode === 'review' ? setDecision('approved') : void activate())}
        >
          {busy && mode !== 'review' ? 'Activating…' : 'Approve & Activate'}
        </PaneButton>
      </div>
      {(offNote || (blocker && !ready && mode !== 'review')) && (
        <p className="text-muted mt-2 text-[0.8125rem] font-semibold">{offNote ?? blocker}</p>
      )}

      <DetailPanel
        open={decision !== null}
        onOpenChange={(open) => !open && setDecision(null)}
        title={
          decision === 'approved'
            ? `Approve & activate ${name}`
            : decision === 'rejected'
              ? `Reject ${name}`
              : `Request more information from ${name}`
        }
        subtitle="Saved with the application and shown to the merchant."
      >
        {decision && reviewing && (
          <ApplicationReviewControls
            key={decision}
            actorId={actorId!}
            merchantId={merchantId}
            revision={revision!}
            canReview
            initialDecision={decision}
          />
        )}
      </DetailPanel>

      <DetailPanel
        open={sendBack}
        onOpenChange={setSendBack}
        title={`Request more information from ${name}`}
        subtitle="Send documents back. Each needs a reason; the merchant reads it and uploads again."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSendBack(false)}>
              Cancel
            </Button>
            <Button
              variant="black"
              loading={busy}
              disabled={chosen.size === 0}
              onClick={() => void submitSendBack()}
            >
              Send back {chosen.size > 0 ? chosen.size : ''}
            </Button>
          </div>
        }
      >
        <ul className="space-y-3">
          {sendable.map((d) => {
            const on = chosen.has(d.id);
            return (
              <li key={d.id} className="border-border rounded-xl border p-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] font-bold">
                  <input
                    type="checkbox"
                    className="h-[1.125rem] w-[1.125rem] accent-[#E5A800]"
                    checked={on}
                    onChange={(e) =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        return next;
                      })
                    }
                  />
                  {d.label}
                </label>
                {on && (
                  <textarea
                    className="border-border bg-surface mt-2 w-full rounded-lg border p-2.5 text-sm"
                    rows={3}
                    maxLength={1000}
                    placeholder="What needs fixing, in words the merchant will understand"
                    aria-label={`Reason for sending back ${d.label}`}
                    value={reasons[d.id] ?? ''}
                    onChange={(e) => setReasons((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </DetailPanel>
    </>
  );
}
