'use client';

import { useState } from 'react';
import { fromKenyaInput, kenyaDateLabel, kenyaTime, localDateTime } from './format';
import { buttonClass, Field, inputClass, primaryClass } from './panel';
import { QuoteSummary, useBookingQuote } from './quote';
import type { BookingOffering, BookingRecord } from './types';

export function RescheduleForm({
  booking,
  offering,
  apiBase,
  customerToken,
  disabled,
  onCancel,
  onSave,
}: {
  booking: BookingRecord;
  offering?: BookingOffering;
  apiBase: string;
  customerToken?: string;
  disabled: boolean;
  onCancel: () => void;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [start, setStart] = useState(localDateTime(booking.startTime));
  const [end, setEnd] = useState(localDateTime(booking.endTime));
  const [occurrenceId, setOccurrenceId] = useState(booking.occurrenceId ?? '');
  const datedSession = booking.model === 'SESSION_CAPACITY';
  const [error, setError] = useState('');
  const estimate = useBookingQuote({
    offering,
    start,
    end,
    quantity: String(
      booking.quantity / 10 ** (booking.quantityScale ?? offering?.quantityScale ?? 0),
    ),
    apiBase,
    bookingId: booking.id,
    customerToken,
    occurrenceId: datedSession ? occurrenceId : undefined,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        try {
          void onSave({
            startTime: fromKenyaInput(start),
            endTime: fromKenyaInput(end),
            expectedVersion: booking.version,
            ...(datedSession && occurrenceId ? { occurrenceId } : {}),
            expectedTotalMinor: estimate.quote?.totalMinor,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Review the new dates.');
        }
      }}
    >
      {datedSession ? (
        <Field label="New published session">
          <select
            className={inputClass}
            value={occurrenceId}
            required
            onChange={(event) => {
              setOccurrenceId(event.target.value);
              const entry = offering?.occurrences?.find(
                (occurrence) => occurrence.id === event.target.value,
              );
              setStart(entry ? localDateTime(entry.startTime) : '');
              setEnd(entry ? localDateTime(entry.endTime) : '');
            }}
          >
            <option value="">Choose a dated session</option>
            {offering?.occurrences
              ?.filter((entry) => entry.published && Date.parse(entry.startTime) > Date.now())
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {kenyaDateLabel(entry.startTime)} · {kenyaTime(entry.startTime)}–
                  {kenyaTime(entry.endTime)}
                </option>
              ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label="New start · EAT">
            <input
              className={inputClass}
              type="datetime-local"
              value={start}
              required
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="New end · EAT">
            <input
              className={inputClass}
              type="datetime-local"
              value={end}
              min={start}
              required
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </>
      )}
      <QuoteSummary
        {...estimate}
        reservationFee={booking.acceptedReservationFee ?? offering?.reservationFee}
      />
      {!offering ? (
        <p className="text-muted text-sm">
          Changes follow the terms accepted with this booking.
          {datedSession
            ? ' Contact the merchant if the required dated session is no longer listed.'
            : ''}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <p className="text-muted text-xs leading-relaxed">
        Your original booking remains in place if the new time cannot be confirmed.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          className={primaryClass}
          disabled={
            disabled || !estimate.quote || estimate.checking || (datedSession && !occurrenceId)
          }
        >
          Confirm new time
        </button>
        <button type="button" className={buttonClass} onClick={onCancel} disabled={disabled}>
          Keep original time
        </button>
      </div>
    </form>
  );
}
