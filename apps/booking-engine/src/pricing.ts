import { BookingError } from './types.js';
const EAT = 3 * 60 * 60 * 1000;
function integer(v: unknown, name: string, min = 0, max = 1e9): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw new BookingError(422, `${name} must be an exact integer in range.`, 'invalid_input');
  return v;
}
export function calculateBookingPrice(
  n: Record<string, any>,
  start: number | null,
  end: number | null,
  quantity: number,
) {
  const basis = n.pricingBasis ?? 'per_booking',
    unitPriceMinor = integer(n.priceMinor, 'Unit price'),
    minimum = integer(n.minimumBillableUnits ?? 1, 'Minimum billable units', 1);
  let units = 1;
  if (basis === 'per_quantity') units = quantity;
  if (basis === 'per_duration') {
    if (start === null || end === null)
      throw new BookingError(
        422,
        'This price needs an exact booking period.',
        'pricing_period_required',
      );
    units = Math.max(
      minimum,
      Math.ceil(
        (end - start) / (integer(n.durationUnitMinutes, 'Billing duration unit', 1) * 60000),
      ),
    );
  }
  if (basis === 'per_night') {
    if (start === null || end === null)
      throw new BookingError(
        422,
        'Nightly pricing requires check-in and check-out dates.',
        'pricing_period_required',
      );
    units = Math.floor((end + EAT) / 86400000) - Math.floor((start + EAT) / 86400000);
    if (units < 1)
      throw new BookingError(
        422,
        'Nightly pricing requires at least one overnight stay.',
        'invalid_nights',
      );
    units = Math.max(minimum, units);
  }
  const quantityScale = integer(n.quantityScale ?? 0, 'Quantity scale', 0, 6);
  const denominator = basis === 'per_quantity' ? 10n ** BigInt(quantityScale) : 1n;
  const numerator = BigInt(unitPriceMinor) * BigInt(units);
  const totalMinor = Number((numerator + denominator - 1n) / denominator);
  if (basis === 'per_quantity') units = quantity / 10 ** quantityScale;
  if (!Number.isSafeInteger(totalMinor))
    throw new BookingError(
      422,
      'The calculated total exceeds the supported money range.',
      'price_overflow',
    );
  const fee = n.reservationFee ?? {
    mode: 'no_fee',
    treatment: 'credited_to_total',
    requiredBeforeConfirmation: false,
    refundTerms: 'No reservation fee.',
  };
  let reservationFeeMinor =
    fee.mode === 'fixed'
      ? integer(fee.amountMinor, 'Reservation fee')
      : fee.mode === 'percentage'
        ? Number(
            (BigInt(totalMinor) * BigInt(integer(fee.percentageBps, 'Fee percentage', 0, 10000)) +
              9999n) /
              10000n,
          )
        : 0;
  if (fee.treatment === 'credited_to_total' && reservationFeeMinor > totalMinor)
    throw new BookingError(
      422,
      'A credited reservation fee cannot exceed the service total.',
      'invalid_fee',
    );
  const totalDueMinor =
      totalMinor + (fee.treatment === 'applied_in_addition' ? reservationFeeMinor : 0),
    dueNowMinor = fee.requiredBeforeConfirmation ? reservationFeeMinor : 0;
  if (!Number.isSafeInteger(totalDueMinor))
    throw new BookingError(422, 'The total exceeds the supported range.', 'price_overflow');
  return {
    basis,
    unitPriceMinor,
    units,
    quantityScale,
    totalMinor: totalDueMinor,
    serviceSubtotalMinor: totalMinor,
    reservationFeeMinor,
    totalDueMinor,
    dueNowMinor,
    balanceMinor: totalDueMinor - dueNowMinor,
    currency: 'KES',
    indicative: basis === 'indicative',
    rounding: basis === 'per_duration' ? 'ceil' : undefined,
  };
}
