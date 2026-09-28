'use client';

import { Button, Input, Switch, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { Controls } from '@/app/merchants/actions';

export interface ControlState {
  accepting_orders: boolean;
  explore_visible: boolean;
  pay_on_delivery: boolean;
  pay_on_delivery_cap_kes: number | null;
  concierge_pick: boolean;
  accepting_orders_changed_at: string | null;
}

/**
 * "Status & controls" from the Merchants artboard.
 *
 * Each switch saves on its own. They are independent facts about the
 * business, not a form: turning off pay-on-delivery should not wait behind a
 * decision about Explore visibility, and there is no Save button on the
 * artboard because there is nothing to batch.
 */
export function MerchantControls({
  merchantId,
  live,
  state,
  onSave,
}: {
  merchantId: string;
  live: boolean;
  state: ControlState;
  onSave: (patch: Controls) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState<keyof Controls | null>(null);

  const save = async (key: keyof Controls, value: boolean) => {
    setBusy(key);
    const result = await onSave({ [key]: value });
    setBusy(null);

    if (!result.ok) {
      toast({ title: 'Not saved', description: result.message, tone: 'danger' });
      return;
    }
    router.refresh();
  };

  const toggledAt = state.accepting_orders_changed_at
    ? new Date(state.accepting_orders_changed_at).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Switch
        id={`accepting_${merchantId}`}
        label="Accepting orders"
        description={toggledAt ? `Merchant toggled ${toggledAt}` : 'The merchant’s own switch'}
        disabled={!live}
        disabledReason="Only a live business can take orders"
        loading={busy === 'accepting_orders'}
        checked={state.accepting_orders}
        onCheckedChange={(next) => save('accepting_orders', next)}
      />

      <Switch
        id={`explore_${merchantId}`}
        label="Visible in Explore"
        description={state.explore_visible ? 'Listed publicly' : 'Hidden from the listing'}
        loading={busy === 'explore_visible'}
        checked={state.explore_visible}
        onCheckedChange={(next) => save('explore_visible', next)}
      />

      <Switch
        id={`pod_${merchantId}`}
        label="Pay on delivery"
        /* The ceiling is a business number nobody has agreed, so it renders
           bracketed rather than as a figure someone might quote. */
        description={
          state.pay_on_delivery
            ? `Allowed up to KES ${state.pay_on_delivery_cap_kes ?? '[—]'}`
            : 'Card and M-Pesa only'
        }
        loading={busy === 'pay_on_delivery'}
        checked={state.pay_on_delivery}
        onCheckedChange={(next) => save('pay_on_delivery', next)}
      />

      <Switch
        id={`pick_${merchantId}`}
        label="Concierge pick"
        description="Editorial · not paid"
        disabled={!live}
        disabledReason="Only a live business can be a pick"
        loading={busy === 'concierge_pick'}
        checked={state.concierge_pick}
        onCheckedChange={(next) => save('concierge_pick', next)}
      />
    </div>
  );
}

/**
 * Pause and suspend. Kept apart because they are not the same decision: a
 * pause is reversible and takes one person, a suspension is a sanction that
 * needs a reason and somebody else's signature.
 */
export function MerchantStatusActions({
  status,
  onPause,
  onRequestSuspension,
  pendingSuspension,
}: {
  status: string;
  onPause: (paused: boolean, reason: string) => Promise<{ ok: boolean; message: string }>;
  onRequestSuspension: (reason: string) => Promise<{ ok: boolean; message: string }>;
  pendingSuspension: { reason: string; requestedBy: string } | null;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState<'pause' | 'suspend' | null>(null);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const run = async (work: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    const result = await work();
    setBusy(false);

    toast({
      title: result.ok ? 'Done' : 'Not done',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });

    if (result.ok) {
      setOpen(null);
      setReason('');
      router.refresh();
    }
  };

  if (pendingSuspension) {
    return (
      <div className="border-danger/30 bg-danger-bg rounded-xl border p-4">
        <p className="text-danger text-sm font-extrabold">Suspension waiting for approval</p>
        <p className="text-muted mt-1 text-xs font-semibold leading-snug">
          “{pendingSuspension.reason}” — requested by {pendingSuspension.requestedBy}. Someone else
          has to decide it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === 'paused' ? (
          <Button
            variant="outline"
            size="sm"
            loading={busy}
            onClick={() => run(() => onPause(false, ''))}
          >
            Resume listing
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={status !== 'live'}
            onClick={() => setOpen(open === 'pause' ? null : 'pause')}
          >
            Pause listing
          </Button>
        )}

        <Button
          variant="danger"
          size="sm"
          disabled={status === 'suspended'}
          onClick={() => setOpen(open === 'suspend' ? null : 'suspend')}
        >
          {status === 'suspended' ? 'Suspended' : 'Suspend…'}
        </Button>
      </div>

      {open && (
        <div className="border-border mt-3 border-t pt-3">
          <Input
            id="status_reason"
            label={open === 'pause' ? 'Why pause?' : 'Why suspend?'}
            hint={
              open === 'pause'
                ? 'Shown to the merchant.'
                : 'Shown to whoever approves it, and recorded against the business.'
            }
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant={open === 'suspend' ? 'danger' : 'black'}
              loading={busy}
              onClick={() =>
                run(() => (open === 'pause' ? onPause(true, reason) : onRequestSuspension(reason)))
              }
            >
              {open === 'pause' ? 'Pause listing' : 'Send for approval'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <p className="text-muted-light mt-3 text-xs font-semibold leading-snug">
        Suspension needs a reason and a second approver. Payout is held while suspended.
      </p>
    </div>
  );
}
