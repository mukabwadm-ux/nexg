import { money } from './format';
import type { BookingRecord } from './types';

export function PaymentSummary({ booking }: { booking: BookingRecord }) {
  const pricing = booking.pricing;
  const total = pricing?.totalDueMinor ?? booking.priceMinor;
  const paid = booking.paidMinor ?? 0;
  const dueNow = Math.max(0, (pricing?.dueNowMinor ?? 0) - paid);
  return (
    <section
      className="border-border space-y-3 rounded-lg border p-3 text-sm"
      aria-label="Booking payment record"
    >
      <h3 className="font-bold">
        {booking.paymentState === 'merchant_recorded'
          ? 'Payment recorded by merchant'
          : booking.paymentState === 'awaiting_payment'
            ? 'Awaiting payment evidence'
            : 'Payment summary'}
      </h3>
      <dl className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-3">
          <dt>Total</dt>
          <dd>{money(total)}</dd>
        </div>
        {(pricing?.reservationFeeMinor ?? 0) > 0 ? (
          <div className="flex justify-between gap-3">
            <dt>Reservation fee</dt>
            <dd>{money(pricing!.reservationFeeMinor!)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt>Collected and recorded</dt>
          <dd>{money(paid)}</dd>
        </div>
        {dueNow > 0 ? (
          <div className="flex justify-between gap-3 font-bold">
            <dt>Due before confirmation</dt>
            <dd>{money(dueNow)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt>Outstanding balance</dt>
          <dd>{money(Math.max(0, total - paid))}</dd>
        </div>
      </dl>
      {(booking.refundedMinor ?? 0) > 0 ? (
        <p className="text-muted text-xs">
          Actual refund recorded by merchant: {money(booking.refundedMinor!)}.
        </p>
      ) : null}
      {booking.paymentState === 'awaiting_payment' &&
      ['held', 'pending'].includes(booking.status) ? (
        <p className="text-muted text-xs leading-relaxed">
          Arrange payment with the merchant. Payment evidence and confirmation are separate steps.
          {booking.status === 'held' ? ' The time is reserved only until the hold expires.' : ''}
        </p>
      ) : null}
      {booking.paymentState === 'merchant_recorded' ? (
        <p className="text-muted text-xs leading-relaxed">
          The merchant has recorded collection evidence. This is a merchant record, rather than an
          automatic payment-provider verification.
        </p>
      ) : null}
      {booking.acceptedReservationFee?.refundTerms ? (
        <p className="text-muted whitespace-pre-wrap text-xs leading-relaxed">
          <strong>Accepted refund terms:</strong> {booking.acceptedReservationFee.refundTerms}
        </p>
      ) : null}
    </section>
  );
}
