'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import {
  decisionsFor,
  needsReason,
  type ReviewDecision,
  type ReviewStatus,
} from '@/lib/property-detail';

type ReviewAction = (input: {
  propertyId: string;
  decision: string;
  reason: string;
}) => Promise<{ error?: string; success?: boolean }>;

const BUTTON: Record<ReviewDecision, { label: string; tone: string; confirm: string }> = {
  approve: {
    label: 'Approve',
    tone: 'bg-ink text-white',
    confirm: 'Approve and let guests see it',
  },
  reject: {
    label: 'Reject',
    tone: 'border-danger text-danger border',
    confirm: 'Reject with this reason',
  },
  suspend: {
    label: 'Suspend',
    tone: 'border-danger text-danger border',
    confirm: 'Suspend and take it off the site',
  },
  reinstate: {
    label: 'Reinstate',
    tone: 'bg-ink text-white',
    confirm: 'Reinstate',
  },
};

/** The reviewer's buttons. A reject or suspend asks for the reason first. */
export function PropertyReview({
  propertyId,
  status,
  action,
}: {
  propertyId: string;
  status: ReviewStatus;
  action: ReviewAction;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<ReviewDecision | null>(null);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function decide(decision: ReviewDecision) {
    setBusy(true);
    setError(null);
    try {
      const result = await action({ propertyId, decision, reason });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(null);
      setReason('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {decisionsFor(status).map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setOpen(d);
            }}
            className={`rounded-full px-4 py-2 text-[0.8125rem] font-extrabold disabled:opacity-50 ${
              BUTTON[d].tone
            } ${open === d ? 'ring-gold ring-2 ring-offset-1' : ''}`}
          >
            {BUTTON[d].label}
          </button>
        ))}
      </div>

      {open && (
        <div className="border-border-strong mt-3 rounded-lg border p-3">
          {needsReason(open) ? (
            <label className="block">
              <span className="text-[0.75rem] font-extrabold">
                Reason (the host sees this) — what is wrong and what would fix it
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                className="border-border-strong mt-1.5 w-full rounded-md border p-2 text-sm"
              />
            </label>
          ) : (
            <p className="text-muted text-[0.75rem] font-semibold">
              {open === 'approve'
                ? 'You have checked the photos, the address and the host’s authority to let it.'
                : 'The reason for the suspension has been dealt with.'}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (needsReason(open) && reason.trim().length < 5)}
              onClick={() => decide(open)}
              className={`rounded-full px-4 py-2 text-[0.8125rem] font-extrabold disabled:opacity-50 ${BUTTON[open].tone}`}
            >
              {busy ? 'Saving…' : BUTTON[open].confirm}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(null)}
              className="text-muted rounded-full px-4 py-2 text-[0.8125rem] font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-danger mt-2 text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
