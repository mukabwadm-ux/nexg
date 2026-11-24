'use client';

import { Button, Card, Input, Switch, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { ApiBookingAccess } from '@/app/merchants/actions';

const kes = (value: number) => `KES ${value.toLocaleString('en-KE')}`;

/**
 * Live API bookings for one merchant: whether its own system may book NexG
 * services (couriers, transfers, venues) through the API, charged to its
 * account, and how much a month. Finance's decision (rpc_api_booking_access_set), audited; the
 * booking function refuses a merchant that is off, or a booking past the
 * limit. Test keys always book in the sandbox, whatever this says.
 */
export function ApiBookingsCard({
  merchantId,
  live,
  state,
  onSave,
}: {
  merchantId: string;
  live: boolean;
  state: ApiBookingAccess;
  onSave: (
    enabled: boolean,
    monthlyLimitKes: number,
    note: string,
  ) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(state.enabled);
  const [limit, setLimit] = React.useState(
    state.monthly_limit_kes === null ? '' : String(state.monthly_limit_kes),
  );
  const [note, setNote] = React.useState(state.note ?? '');
  const [busy, setBusy] = React.useState(false);

  const limitKes = Number(limit.replace(/[,\s]/g, ''));
  const limitValid = Number.isInteger(limitKes) && limitKes >= 1 && limitKes <= 1_000_000_000;
  const changed =
    enabled !== state.enabled ||
    limit !== (state.monthly_limit_kes === null ? '' : String(state.monthly_limit_kes)) ||
    note !== (state.note ?? '');

  const save = async () => {
    setBusy(true);
    const result = await onSave(enabled, limitKes, note);
    setBusy(false);
    if (!result.ok) {
      toast({ title: 'Not saved', description: result.message, tone: 'danger' });
      return;
    }
    toast({ title: result.message });
    router.refresh();
  };

  return (
    <Card id="api-bookings" className="scroll-mt-24 p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">API bookings</h2>
      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        Lets this merchant&apos;s own system book NexG services through the API (couriers,
        transfers, venues), charged to its account, up to a monthly limit. Off, it can only test in
        the sandbox.
      </p>

      <div className="mt-4 grid gap-3">
        <Switch
          id={`api_bookings_${merchantId}`}
          label="Live API bookings"
          description={enabled ? 'Charged to the merchant’s account' : 'Sandbox only'}
          disabled={!live && !state.enabled}
          disabledReason="Only a live business can book through the API"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Input
          id={`api_limit_${merchantId}`}
          label="Monthly limit (KES)"
          inputMode="numeric"
          placeholder="50000"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          error={
            limit !== '' && !limitValid ? 'Whole shillings, from 1 to 1,000,000,000.' : undefined
          }
        />
        <Input
          id={`api_note_${merchantId}`}
          label="Note (optional)"
          maxLength={500}
          placeholder="Why, and who agreed it"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div>
          <Button type="button" disabled={!changed || !limitValid || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <p className="text-muted mt-4 text-xs font-semibold leading-[1.7]">
        This month: {kes(state.month_used_kes)} across {state.month_bookings}{' '}
        {state.month_bookings === 1 ? 'booking' : 'bookings'}
        {state.monthly_limit_kes !== null ? ` of ${kes(state.monthly_limit_kes)}` : ''}.
        {state.changed_at
          ? ` Last changed ${new Date(state.changed_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}${state.changed_by ? ` by ${state.changed_by}` : ''}.`
          : ''}
      </p>
    </Card>
  );
}
