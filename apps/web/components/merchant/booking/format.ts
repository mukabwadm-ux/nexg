import type { BookingModel, BookingOffering, BookingRecord } from './types';

export const KENYA_TIMEZONE = 'Africa/Nairobi';

export const MODEL_LABELS: Record<BookingModel, string> = {
  ORDER: 'Orders',
  APPOINTMENT: 'Appointments',
  FIELD_VISIT: 'Visits',
  ASSET_INTERVAL: 'Rentals',
  TRANSFER: 'Transfers',
  SESSION_CAPACITY: 'Sessions',
  SPACE_RESERVATION: 'Table and space reservations',
  TOUR: 'Tours',
  PRODUCTION_DUE: 'Production commitments',
  REQUEST_QUOTE: 'Requests and quotes',
  LINKED_WINDOWS: 'Collection and return',
  SERVICE_JOB: 'Service jobs',
  ENTITLEMENT: 'Memberships',
  FREIGHT: 'Freight',
  STORAGE: 'Storage',
};

export const STATUS_LABELS: Record<string, string> = {
  held: 'Held',
  pending: 'Awaiting approval',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  accepted: 'Accepted',
  in_progress: 'In progress',
};

export function humanize(value: string): string {
  return value
    .replace(/^BQ_|^Q_/, '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

export function kenyaDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KENYA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

export function kenyaTime(value: string | null): string {
  if (!value) return 'No time set';
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: KENYA_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function kenyaDateLabel(value: Date | string | null, short = false): string {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: KENYA_TIMEZONE,
    weekday: short ? 'short' : 'long',
    day: 'numeric',
    month: short ? 'short' : 'long',
  }).format(new Date(value));
}

export function localDateTime(value: string | null): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KENYA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function fromKenyaInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Choose a valid date and time.');
  const instant = new Date(`${value}:00+03:00`).toISOString();
  if (localDateTime(instant) !== value) throw new Error('Choose a valid date and time.');
  return instant;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return kenyaDate(d);
}

export function addMonths(date: string, months: number): string {
  const [year, month] = date.split('-').map(Number);
  return kenyaDate(new Date(Date.UTC(year!, month! - 1 + months, 1, 9)));
}

export function weekDays(date: string): string[] {
  const d = new Date(`${date}T12:00:00+03:00`);
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: KENYA_TIMEZONE,
    weekday: 'short',
  }).format(d);
  const offset = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day);
  return Array.from({ length: 7 }, (_, i) => addDays(date, i - offset));
}

export function monthDays(date: string): string[] {
  const first = `${date.slice(0, 7)}-01`;
  const start = weekDays(first)[0]!;
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function overlapsDay(booking: BookingRecord, day: string): boolean {
  if (booking.executionMode === 'request_capture') return false;
  if (!booking.startTime || !booking.endTime) return false;
  const start = new Date(`${day}T00:00:00+03:00`).getTime();
  const end = start + 86400000;
  return new Date(booking.startTime).getTime() < end && new Date(booking.endTime).getTime() > start;
}

export function money(minor: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function offeringPriceLabel(offering: BookingOffering): string {
  const suffix =
    offering.pricingBasis === 'per_quantity'
      ? `per ${offering.capacityUnit ?? 'unit'}`
      : offering.pricingBasis === 'per_duration'
        ? `per ${offering.durationUnitMinutes ?? 60} minutes`
        : offering.pricingBasis === 'per_night'
          ? 'per night'
          : offering.pricingBasis === 'indicative'
            ? 'indicative'
            : 'per booking';
  return `${money(offering.priceMinor)} ${suffix}`;
}

export function displayQuantity(minor: number, scale = 0, unit?: string): string {
  const amount = new Intl.NumberFormat('en-KE', {
    maximumFractionDigits: Math.min(9, Math.max(0, scale)),
  }).format(minor / 10 ** scale);
  return unit ? `${amount} ${unit}` : amount;
}

export function kesInputToMinor(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error('Enter a KES amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount)) throw new Error('The amount is too large.');
  return amount;
}

export function quantityInputToMinor(value: string, scale = 0): number {
  if (!Number.isInteger(scale) || scale < 0 || scale > 9)
    throw new Error('The quantity precision is not supported.');
  const pattern = scale === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`);
  if (!pattern.test(value))
    throw new Error(`Enter a positive quantity with up to ${scale} decimal places.`);
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, '0') || 0);
  if (!Number.isSafeInteger(result) || result <= 0)
    throw new Error('Enter a valid positive quantity.');
  return result;
}
