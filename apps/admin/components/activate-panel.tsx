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
  onActivate,
}: {
  kind: 'rider' | 'merchant';
  disabled: boolean;
  outstanding: number;
  currentStatus: string;
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
          Already {done}. Suspending or offboarding happens from the directory.
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
