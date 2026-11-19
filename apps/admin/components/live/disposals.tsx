'use client';

import { Card } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { decideDisposal } from '@/app/live/actions';

export interface DisposalRow {
  id: string;
  order_reference: string;
  rider_name: string | null;
  reason: string;
  requested_at: string;
  payment_method: string;
  dropoff_label: string | null;
  photoUrl: string | null;
}

/**
 * Orders a rider could not deliver. The rider photographed disposing of it
 * and waits; approving cancels the order as disposed and ends the job,
 * rejecting tells the rider what to do instead. Refunds stay with the order.
 */
export function Disposals({ rows }: { rows: DisposalRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="border-warning mb-4 border p-4">
      <p className="text-[0.875rem] font-extrabold">
        Waiting for you: {rows.length} {rows.length === 1 ? 'order' : 'orders'} a rider could not
        deliver
      </p>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <DisposalItem key={r.id} row={r} />
        ))}
      </ul>
    </Card>
  );
}

function DisposalItem({ row }: { row: DisposalRow }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [msg, setMsg] = React.useState<string | null>(null);
  const run = async (approve: boolean) => {
    setBusy(true);
    const r = await decideDisposal(row.id, approve, note);
    setBusy(false);
    setMsg(r.ok ? null : (r.message ?? 'Refused.'));
    if (r.ok) router.refresh();
  };
  return (
    <li className="border-border rounded-lg border p-3">
      <p className="text-[0.8125rem] font-extrabold">
        {row.order_reference} · {row.rider_name ?? 'Rider'} ·{' '}
        <span className="text-muted font-semibold">
          {new Date(row.requested_at).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Nairobi',
          })}
        </span>
      </p>
      <p className="text-muted mt-1 text-[0.8125rem] font-semibold">{row.reason}</p>
      <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
        {row.dropoff_label ?? ''} · {row.payment_method.replace(/_/g, ' ')}
      </p>
      {row.photoUrl ? (
        <a href={row.photoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={row.photoUrl}
            alt={`What the rider left for ${row.order_reference}`}
            className="h-28 w-28 rounded-lg object-cover"
          />
        </a>
      ) : (
        <p className="text-danger mt-2 text-[0.75rem] font-bold">The photo could not be loaded.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          aria-label="Note to the rider"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (needed to reject)"
          className="border-border-strong min-w-[12rem] flex-1 rounded-lg border px-3 py-1.5 text-[0.75rem] font-semibold"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(true)}
          className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
        >
          Approve disposal
        </button>
        <button
          type="button"
          disabled={busy || note.trim() === ''}
          onClick={() => void run(false)}
          className="border-danger text-danger rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
        >
          Reject
        </button>
      </div>
      {msg && <p className="text-danger mt-1 text-[0.75rem] font-bold">{msg}</p>}
    </li>
  );
}
