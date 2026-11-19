'use client';

import { Button, Card } from '@nexg/ui';
import * as React from 'react';

import { declareHostPayout } from '@/app/hotels/actions';
import { FormPanel, SelectField, TextField, useRunner } from '@/components/portal/client-kit';
import type { HostPayout } from '@/lib/host-payouts';
import {
  PARTNER_PAYOUT_RAILS,
  payoutDeclaration,
  type PartnerPayoutRail,
} from '@/lib/partner-payouts';

import { when } from './shared';

/**
 * Payout Details on a host's record: where NexG pays the host their stay
 * shares and referral rewards, and whether Finance has verified it. The
 * weekly payout run holds the host's money until both are true. Only the
 * masked destination is shown here; the details themselves stay with Finance.
 */
export function HostPayoutPanel({
  hostId,
  hostName,
  payout,
  canDeclare,
  unavailable = false,
}: {
  hostId: string;
  hostName: string;
  payout: HostPayout | null;
  /** Hospitality staff (ops managers, partnerships, city leads); the database checks again. */
  canDeclare: boolean;
  /** The details could not be read for this viewer. */
  unavailable?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-extrabold">Payout Details</p>
          {unavailable ? (
            <p className="text-muted mt-2 text-[0.75rem] font-semibold">
              Payout details could not be loaded for your account.
            </p>
          ) : payout ? (
            <>
              <p className="text-muted mt-2 text-[0.75rem] font-semibold">
                {PARTNER_PAYOUT_RAILS[payout.rail].label} · {payout.destination_masked ?? '—'}
                {payout.account_name ? ` · ${payout.account_name}` : ''}
              </p>
              <p
                className={`mt-1 text-[0.6875rem] font-extrabold ${
                  payout.verified ? 'text-success' : 'text-warning'
                }`}
              >
                {payout.verified
                  ? `Verified by Finance${payout.verified_at ? ` · ${when(payout.verified_at)}` : ''}`
                  : 'Waiting for Finance to verify. Payouts are held until then.'}
              </p>
            </>
          ) : (
            <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-snug">
              None yet. The weekly payout run holds what this host is owed for stays and referrals
              until details are added and Finance verifies them.
            </p>
          )}
        </div>
        {canDeclare && !unavailable && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {payout ? 'Change Payout Details' : 'Add Payout Details'}
          </Button>
        )}
      </div>
      {open && (
        <DeclarePanel
          hostId={hostId}
          hostName={hostName}
          current={payout?.rail ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
  );
}

function DeclarePanel({
  hostId,
  hostName,
  current,
  onClose,
}: {
  hostId: string;
  hostName: string;
  current: PartnerPayoutRail | null;
  onClose: () => void;
}) {
  const [rail, setRail] = React.useState<PartnerPayoutRail>(current ?? 'mpesa_phone');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const { run, busy } = useRunner();

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Payout Details"
      subtitle={hostName}
      submitLabel="Save for Verification"
      busy={busy}
      onSubmit={() => run(() => declareHostPayout(hostId, payoutDeclaration(rail, values)))}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        Where NexG pays {hostName} their share of stays booked through NexG, and their referral
        rewards. Finance checks the details with the host before the weekly run pays them.{' '}
        {current ? 'Saving new details holds payouts until Finance verifies them again.' : ''}
      </p>
      <SelectField
        label="Paid By"
        required
        value={rail}
        onChange={(e) => setRail(e.target.value as PartnerPayoutRail)}
        options={Object.entries(PARTNER_PAYOUT_RAILS).map(([value, r]) => ({
          value,
          label: r.label,
        }))}
      />
      {PARTNER_PAYOUT_RAILS[rail].fields.map((f) => (
        <TextField
          key={`${rail}-${f.key}`}
          label={f.label}
          required
          value={values[f.key] ?? ''}
          onChange={(e) => {
            const next = e.target.value;
            setValues((v) => ({ ...v, [f.key]: next }));
          }}
          placeholder={f.placeholder}
          inputMode={f.numeric ? 'numeric' : undefined}
          maxLength={f.key === 'accountName' ? 200 : f.numeric ? 20 : 100}
          autoComplete="off"
        />
      ))}
    </FormPanel>
  );
}
