'use client';

import { Card } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  decideRecovery,
  decideSubaccount,
  pauseSubaccount,
  requestSubaccount,
  settleRecovery,
  type SubaccountResult,
} from '@/app/merchants/subaccount-actions';

export interface SplitOverview {
  viewer: 'staff' | 'merchant';
  canRecord: boolean;
  owedCents: number;
  subaccounts: {
    id: string;
    test: boolean;
    code: string;
    schedule: string;
    status: string;
    details: {
      business_name?: string | null;
      settlement_bank?: string | null;
      account_last4?: string | null;
      paystack_schedule?: string | null;
    };
    requestedAt: string;
    decidedAt: string | null;
    requestedBy?: string | null;
    decidedBy?: string | null;
    note?: string | null;
    decisionNote?: string | null;
    canDecide?: boolean;
  }[];
  orders: {
    orderId: string;
    reference: string;
    paidAt: string;
    totalCents: number;
    commissionCents: number;
    shareCents: number;
    keptForRefundsCents: number;
    toMerchantCents: number;
    test: boolean;
  }[];
  recoveries: {
    id: string;
    orderReference: string | null;
    amountCents: number;
    recoveredCents: number;
    method: string;
    state: string;
    decidedAt: string;
    test: boolean;
  }[];
  refundsToDecide: {
    refundId: string;
    orderReference: string;
    refundCents: number;
    shareCents: number;
    status: string;
    test: boolean;
  }[];
}

const SCHEDULE: Record<string, string> = {
  auto: 'Every 2 working days (Paystack auto)',
  weekly: 'Weekly',
  monthly: 'Monthly',
  manual: 'Manual: paid when Finance releases it in Paystack',
};

const kes = (cents: number) => `KES ${Math.round(cents / 100).toLocaleString('en-KE')}`;
const field = 'border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-semibold';
const dark =
  'bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-40';

/**
 * How Paystack pays this merchant: their sub-account (recorded by Finance,
 * switched on by a second Finance person), the orders it split, and the
 * refunds Finance decides who carries. Commission itself is on the
 * Commission card; the split uses each order's own commission.
 */
export function PaystackPayoutsCard({
  merchantId,
  overview,
}: {
  merchantId: string;
  overview: SplitOverview;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = React.useState('');
  const [schedule, setSchedule] = React.useState('auto');
  const [note, setNote] = React.useState('');

  const run = async (work: () => Promise<SubaccountResult>) => {
    setBusy(true);
    const r = await work();
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  };

  const current = overview.subaccounts.filter(
    (s) => s.status === 'active' || s.status === 'paused',
  );
  const pending = overview.subaccounts.filter((s) => s.status === 'pending');

  return (
    <Card id="paystack-payouts" className="p-5">
      <h2 className="text-[1rem] font-extrabold">Paid by Paystack</h2>
      <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
        With a sub-account switched on, Paystack splits each order as it is paid: the merchant gets
        the items less their commission (from the Commission card), and NexG keeps the rest and pays
        Paystack&apos;s fee. Without one, the merchant is paid in the payout run.
      </p>

      {current.length === 0 && pending.length === 0 && (
        <p className="mt-3 text-[0.8125rem] font-bold">No sub-account: paid in the payout run.</p>
      )}

      <ul className="mt-3 space-y-2">
        {[...current, ...pending].map((s) => (
          <SubaccountRow
            key={s.id}
            row={s}
            canRecord={overview.canRecord}
            busy={busy}
            onDecide={(approve, n) =>
              run(() => decideSubaccount(merchantId, s.id, s.code, approve, n))
            }
            onPause={(pause, n) => run(() => pauseSubaccount(merchantId, s.id, pause, n))}
          />
        ))}
      </ul>

      {overview.canRecord && pending.length === 0 && (
        <div className="border-border mt-4 rounded-lg border p-3">
          <p className="text-[0.8125rem] font-extrabold">
            {current.length > 0 ? 'Replace the sub-account' : 'Add a Paystack sub-account'}
          </p>
          <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">
            Make it in the Paystack dashboard (Settings → Subaccounts), set its payout schedule
            there, then paste its code. NexG looks it up in Paystack. Leave its percentage at 0:
            NexG sets its share on every payment.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              aria-label="Sub-account code"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="ACCT_…"
              className={`${field} w-48`}
            />
            <select
              aria-label="Payout schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className={field}
            >
              {Object.entries(SCHEDULE).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              aria-label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className={`${field} min-w-[10rem] flex-1`}
            />
            <button
              type="button"
              disabled={busy || code === ''}
              onClick={() =>
                void run(() => requestSubaccount(merchantId, { code, schedule, note }))
              }
              className={dark}
            >
              Look up and record
            </button>
          </div>
        </div>
      )}

      {overview.refundsToDecide.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[0.875rem] font-extrabold">
            Refunds to decide · {overview.refundsToDecide.length}
          </h3>
          <p className="text-muted text-[0.75rem] font-semibold">
            Paystack paid the merchant for these orders and then took the refund from NexG. Say who
            carries the merchant&apos;s part.
          </p>
          <ul className="mt-2 space-y-2">
            {overview.refundsToDecide.map((f) => (
              <RefundRow
                key={f.refundId}
                row={f}
                busy={busy}
                canRecord={overview.canRecord}
                onDecide={(method, amount, n) =>
                  run(() => decideRecovery(merchantId, f.refundId, method, amount, n))
                }
              />
            ))}
          </ul>
        </div>
      )}

      {overview.recoveries.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[0.875rem] font-extrabold">
            Refunds being recovered
            {overview.owedCents > 0 ? ` · ${kes(overview.owedCents)} still to take` : ''}
          </h3>
          <ul className="mt-2 space-y-1">
            {overview.recoveries.map((r) => (
              <RecoveryRow
                key={r.id}
                row={r}
                busy={busy}
                canRecord={overview.canRecord}
                onSettle={(ref) => run(() => settleRecovery(merchantId, r.id, ref))}
              />
            ))}
          </ul>
        </div>
      )}

      {overview.orders.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[0.875rem] font-extrabold">Orders Paystack split</h3>
          <ul className="divide-border mt-2 divide-y text-[0.75rem] font-semibold">
            {overview.orders.slice(0, 10).map((o) => (
              <li key={o.orderId} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {o.reference}
                  {o.test ? ' · test' : ''} ·{' '}
                  {new Date(o.paidAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
                </span>
                <span>
                  paid {kes(o.totalCents)} · commission {kes(o.commissionCents)} · to merchant{' '}
                  {kes(o.toMerchantCents)}
                  {o.keptForRefundsCents > 0
                    ? ` (${kes(o.keptForRefundsCents)} kept for refunds)`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-[0.75rem] font-bold ${msg.ok ? 'text-success' : 'text-danger'}`}>
          {msg.text}
        </p>
      )}
    </Card>
  );
}

function SubaccountRow({
  row,
  canRecord,
  busy,
  onDecide,
  onPause,
}: {
  row: SplitOverview['subaccounts'][number];
  canRecord: boolean;
  busy: boolean;
  onDecide: (approve: boolean, note: string) => void;
  onPause: (pause: boolean, note: string) => void;
}) {
  const [note, setNote] = React.useState('');
  const d: Partial<SplitOverview['subaccounts'][number]['details']> = row.details ?? {};
  const mismatch = d.paystack_schedule && d.paystack_schedule.toLowerCase() !== row.schedule;
  return (
    <li className="border-border rounded-lg border p-3">
      <p className="text-[0.8125rem] font-extrabold">
        {row.code}
        {row.test ? ' · test' : ''} · {SCHEDULE[row.schedule] ?? row.schedule}
        <span className="text-muted ml-2 font-semibold">
          {row.status === 'pending'
            ? 'waiting for a second Finance person'
            : row.status === 'paused'
              ? 'paused: orders go to the payout run'
              : 'on'}
        </span>
      </p>
      <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">
        Paystack pays {d.business_name ?? 'the account'}
        {d.settlement_bank ? ` at ${d.settlement_bank}` : ''}
        {d.account_last4 ? ` ····${d.account_last4}` : ''}
        {row.requestedBy ? ` · recorded by ${row.requestedBy}` : ''}
        {row.decidedBy ? ` · switched on by ${row.decidedBy}` : ''}
      </p>
      {mismatch && (
        <p className="text-danger mt-0.5 text-[0.6875rem] font-bold">
          Paystack shows its schedule as {d.paystack_schedule}. Change it in the Paystack dashboard
          to match, or record the sub-account again.
        </p>
      )}
      {canRecord && (row.canDecide || row.status !== 'pending') && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={row.status === 'pending' ? 'Note (needed to turn down)' : 'Why'}
            className={`${field} min-w-[10rem] flex-1`}
          />
          {row.status === 'pending' && row.canDecide && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(true, note)}
                className={dark}
              >
                Switch on
              </button>
              <button
                type="button"
                disabled={busy || note.trim() === ''}
                onClick={() => onDecide(false, note)}
                className="border-danger text-danger rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
              >
                Turn down
              </button>
            </>
          )}
          {row.status !== 'pending' && (
            <button
              type="button"
              disabled={busy || note.trim() === ''}
              onClick={() => onPause(row.status === 'active', note)}
              className="border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
            >
              {row.status === 'active' ? 'Pause' : 'Resume'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function RefundRow({
  row,
  busy,
  canRecord,
  onDecide,
}: {
  row: SplitOverview['refundsToDecide'][number];
  busy: boolean;
  canRecord: boolean;
  onDecide: (
    method: 'paystack' | 'next_sales' | 'invoice' | 'nexg',
    amountKes: string,
    note: string,
  ) => void;
}) {
  const [amount, setAmount] = React.useState(
    (Math.floor(Math.min(row.refundCents, row.shareCents)) / 100).toFixed(2),
  );
  const [note, setNote] = React.useState('');
  return (
    <li className="border-border rounded-lg border p-3">
      <p className="text-[0.8125rem] font-extrabold">
        {row.orderReference}
        {row.test ? ' · test' : ''} · refund {kes(row.refundCents)}
        <span className="text-muted ml-2 font-semibold">
          merchant was paid {kes(row.shareCents)} for it
        </span>
      </p>
      {canRecord && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            aria-label="Merchant's part in KES"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className={`${field} w-28`}
          />
          <input
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className={`${field} min-w-[8rem] flex-1`}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide('paystack', amount, note)}
            className={dark}
          >
            Paystack took it from their sub-account
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide('next_sales', amount, note)}
            className="border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          >
            Take from next sales
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide('invoice', amount, note)}
            className="border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          >
            Invoice them
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide('nexg', amount, note)}
            className="border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          >
            NexG carries it
          </button>
        </div>
      )}
    </li>
  );
}

const RECOVERY: Record<string, string> = {
  open: 'being taken from next sales',
  recovered: 'recovered',
  invoiced: 'invoiced, not paid yet',
  settled: 'paid by the merchant',
  absorbed: 'carried by NexG',
  by_paystack: 'taken by Paystack from their sub-account',
  cancelled: 'cancelled',
};

function RecoveryRow({
  row,
  busy,
  canRecord,
  onSettle,
}: {
  row: SplitOverview['recoveries'][number];
  busy: boolean;
  canRecord: boolean;
  onSettle: (reference: string) => void;
}) {
  const [ref, setRef] = React.useState('');
  return (
    <li className="flex flex-wrap items-center gap-2 text-[0.75rem] font-semibold">
      <span>
        {row.orderReference ?? 'Order'}
        {row.test ? ' · test' : ''} · {kes(row.amountCents)} · {RECOVERY[row.state] ?? row.state}
        {row.state === 'open' ? ` (${kes(row.recoveredCents)} so far)` : ''}
      </span>
      {canRecord && row.state === 'invoiced' && (
        <>
          <input
            aria-label="Payment reference"
            value={ref}
            onChange={(e) => setRef(e.target.value.toUpperCase())}
            placeholder="Payment reference"
            className={`${field} w-40`}
          />
          <button
            type="button"
            disabled={busy || ref.trim().length < 4}
            onClick={() => onSettle(ref)}
            className={dark}
          >
            Mark paid
          </button>
        </>
      )}
    </li>
  );
}
