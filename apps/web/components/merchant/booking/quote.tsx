'use client';

import { useEffect, useState } from 'react';

import { bookingRequest } from './api';
import { fromKenyaInput, money, quantityInputToMinor } from './format';
import type { BookingOffering, BookingQuote, ReservationFee } from './types';
import type { SpecialistBookingInput } from '@nexg/booking-config/specialists';

export function useBookingQuote({
  offering,
  start,
  end,
  quantity,
  apiBase,
  bookingId,
  customerToken,
  occurrenceId,
  specialist,
}: {
  offering?: BookingOffering;
  start: string;
  end: string;
  quantity: string;
  apiBase: string;
  bookingId?: string;
  customerToken?: string;
  occurrenceId?: string;
  specialist?: SpecialistBookingInput | null;
}) {
  const [result, setResult] = useState<{ key: string; quote: BookingQuote } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  let body: {
    offeringId?: string;
    startTime?: string;
    endTime?: string;
    quantity?: number;
    occurrenceId?: string;
    specialist?: SpecialistBookingInput;
  } | null = null;
  const requestOnly =
    offering?.executionMode === 'request_capture' ||
    (offering &&
      [
        'ORDER',
        'REQUEST_QUOTE',
        'ENTITLEMENT',
        'PRODUCTION_DUE',
        'SERVICE_JOB',
        'FREIGHT',
      ].includes(offering.model));
  const pricedInterval =
    offering?.executionMode !== 'request_capture' &&
    ['per_duration', 'per_night'].includes(offering?.pricingBasis ?? '');
  const nativeSpecialist =
    !bookingId && offering?.executionMode === 'native_workflow' && !!offering.specialist;
  const needsStart = !nativeSpecialist && (!!bookingId || !requestOnly || pricedInterval);
  const needsEnd =
    !nativeSpecialist &&
    (!!bookingId ||
      pricedInterval ||
      (offering &&
        !requestOnly &&
        ['ASSET_INTERVAL', 'STORAGE', 'SESSION_CAPACITY'].includes(offering.model)));
  try {
    if (
      (bookingId || offering) &&
      (!nativeSpecialist || specialist) &&
      (!needsStart || start) &&
      (!needsEnd || end)
    ) {
      body = {
        ...(!bookingId && offering
          ? {
              offeringId: offering.id,
              quantity: quantityInputToMinor(quantity, offering.quantityScale ?? 0),
            }
          : {}),
        ...(!nativeSpecialist && start ? { startTime: fromKenyaInput(start) } : {}),
        ...(!nativeSpecialist && end ? { endTime: fromKenyaInput(end) } : {}),
        ...(nativeSpecialist && specialist ? { specialist } : {}),
        ...(occurrenceId ? { occurrenceId } : {}),
      };
    }
  } catch {
    /* Native form validation and the booking action show invalid input. */
  }
  const endpoint = bookingId ? `/bookings/${encodeURIComponent(bookingId)}/quote` : '/quote';
  const payload = body ? JSON.stringify(body) : '';
  const key = payload ? JSON.stringify([apiBase, endpoint, payload]) : '';

  useEffect(() => {
    let current = true;
    setError('');
    if (!key) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      void bookingRequest<BookingQuote>(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(customerToken ? { 'x-booking-customer-token': customerToken } : {}),
          },
          body: payload,
        },
        apiBase,
      )
        .then((quote) => {
          if (current) setResult({ key, quote });
        })
        .catch((e) => {
          if (current) setError(e instanceof Error ? e.message : 'The price could not be checked.');
        })
        .finally(() => {
          if (current) setChecking(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key, payload, endpoint, apiBase, customerToken]);

  return { quote: result?.key === key ? result.quote : null, checking, error };
}

export function QuoteSummary({
  quote,
  checking,
  error,
  reservationFee,
}: {
  quote: BookingQuote | null;
  checking: boolean;
  error: string;
  reservationFee?: Partial<ReservationFee>;
}) {
  return (
    <div className="border-border space-y-2 rounded-lg border p-3 text-sm" aria-live="polite">
      <p className="flex justify-between gap-3 font-bold">
        <span>
          {quote?.indicative || quote?.binding === false ? 'Estimated total' : 'Booking total'}
        </span>
        <span>
          {checking
            ? 'Checking…'
            : quote
              ? money(quote.totalDueMinor ?? quote.totalMinor)
              : 'Choose the booking details'}
        </span>
      </p>
      {quote && quote.basis !== 'per_booking' && quote.basis !== 'indicative' ? (
        <p className="text-muted text-xs">
          {quote.units} {quote.basis === 'per_night' ? 'night(s)' : 'billable unit(s)'} ×{' '}
          {money(quote.unitPriceMinor)}
          {quote.rounding === 'ceil' ? ' · Started units are rounded up' : ''}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger text-xs leading-relaxed">
          {error}
        </p>
      ) : null}
      {quote?.sourceRequired ? (
        <p className="text-muted text-xs leading-relaxed">
          Final price and availability need confirmation from the business’s booking system. This
          estimate does not confirm a reservation or payment.
        </p>
      ) : null}
      {quote && (quote.reservationFeeMinor ?? 0) > 0 ? (
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between gap-3">
            <dt>Service subtotal</dt>
            <dd>{money(quote.serviceSubtotalMinor ?? quote.totalMinor)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>
              Reservation fee{' '}
              {reservationFee?.treatment === 'credited_to_total'
                ? '(counts toward total)'
                : '(additional)'}
            </dt>
            <dd>{money(quote.reservationFeeMinor!)}</dd>
          </div>
          <div className="flex justify-between gap-3 font-bold">
            <dt>Due before confirmation</dt>
            <dd>{money(quote.dueNowMinor ?? 0)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Remaining balance after fee</dt>
            <dd>{money(quote.balanceMinor ?? 0)}</dd>
          </div>
        </dl>
      ) : null}
      <p className="text-muted text-xs leading-relaxed">
        {(quote?.dueNowMinor ?? 0) > 0
          ? 'Arrange the reservation payment with the merchant. The booking remains on hold until payment evidence is recorded and the merchant confirms it.'
          : 'No online prepayment is collected. Payment is arranged with the merchant.'}{' '}
        Changes and cancellation before the start follow the merchant’s policy and available
        capacity.
        {quote?.indicative
          ? ' The merchant agrees the scope and final price before work begins.'
          : ''}
      </p>
      {reservationFee?.refundTerms ? (
        <p className="text-muted whitespace-pre-wrap text-xs leading-relaxed">
          <strong>Refund and cancellation terms:</strong> {reservationFee.refundTerms}
        </p>
      ) : null}
    </div>
  );
}
