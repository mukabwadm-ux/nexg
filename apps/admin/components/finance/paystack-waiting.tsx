'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { decideHostSubaccount } from '@/app/hotels/host-paystack-actions';
import { decideSubaccount } from '@/app/merchants/subaccount-actions';
import { EarlyPayouts, type EarlyPayoutRow } from '@/components/finance/early-payouts';
import {
  Empty,
  hostHref,
  merchantCommissionHref,
  merchantHref,
  ModePill,
  PartyLink,
  Problem,
} from '@/components/finance/paystack-parts';
import { RiderPayouts, type RiderPayoutRow } from '@/components/finance/rider-payouts';
import { PanelHead, Sheet } from '@/components/portal/kit';
import {
  SCHEDULES,
  type Approvals,
  type Opens,
  type PendingCommission,
  type PendingSubaccount,
  type Read,
} from '@/lib/finance-paystack';
import { dateTime, day } from '@/lib/portal';

type Party = 'merchant' | 'host';
/** The Paystack mode the console looks sub-accounts up in; null without a key. */
type Mode = 'test' | 'live' | null;

const percent = (n: number | null) => (n === null ? 'preset' : `${n}%`);

/**
 * Everything about Paystack that waits for a decision. Sub-accounts are
 * decided here, with the same look-up in Paystack as on the merchant's or
 * host's page; commission rates are decided on that page. Rider payouts wait
 * for Finance: they are the same rows and buttons as on Settlements.
 */
export function PaystackWaiting({
  approvals,
  canAct,
  opens,
  mode,
  early,
  held,
  ridersError,
}: {
  approvals: Read<Approvals>;
  canAct: boolean;
  opens: Opens;
  mode: Mode;
  /** Early payout requests, pending or approved. */
  early: EarlyPayoutRow[];
  /** Automatic payouts held for Finance. */
  held: RiderPayoutRow[];
  ridersError: string | null;
}) {
  return (
    <>
      {approvals.ok ? (
        <Parties approvals={approvals.data} canAct={canAct} opens={opens} mode={mode} />
      ) : (
        <Problem>Merchants and hosts: {approvals.message}</Problem>
      )}
      <Sheet>
        <PanelHead title="Riders: Waiting for Finance" />
        <div className="mt-4 space-y-4">
          {ridersError && <Problem>Rider payouts could not be loaded: {ridersError}</Problem>}
          {!ridersError && early.length === 0 && held.length === 0 && (
            <Empty>No rider payout is waiting.</Empty>
          )}
          <EarlyPayouts rows={early} canDecide={canAct} />
          <RiderPayouts rows={held} canDecide={canAct} />
        </div>
      </Sheet>
    </>
  );
}

function Parties({
  approvals,
  canAct,
  opens,
  mode,
}: {
  approvals: Approvals;
  canAct: boolean;
  opens: Opens;
  mode: Mode;
}) {
  const subaccounts = [
    ...approvals.merchant_subaccounts.map((row) => ({ party: 'merchant' as const, row })),
    ...approvals.host_subaccounts.map((row) => ({ party: 'host' as const, row })),
  ];
  const commissions = [
    ...approvals.merchant_commissions.map((row) => ({ party: 'merchant' as const, row })),
    ...approvals.host_commissions.map((row) => ({ party: 'host' as const, row })),
  ];
  return (
    <>
      <Sheet>
        <PanelHead title="Sub-accounts" aside="a second Finance person switches them on" />
        {subaccounts.length === 0 ? (
          <Empty>No sub-account is waiting.</Empty>
        ) : (
          <ul className="mt-4 space-y-2">
            {subaccounts.map(({ party, row }) => (
              <Subaccount
                key={row.id}
                party={party}
                row={row}
                canAct={canAct}
                open={opens[party]}
                mode={mode}
              />
            ))}
          </ul>
        )}
      </Sheet>
      <Sheet>
        <PanelHead title="Commission Rates" aside="decided on the merchant's or host's page" />
        {commissions.length === 0 ? (
          <Empty>No commission rate you can see is waiting.</Empty>
        ) : (
          <ul className="mt-4 space-y-2">
            {commissions.map(({ party, row }) => (
              <Commission
                key={row.id}
                party={party}
                row={row}
                canAct={canAct}
                open={opens[party]}
              />
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

const asked = (row: { requested_by: string | null; requested_at: string | null }) =>
  `Asked by ${row.requested_by ?? 'someone'} · ${dateTime(row.requested_at)}`;

function Subaccount({
  party,
  row,
  canAct,
  open,
  mode,
}: {
  party: Party;
  row: PendingSubaccount;
  canAct: boolean;
  open: boolean;
  mode: Mode;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const d = row.details;
  const mismatch = d.paystack_schedule && d.paystack_schedule.toLowerCase() !== row.schedule;
  /* Switching on looks the sub-account up in the console's mode, so it can only
     work in the sub-account's own. Turning down needs no look-up. */
  const needs = row.test ? 'test' : 'live';
  const canSwitchOn = mode === needs;

  async function decide(approve: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const result =
        party === 'merchant'
          ? await decideSubaccount(row.party_id, row.id, row.code, approve, note)
          : await decideHostSubaccount(row.id, row.code, approve, note);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: 'The console could not be reached. Try again.' });
    }
    setBusy(false);
  }

  return (
    <li className="border-border rounded-xl border p-3.5">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <PartyLink
          href={
            !open
              ? null
              : party === 'merchant'
                ? merchantHref(row.party_id)
                : hostHref(row.party_id)
          }
        >
          {row.name ?? (party === 'merchant' ? 'Merchant' : 'Host')}
        </PartyLink>
        <span className="text-muted">{party === 'merchant' ? 'Merchant' : 'Host'}</span>
        <span className="font-extrabold">{row.code}</span>
        <ModePill test={row.test} />
        <span className="text-muted">{SCHEDULES[row.schedule] ?? row.schedule}</span>
      </p>
      <p className="text-muted mt-1 text-xs font-semibold">
        Paystack pays {d.business_name ?? 'the account'}
        {d.settlement_bank ? ` at ${d.settlement_bank}` : ''}
        {d.account_last4 ? ` ····${d.account_last4}` : ''} · {asked(row)}
        {row.note ? ` · ${row.note}` : ''}
      </p>
      {mismatch && (
        <p className="text-danger mt-1 text-xs font-bold">
          Paystack shows its schedule as {d.paystack_schedule}.
        </p>
      )}
      {canAct && row.can_decide ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            aria-label={`Note for ${row.code}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (needed to turn down)"
            className="border-border-strong min-w-[10rem] flex-1 rounded-lg border px-3 py-1.5 text-[0.75rem] font-semibold"
          />
          {canSwitchOn && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide(true)}
              className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
            >
              Switch on
            </button>
          )}
          <button
            type="button"
            disabled={busy || note.trim() === ''}
            onClick={() => void decide(false)}
            className="border-danger text-danger rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          >
            Turn down
          </button>
          {!canSwitchOn && (
            <p className="text-danger w-full text-xs font-bold">
              {mode === null
                ? 'The console has no Paystack key, so it cannot be switched on.'
                : `To switch it on, the console must be in ${needs} mode.`}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1 text-xs font-bold">Waiting for a second Finance person.</p>
      )}
      {message && (
        <p
          role="status"
          className={`mt-1 text-xs font-bold ${message.ok ? 'text-success' : 'text-danger'}`}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

function Commission({
  party,
  row,
  canAct,
  open,
}: {
  party: Party;
  row: PendingCommission;
  canAct: boolean;
  open: boolean;
}) {
  const href = !open
    ? null
    : party === 'merchant'
      ? merchantCommissionHref(row.party_id)
      : hostHref(row.party_id);
  const rate =
    party === 'merchant'
      ? `Own riders ${percent(row.own_delivery_pct)} · NexG riders ${percent(row.nexg_delivery_pct)}`
      : row.pct === null
        ? 'Back to the preset'
        : `${row.pct}%`;
  return (
    <li className="border-border rounded-xl border p-3.5">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <PartyLink href={href}>
          {row.name ?? (party === 'merchant' ? 'Merchant' : 'Host')}
        </PartyLink>
        <span className="text-muted">{party === 'merchant' ? 'Merchant' : 'Host'}</span>
        <span className="font-extrabold">{rate}</span>
        <span className="text-muted">
          from {day(row.starts_on)}
          {row.ends_on ? ` to ${day(row.ends_on)}` : ''}
        </span>
      </p>
      <p className="text-muted mt-1 text-xs font-semibold">
        {row.reason ? `${row.reason} · ` : ''}
        {row.terms_ref ? `${row.terms_ref} · ` : ''}
        {asked(row)}
      </p>
      <p className="mt-1 text-xs font-bold">
        {!(canAct && row.can_decide) ? (
          'Waiting for a second person.'
        ) : href ? (
          <PartyLink href={href}>Decide on their page</PartyLink>
        ) : (
          'It is decided on their page, which your role cannot open. Ask a super admin.'
        )}
      </p>
    </li>
  );
}
