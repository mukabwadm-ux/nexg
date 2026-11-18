'use client';

import { Button } from '@nexg/ui';
import * as React from 'react';

import { declarePartnerPayout } from '@/app/experiences/actions';
import { FormPanel, SelectField, TextField, useRunner } from '@/components/portal/client-kit';
import {
  PARTNER_PAYOUT_RAILS,
  payoutDeclaration,
  type PartnerPayout,
  type PartnerPayoutRail,
} from '@/lib/partner-payouts';

import { when } from './shared';

/**
 * Payout Details on a partner's profile: where NexG pays the partner for
 * their blocks, and whether Finance has verified it. The weekly payout run
 * holds the partner's money until both are true. Only the masked
 * destination is shown here; the details themselves stay with Finance.
 */
export function PartnerPayoutPanel({
  partnerId,
  partnerName,
  payout,
  canDeclare,
}: {
  partnerId: string;
  partnerName: string;
  payout: PartnerPayout | null;
  /** Staff who work Experiences at full level; the database checks again. */
  canDeclare: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="border-border mt-4 rounded-xl border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide">Payout Details</p>
          {payout ? (
            <>
              <p className="text-muted mt-1 text-xs font-semibold">
                {PARTNER_PAYOUT_RAILS[payout.rail].label} · {payout.destination_masked ?? '—'}
                {payout.account_name ? ` · ${payout.account_name}` : ''}
              </p>
              <p
                className={`mt-1 text-xs font-bold ${payout.verified ? 'text-success' : 'text-warning'}`}
              >
                {payout.verified
                  ? `Verified by Finance${payout.verified_at ? ` · ${when(payout.verified_at)}` : ''}`
                  : 'Waiting for Finance to verify. Payouts are held until then.'}
              </p>
            </>
          ) : (
            <p className="text-muted-light mt-1 text-xs font-semibold">
              None yet. The weekly payout run holds this partner&apos;s money until details are
              declared and Finance verifies them.
            </p>
          )}
        </div>
        {canDeclare && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {payout ? 'Change Payout Details' : 'Add Payout Details'}
          </Button>
        )}
      </div>
      {open && (
        <DeclarePanel
          partnerId={partnerId}
          partnerName={partnerName}
          current={payout?.rail ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function DeclarePanel({
  partnerId,
  partnerName,
  current,
  onClose,
}: {
  partnerId: string;
  partnerName: string;
  current: PartnerPayoutRail | null;
  onClose: () => void;
}) {
  const [rail, setRail] = React.useState<PartnerPayoutRail>(current ?? 'mpesa_till');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const { run, busy } = useRunner();

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Payout Details"
      subtitle={partnerName}
      submitLabel="Save for Verification"
      busy={busy}
      onSubmit={() => run(() => declarePartnerPayout(partnerId, payoutDeclaration(rail, values)))}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        Where NexG pays {partnerName} for their blocks. Finance checks the details with the partner
        before the weekly run pays them.{' '}
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
