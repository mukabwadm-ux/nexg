'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { payEarlyThroughPaystack } from '@/app/finance/paystack-transfers';
import { decideEarlyPayout } from '@/app/finance/settlements/actions';

export interface EarlyPayoutRow {
  id: string;
  rider_name: string | null;
  rider_phone: string | null;
  amount_kes: number;
  reason: string | null;
  payout_msisdn: string;
  status: string;
  requested_at: string;
  payout_msisdn_changed_at: string | null;
  /** The latest Paystack transfer for this request, if one was sent. */
  transfer_state?: string | null;
  transfer_failure?: string | null;
}

/**
 * Riders' special requests to be paid before the weekly run. Approve, then
 * pay through Paystack (paid once Paystack confirms), or pay by M-Pesa and
 * record the reference; the next weekly run takes it off either way.
 */
export function EarlyPayouts({ rows, canDecide }: { rows: EarlyPayoutRow[]; canDecide: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section className="border-warning bg-surface rounded-xl border p-4">
      <h2 className="text-[0.875rem] font-extrabold">
        Early payout requests · {rows.length} waiting
      </h2>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <Item key={r.id} row={r} canDecide={canDecide} />
        ))}
      </ul>
    </section>
  );
}

function Item({ row, canDecide }: { row: EarlyPayoutRow; canDecide: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [ref, setRef] = React.useState('');
  const [msg, setMsg] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const sending =
    row.transfer_state === 'opened' ||
    row.transfer_state === 'pending' ||
    row.transfer_state === 'otp';
  const payByPaystack = async () => {
    setBusy(true);
    const r = await payEarlyThroughPaystack(row.id);
    setBusy(false);
    setMsg(r.ok ? null : r.message);
    setInfo(r.ok ? r.message : null);
    router.refresh();
  };
  const recent =
    row.payout_msisdn_changed_at !== null &&
    Date.now() - new Date(row.payout_msisdn_changed_at).getTime() < 7 * 86400000;
  const run = async (d: 'approve' | 'reject' | 'paid') => {
    setBusy(true);
    const r = await decideEarlyPayout(row.id, d, note, ref);
    setBusy(false);
    setMsg(r.ok ? null : (r.message ?? 'Refused.'));
    if (r.ok) router.refresh();
  };
  const field = 'border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-semibold';
  return (
    <li className="border-border rounded-lg border p-3">
      <p className="text-[0.8125rem] font-extrabold">
        KES {row.amount_kes.toLocaleString('en-KE')} · {row.rider_name ?? 'Rider'} · to{' '}
        {row.payout_msisdn}
        <span className="text-muted ml-2 font-semibold">
          {sending
            ? 'sent through Paystack, waiting for it to confirm'
            : row.status === 'approved'
              ? 'approved, to pay'
              : 'waiting'}
        </span>
      </p>
      {row.reason && <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">{row.reason}</p>}
      {recent && (
        <p className="text-danger mt-0.5 text-[0.6875rem] font-bold">
          The payout number changed in the last week. Call the rider on{' '}
          {row.rider_phone ?? 'the number on file'} before paying.
        </p>
      )}
      {canDecide && (
        <div className="mt-2 flex flex-wrap gap-2">
          {row.status === 'pending' ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run('approve')}
                className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
              >
                Approve
              </button>
              <input
                aria-label="Reason for the rider"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason (to reject)"
                className={`${field} min-w-[10rem] flex-1`}
              />
              <button
                type="button"
                disabled={busy || note.trim() === ''}
                onClick={() => void run('reject')}
                className="border-danger text-danger rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
              >
                Reject
              </button>
            </>
          ) : sending ? null : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void payByPaystack()}
                className="bg-gold text-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
              >
                Pay through Paystack
              </button>
              <span className="text-muted self-center text-[0.6875rem] font-semibold">or</span>
              <input
                aria-label="M-Pesa reference"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                placeholder="M-Pesa reference"
                className={`${field} w-40`}
              />
              <button
                type="button"
                disabled={busy || ref.trim().length < 6}
                onClick={() => void run('paid')}
                className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
              >
                Record as paid
              </button>
            </>
          )}
        </div>
      )}
      {row.transfer_state === 'failed' || row.transfer_state === 'reversed' ? (
        <p className="text-danger mt-1 text-[0.75rem] font-bold">
          The last Paystack payout {row.transfer_state === 'reversed' ? 'was reversed' : 'failed'}
          {row.transfer_failure ? `: ${row.transfer_failure}` : ''}. The money is the rider&apos;s again;
          try once more.
        </p>
      ) : null}
      {info && <p className="text-success mt-1 text-[0.75rem] font-bold">{info}</p>}
      {msg && <p className="text-danger mt-1 text-[0.75rem] font-bold">{msg}</p>}
    </li>
  );
}
