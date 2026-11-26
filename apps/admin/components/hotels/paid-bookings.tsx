'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Card } from '@nexg/ui';

import { cancelAndRefundStay, type CancelRefundOutcome } from '@/app/hotels/cancel-refund-actions';

import { paidVia, shortDate, type PaidBookingRow } from './paid-bookings-data';
import { DASH, EmptyRow, kes, Pill, when } from './shared';

const STATUS: Record<PaidBookingRow['status'], string> = {
  booked: 'Booked',
  in_stay: 'In stay',
};

/**
 * Paid stays NexG can cancel. The outcome is held here, not on the row: a
 * cancelled stay leaves this list as soon as the page refreshes.
 */
export function PaidBookings({ rows }: { rows: PaidBookingRow[] | null }) {
  const [notice, setNotice] = React.useState<(CancelRefundOutcome & { stay: string }) | null>(null);

  return (
    <Card className="mt-5 p-0">
      <div className="px-4 pb-3 pt-4">
        <h2 className="text-[0.9375rem] font-extrabold">Paid bookings</h2>
        <p className="text-muted mt-1 text-[0.75rem] font-semibold">
          Paid NexG stays that are booked or under way. Cancelling one here refunds the guest in
          full.
          {rows && rows.length >= 200 ? ' Showing the 200 with the latest check-in.' : ''}
        </p>
        {notice ? (
          <p
            role="status"
            className={`mt-2 text-[0.75rem] font-extrabold ${notice.ok ? 'text-ink' : 'text-danger'}`}
          >
            {notice.stay}: {notice.message}
          </p>
        ) : null}
      </div>

      {rows === null ? (
        <p className="text-danger px-4 pb-4 text-[0.75rem] font-extrabold">
          The paid bookings could not be loaded.
        </p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[52rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Stay</th>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Paid with</th>
                <th className="px-4 py-3">Cancel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.stay_id}
                  className="border-border hover:bg-bg border-b align-top last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <p className="text-[0.8125rem] font-extrabold">
                      {r.property ?? DASH} · {r.unit ?? DASH}
                    </p>
                    <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold">
                      {shortDate(r.check_in)} → {shortDate(r.check_out)} · {r.host ?? DASH}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[0.75rem] font-semibold">
                    {r.guest_first_name ?? DASH}
                  </td>
                  <td className="px-4 py-3">
                    <Pill>{STATUS[r.status] ?? r.status}</Pill>
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                    {kes(r.paid_kes)}
                    <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold">
                      {when(r.paid_at)}
                    </p>
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.6875rem] font-semibold">
                    {paidVia(r.provider, r.is_test)}
                  </td>
                  <td className="px-4 py-3">
                    <CancelAndRefund row={r} onDone={setNotice} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <EmptyRow colSpan={6}>No paid bookings to cancel.</EmptyRow>}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Asks for the reason, then confirms the amount before anything is sent. */
function CancelAndRefund({
  row,
  onDone,
}: {
  row: PaidBookingRow;
  onDone: (notice: CancelRefundOutcome & { stay: string }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const amount = kes(row.paid_kes);
  const stay = `${row.guest_first_name ?? 'Guest'} at ${row.property ?? DASH}, ${shortDate(row.check_in)}`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-strong hover:border-ink rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold"
      >
        Cancel and refund in full
      </button>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    if (
      !window.confirm(
        `Cancel the stay of ${stay} and refund ${amount} in full? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    let outcome: CancelRefundOutcome;
    try {
      outcome = await cancelAndRefundStay({ stayId: row.stay_id, reason });
    } catch {
      outcome = {
        ok: false,
        message: 'Something went wrong. Check the refunds below before doing anything else.',
      };
    }
    setBusy(false);
    onDone({ ...outcome, stay });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="w-60 space-y-2">
      <label className="block text-[0.6875rem] font-extrabold">
        Reason for cancelling
        <input
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="border-border-strong mt-1 block w-full rounded-lg border px-2.5 py-1.5 text-[0.75rem] font-semibold"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !reason.trim()}
          className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-50"
        >
          {busy ? 'Cancelling…' : `Cancel and refund ${amount}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="text-muted px-2 text-[0.75rem] font-bold"
        >
          Keep booking
        </button>
      </div>
    </form>
  );
}
