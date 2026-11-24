'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  cancelHeldRiderPayout,
  payHeldRiderPayoutThroughPaystack,
} from '@/app/finance/paystack-transfers';

export interface RiderPayoutRow {
  id: string;
  rider_name: string | null;
  mode: string;
  is_test: boolean;
  gross_cents: number;
  cash_netted_cents: number;
  fee_cents: number;
  fee_paid_by: string;
  net_cents: number;
  state: string;
  hold_reason: string | null;
  failure_reason: string | null;
  destination: string | null;
  created_at: string;
  paid_at: string | null;
  transfer_state: string | null;
}

const kes = (cents: number) => `KES ${Math.round(cents / 100).toLocaleString('en-KE')}`;

const STATE: Record<string, string> = {
  held: 'waiting for Finance',
  sending: 'sent through Paystack, waiting for it to confirm',
  paid: 'paid',
  failed: 'failed · tried again with the next payout',
  cancelled: 'cancelled · paid with the next payout',
  rolled: 'under the minimum · carried to the next payout',
};

/**
 * Riders paid automatically (Payout rules). Those waiting for Finance come
 * first: pay through Paystack, or cancel so it goes with the next payout.
 * The rest is what went out recently, for a look.
 */
export function RiderPayouts({ rows, canDecide }: { rows: RiderPayoutRow[]; canDecide: boolean }) {
  if (rows.length === 0) return null;
  const held = rows.filter((r) => r.state === 'held');
  return (
    <section
      className={`bg-surface rounded-xl border p-4 ${held.length > 0 ? 'border-warning' : 'border-border'}`}
    >
      <h2 className="text-[0.875rem] font-extrabold">
        Riders paid automatically
        {held.length > 0 ? ` · ${held.length} waiting for Finance` : ''}
      </h2>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <Item key={r.id} row={r} canDecide={canDecide} />
        ))}
      </ul>
    </section>
  );
}

function Item({ row, canDecide }: { row: RiderPayoutRow; canDecide: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [msg, setMsg] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const settle = (r: { ok: boolean; message: string }) => {
    setMsg(r.ok ? null : r.message);
    setInfo(r.ok ? r.message : null);
    router.refresh();
  };
  const pay = async () => {
    setBusy(true);
    const r = await payHeldRiderPayoutThroughPaystack(row.id);
    setBusy(false);
    settle(r);
  };
  const cancel = async () => {
    setBusy(true);
    const r = await cancelHeldRiderPayout(row.id, note);
    setBusy(false);
    settle(r);
  };
  const amount = row.net_cents > 0 ? row.net_cents : row.gross_cents - row.cash_netted_cents;
  return (
    <li className="border-border rounded-lg border p-3">
      <p className="text-[0.8125rem] font-extrabold">
        {kes(amount)} · {row.rider_name ?? 'Rider'}
        {row.destination ? ` · to ${row.destination}` : ''}
        {row.is_test ? ' · test' : ''}
        <span className="text-muted ml-2 font-semibold">{STATE[row.state] ?? row.state}</span>
      </p>
      <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">
        {row.mode} · earned {kes(row.gross_cents)}
        {row.cash_netted_cents > 0 ? ` · cash held ${kes(row.cash_netted_cents)}` : ''}
        {row.fee_cents > 0
          ? ` · fee ${kes(row.fee_cents)} paid by ${row.fee_paid_by === 'rider' ? 'the rider' : 'NexG'}`
          : ''}
        {' · '}
        {new Date(row.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
      </p>
      {(row.hold_reason || row.failure_reason) && (
        <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">
          {row.failure_reason ?? row.hold_reason}
        </p>
      )}
      {canDecide && row.state === 'held' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void pay()}
            className="bg-gold text-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          >
            Pay through Paystack
          </button>
          <input
            aria-label="Why it is cancelled"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (to cancel)"
            className="border-border-strong min-w-[10rem] flex-1 rounded-lg border px-3 py-1.5 text-[0.75rem] font-semibold"
          />
          <button
            type="button"
            disabled={busy || note.trim() === ''}
            onClick={() => void cancel()}
            className="border-danger text-danger rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}
      {msg && <p className="text-danger mt-1 text-[0.75rem] font-semibold">{msg}</p>}
      {info && <p className="text-success mt-1 text-[0.75rem] font-semibold">{info}</p>}
    </li>
  );
}
