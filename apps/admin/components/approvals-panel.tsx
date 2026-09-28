'use client';

import { Button, useToast } from '@nexg/ui';
import { Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface PendingApproval {
  id: string;
  title: string;
  detail: string;
  /** True when this is the viewer's own request — they may not decide it. */
  ownRequest: boolean;
}

/**
 * "Approvals waiting for you" from the Overview artboard.
 *
 * A request the viewer raised themselves is shown but not decidable. Hiding it
 * would be worse: they would wonder whether it had been sent at all, and the
 * point of the rule is that they can see it waiting on someone else.
 */
export function ApprovalsPanel({
  approvals,
  onDecide,
}: {
  approvals: PendingApproval[];
  onDecide: (id: string, approve: boolean) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    const result = await onDecide(id, approve);
    setBusy(null);

    toast({
      title: result.ok ? 'Done' : 'Not done',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });
    if (result.ok) router.refresh();
  };

  if (approvals.length === 0) {
    return <p className="text-muted-light text-sm font-semibold">Nothing waiting on you.</p>;
  }

  return (
    <ul className="space-y-3">
      {approvals.map((approval) => (
        <li
          key={approval.id}
          className="border-border bg-bg/60 flex items-start justify-between gap-3 rounded-xl border p-3"
        >
          <span className="min-w-0">
            <span className="block truncate text-[0.8125rem] font-extrabold">{approval.title}</span>
            <span className="text-muted-light block text-xs font-semibold leading-snug">
              {approval.detail}
            </span>
          </span>

          {approval.ownRequest ? (
            <span className="text-muted-light shrink-0 text-[0.625rem] font-bold uppercase tracking-wide">
              Yours
            </span>
          ) : (
            <span className="flex shrink-0 gap-1.5">
              <Button
                size="sm"
                variant="outline"
                aria-label="Approve"
                loading={busy === approval.id}
                onClick={() => decide(approval.id, true)}
                className="text-success"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label="Reject"
                disabled={busy === approval.id}
                onClick={() => decide(approval.id, false)}
                className="text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
