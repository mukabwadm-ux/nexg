/*
 * Customer booking on the main database: what a customer sees of a bookable
 * resource, and the labels and arithmetic the store page and the booking page
 * share. The database (rpc_booking_create) prices the booking; the estimate
 * here only previews the same rule.
 */

export const BOOKING_TIME_ZONE = 'Africa/Nairobi';

/** The bookable_resource columns a customer may see. */
export const PUBLIC_RESOURCE_COLUMNS =
  'id, merchant_id, model, kind, name, description, price_cents, price_unit, quote_required, capacity, duration_minutes, min_notice_minutes, max_advance_days, cancel_cutoff_minutes, instant_confirm';

export interface PublicResource {
  id: string;
  merchant_id: string;
  model: 'exclusive' | 'capacity';
  kind: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  price_unit: 'booking' | 'seat' | 'hour' | 'day';
  quote_required: boolean;
  capacity: number;
  duration_minutes: number | null;
  min_notice_minutes: number;
  max_advance_days: number;
  cancel_cutoff_minutes: number;
  instant_confirm: boolean;
}

export interface MyBooking {
  id: string;
  reference: string;
  starts_at: string;
  ends_at: string;
  quantity: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'blocked';
  total_cents: number | null;
  resource_name: string;
  model: 'exclusive' | 'capacity';
  merchant_id: string;
  merchant_name: string | null;
  can_cancel: boolean;
}

export const BOOKING_STATUS_LABEL: Record<MyBooking['status'], string> = {
  pending: 'Waiting for the business to confirm',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'Missed',
  blocked: 'Blocked',
};

export const kes = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;

const UNIT: Record<PublicResource['price_unit'], string> = {
  booking: '',
  seat: ' per person',
  hour: ' per hour',
  day: ' per day',
};

export function priceLabel(
  r: Pick<PublicResource, 'price_cents' | 'price_unit' | 'quote_required'>,
) {
  if (r.quote_required || r.price_cents == null) return 'Price on request';
  return `${kes(r.price_cents)}${UNIT[r.price_unit]}`;
}

export function durationLabel(minutes: number | null) {
  if (!minutes) return null;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [
    days ? `${days} day${days === 1 ? '' : 's'}` : '',
    hours ? `${hours} hr` : '',
    mins ? `${mins} min` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * How the customer chooses the length: fixed by the resource, or a number of
 * hours or days when the resource has no set duration.
 */
export function lengthChoice(r: Pick<PublicResource, 'duration_minutes' | 'price_unit'>) {
  if (r.duration_minutes) return { kind: 'fixed' as const, minutes: r.duration_minutes };
  return r.price_unit === 'day'
    ? { kind: 'days' as const, options: Array.from({ length: 30 }, (_, i) => i + 1) }
    : { kind: 'hours' as const, options: Array.from({ length: 12 }, (_, i) => i + 1) };
}

/** The same rule rpc_booking_create applies; null when the price is on request. */
export function estimateCents(
  r: Pick<PublicResource, 'price_cents' | 'price_unit' | 'quote_required'>,
  minutes: number,
  quantity = 1,
) {
  if (r.quote_required || r.price_cents == null) return null;
  switch (r.price_unit) {
    case 'seat':
      return r.price_cents * quantity;
    case 'hour':
      return Math.ceil(minutes / 60) * r.price_cents;
    case 'day':
      return Math.ceil(minutes / 1440) * r.price_cents;
    default:
      return r.price_cents;
  }
}

/** Today's date in Nairobi as YYYY-MM-DD, plus a number of days. */
export function nairobiDate(now: Date, plusDays = 0) {
  const d = new Date(now.getTime() + plusDays * 864e5);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BOOKING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-KE', {
    timeZone: BOOKING_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });

export const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    timeZone: BOOKING_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Turn a database error into something a customer can act on. */
export function bookingErrorMessage(message: string) {
  if (/already taken/i.test(message)) return 'Someone has just booked that time. Pick another one.';
  if (/seats left/i.test(message))
    return message.replace(/\(.*\)/, '').trim() + '. Try fewer people or another session.';
  return message;
}
