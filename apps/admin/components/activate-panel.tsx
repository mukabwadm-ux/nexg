'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

/**
 * The last step of onboarding: activate a rider, or take a merchant live.
 *
 * The button stays enabled even when documents are outstanding. The RPC is
 * the authority on whether this is allowed — it counts the same requirements
 * server-side and refuses with a reason — and a greyed-out button would leave
 * a reviewer guessing which of six documents is holding things up. Pressing
 * it gets them the actual answer.
 */
export function ActivatePanel({
  kind,
  disabled,
  outstanding,
  currentStatus,
  openItems,
  onActivate,
}: {
  kind: 'rider' | 'merchant';
  disabled: boolean;
  outstanding: number;
  currentStatus: string;
  /** What the merchant (or NexG) still has to do before going live (rpc_merchant_setup_todo). */
  openItems?: { label: string; who: string; count?: number }[] | null;
  onActivate: (reason: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const verb = kind === 'rider' ? 'Activate rider' : 'Take live';
  const done = kind === 'rider' ? 'active' : 'live';

  const run = async () => {
    setPending(true);
    const result = await onActivate(reason);
    setPending(false);

    toast({
      title: result.ok ? 'Done' : 'Not yet',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });

    if (result.ok) {
      setReason('');
      router.refresh();
    }
  };

  if (disabled) {
    return (
      <Card tone="muted" className="p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide">Onboarding</h2>
        <p className="text-muted mt-2 text-sm font-semibold">
          {kind === 'merchant'
            ? 'Already live. Order taking and Discovery are under Status & controls; deactivating is under Merchant access.'
            : `Already ${done}. Suspending or offboarding happens from the directory.`}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Onboarding</h2>
      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        {outstanding === 0
          ? 'Everything required is verified. This is the last step.'
          : `${outstanding} required ${outstanding === 1 ? 'document is' : 'documents are'} not verified yet. ${verb} will tell you exactly which.`}
      </p>
      {openItems && openItems.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-bold">Still open before going live</p>
          <ul className="text-muted mt-1 list-disc pl-5 text-sm font-semibold leading-[1.7]">
            {openItems.map((item) => (
              <li key={item.label}>
                {item.label}
                {item.count ? ` (${item.count})` : ''}
                {item.who === 'nexg' ? ' · NexG' : ' · merchant, in their dashboard'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <Input
          id="activate_reason"
          label="Note (optional)"
          hint="Goes into the audit trail with your name."
          placeholder="Documents checked against the originals."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <Button block className="mt-4" loading={pending} loadingText="Working…" onClick={run}>
        {verb}
      </Button>

      <p className="text-muted-light mt-3 text-xs font-semibold">
        Current status: <span className="font-bold">{currentStatus}</span>
      </p>
    </Card>
  );
}
