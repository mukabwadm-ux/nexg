'use client';

import { useState } from 'react';
import { BadgeCheck, Search } from 'lucide-react';

import { bookingRequest, command } from './api';
import { buttonClass, inputClass, primaryClass } from './panel';

/** What the engine answers for a booking found by its code. */
export interface CodeBooking {
  id: string;
  bookingCode: string;
  offeringName?: string;
  status: string;
  startTime?: string | null;
  endTime?: string | null;
  quantity?: number;
  customer?: { name?: string };
  paid?: boolean;
  /** Confirmed with a test payment while payments are not connected. */
  testPayment?: boolean;
  arrivedAt: string | null;
  /** A non-pass code is used once; after that only this is shown. */
  used: boolean;
  /** A pass: the code works once a day while the pass is valid. */
  pass?: boolean;
  visits?: { at: string }[];
}

const CODE = /^[A-HJKMNP-Z2-9]{6}$/;
const USABLE = new Set(['confirmed', 'accepted', 'in_progress', 'active']);
export const normaliseCode = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();

const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-KE', {
        timeZone: 'Africa/Nairobi',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

/**
 * The customer shows their booking code; the business types it here, sees
 * whose booking it is and whether it is paid, and checks them in. Typing the
 * name the customer gives is optional; when given, it must match.
 */
export function BookingCodeCheck({
  base = '/api/merchant/booking',
  disabled = false,
}: {
  base?: string;
  disabled?: boolean;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [found, setFound] = useState<CodeBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const normalised = normaliseCode(code);
  const valid = CODE.test(normalised);

  async function look() {
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await bookingRequest<CodeBooking>(`/codes/${normalised}`, {}, base));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The code could not be checked.');
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      setFound(
        await command<CodeBooking>(
          `/codes/${found.bookingCode}/arrive`,
          name.trim() ? { reservationName: name.trim() } : {},
          'POST',
          base,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The customer could not be checked in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="booking-code-check"
      className="border-border bg-surface rounded-xl border p-4 sm:p-5"
    >
      <h2 id="booking-code-check" className="text-sm font-bold">
        Check a booking code
      </h2>
      <p className="text-muted mt-1 text-xs">
        Customers show a 6-character code. Only paid bookings can be checked in.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void look();
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Booking code
          <input
            className={`${inputClass} !w-36 font-mono uppercase tracking-widest`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={9}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={code.length > 0 && !valid}
          />
        </label>
        <button type="submit" className={buttonClass} disabled={disabled || busy || !valid}>
          <Search className="h-4 w-4" aria-hidden="true" />
          Look up
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-danger mt-3 text-sm">
          {error}
        </p>
      ) : null}
      {found?.used && !found.customer ? (
        <p className="mt-3 text-sm" aria-live="polite">
          This code was already used{found.arrivedAt ? ` (${when(found.arrivedAt)})` : ''}.
        </p>
      ) : found ? (
        <div className="mt-3 space-y-2 text-sm" aria-live="polite">
          <p className="font-semibold">
            {found.customer?.name ?? 'Customer'} · {found.offeringName ?? 'Booking'}
          </p>
          <p className="text-muted">
            {[when(found.startTime), found.quantity ? `${found.quantity} ×` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p>
            {found.used && found.arrivedAt
              ? `Checked in ${when(found.arrivedAt)}. The code is now used.`
              : found.pass && found.visits?.length
                ? `Pass. Last visit ${when(found.visits[found.visits.length - 1]!.at)}.`
                : !USABLE.has(found.status)
                  ? found.status === 'held'
                    ? 'Not paid yet, so not confirmed.'
                    : `This booking is ${found.status}.`
                  : found.testPayment
                    ? 'Confirmed with a test payment: no money was collected.'
                    : found.paid
                      ? 'Paid and confirmed.'
                      : 'Confirmed.'}
          </p>
          {!found.used && USABLE.has(found.status) ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Name they give (optional)
                <input
                  className={`${inputClass} !w-56`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                className={primaryClass}
                disabled={disabled || busy}
                onClick={() => void checkIn()}
              >
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                Check in
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
