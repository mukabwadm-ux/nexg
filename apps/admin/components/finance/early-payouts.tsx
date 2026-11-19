'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

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
}

/**
 * Riders' special requests to be paid before the weekly run. Approve, then
 * pay by M-Pesa and record the reference; the next weekly run takes it off.
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
          {row.status === 'approved' ? 'approved, to pay' : 'waiting'}
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
          ) : (
            <>
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
      {msg && <p className="text-danger mt-1 text-[0.75rem] font-bold">{msg}</p>}
    </li>
  );
}
