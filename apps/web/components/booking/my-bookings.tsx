'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  BOOKING_STATUS_LABEL,
  dateTimeLabel,
  kes,
  type MyBooking,
  nairobiDate,
  timeLabel,
} from '@/lib/booking/customer';
import { createClient } from '@/lib/supabase/client';

/** The customer's bookings, with Cancel while the business's cut-off allows it. */
export function MyBookings({ bookings }: { bookings: MyBooking[] | null }) {
  const router = useRouter();
  const db = React.useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (bookings == null) {
    return (
      <p role="alert" className="text-danger text-sm font-semibold">
        Your bookings could not be loaded. Refresh the page to try again.
      </p>
    );
  }
  if (bookings.length === 0) {
    return (
      <p className="text-muted text-sm font-semibold">
        No bookings yet.{' '}
        <Link href="/explore" className="text-ink underline">
          Find something to book
        </Link>
        .
      </p>
    );
  }

  async function cancel(b: MyBooking) {
    if (!window.confirm(`Cancel ${b.resource_name} at ${b.merchant_name ?? 'this business'}?`))
      return;
    setBusy(b.id);
    setError(null);
    const { error: e } = await db.rpc('rpc_booking_set_status', {
      p_booking_id: b.id,
      p_status: 'cancelled',
    });
    setBusy(null);
    if (e) setError(e.message);
    else router.refresh();
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="bg-danger-bg text-danger mb-3 rounded-lg px-3 py-2 text-sm font-bold"
        >
          {error}
        </p>
      )}
      <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-xl border">
        {bookings.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-extrabold">
                {b.resource_name}
                {b.merchant_name && (
                  <>
                    {' · '}
                    <Link
                      href={`/explore/${b.merchant_id}`}
                      className="underline underline-offset-2"
                    >
                      {b.merchant_name}
                    </Link>
                  </>
                )}
              </span>
              <span className="text-muted block text-[0.75rem] font-semibold">
                {dateTimeLabel(b.starts_at)} –{' '}
                {nairobiDate(new Date(b.starts_at)) === nairobiDate(new Date(b.ends_at))
                  ? timeLabel(b.ends_at)
                  : dateTimeLabel(b.ends_at)}
                {b.model === 'capacity' && b.quantity > 1 ? ` · ${b.quantity} people` : ''} ·{' '}
                {b.reference}
              </span>
              <span className="text-muted block text-[0.75rem] font-bold">
                {BOOKING_STATUS_LABEL[b.status]}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-right text-[0.875rem] font-extrabold">
                {b.total_cents == null ? 'Price on request' : kes(b.total_cents)}
              </span>
              {b.can_cancel && (
                <button
                  type="button"
                  disabled={busy === b.id}
                  onClick={() => void cancel(b)}
                  className="border-border rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-50"
                >
                  {busy === b.id ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
