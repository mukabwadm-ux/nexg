import { BookingError } from './types.js';
/** Parse exact offset-bearing instants; Date.parse alone normalizes impossible dates. */
export function parseBookingInstant(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new BookingError(422, 'Use an exact date and time with its time offset.', 'invalid_time');
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10)),
    date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    throw new BookingError(422, 'Choose a valid calendar date and time.', 'invalid_time');
  return Date.parse(value);
}
