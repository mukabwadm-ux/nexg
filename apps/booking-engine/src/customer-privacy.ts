import { randomInt } from 'node:crypto';
import { BookingError, type Identity } from './types.js';

/*
 * Customers and the booking engine (decided 19 Nov 2026).
 *
 * Supabase is the identity system. The engine keeps no contact details for a
 * customer booking. It keeps, the way Stripe and Square keep a customer id
 * beside a payment or booking:
 *   - `ref`: an opaque customer reference the signed bridge supplies
 *     (`account_<supabase uid>`, `app_guest_<supabase uid>`, or the website's
 *     cookie guest `guest_<random>`). It is never read from the request body.
 *   - `name`: the name the customer reserves under, as they typed it.
 * and, on the booking, a short booking code (like an airline record locator)
 * that the customer shows at the shop.
 *
 * Erasure (an account deleted on NexG) reaches the engine as "forget this
 * reference": the name is replaced and the reference removed.
 */

/** 31 characters: no 0/O, 1/I/L, so a code read aloud or off a screen is unambiguous. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const BOOKING_CODE_LENGTH = 6;

export function newBookingCode(): string {
  let code = '';
  for (let i = 0; i < BOOKING_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Uppercase, spaces and dashes removed. Null if it cannot be a booking code. */
export function normalizeBookingCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  return code.length === BOOKING_CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))
    ? code
    : null;
}

/** The name a customer reserves under. */
export function reservationName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80)
    throw new BookingError(
      422,
      'Add the name to reserve under (up to 80 characters).',
      'reservation_name_required',
    );
  return value.trim().replace(/\s+/g, ' ');
}

/** Loose comparison for a name given at the counter: case, spaces and accents ignored. */
export function sameReservationName(a: unknown, b: unknown): boolean {
  const fold = (v: unknown) =>
    typeof v === 'string'
      ? v
          .normalize('NFKD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
      : '';
  const x = fold(a),
    y = fold(b);
  return x.length > 0 && x === y;
}

export const CUSTOMER_REF = /^(account|app_guest)_[0-9a-f-]{36}$|^guest_[A-Za-z0-9_-]{43}$/;

/** The customer record a customer (public) booking stores: reference and name only. */
export function customerRecord(identity: Identity, name: unknown) {
  return { ref: identity.userId, name: reservationName(name) };
}

/**
 * Payload Reserve insists on an email or phone for a guest reservation. A
 * customer booking gets this undeliverable placeholder (the .invalid name is
 * reserved and never resolves): it names the booking, not the person.
 */
export const placeholderEmail = (bookingId: string) => `booking-${bookingId}@guest.nexg.invalid`;

export const ERASED_NAME = 'Removed at the customer’s request';

/** A booking's personal fields with the customer forgotten. */
export function forgottenFields(n: Record<string, any>, at: string): Record<string, any> {
  return {
    ...n,
    customer: { name: ERASED_NAME, erasedAt: at },
    notes: n.notes ? '' : n.notes,
    customerLocation: n.customerLocation
      ? { area: n.customerLocation.area, address: ERASED_NAME }
      : n.customerLocation,
    trip: n.trip
      ? {
          ...n.trip,
          pickupAddress: n.trip.pickupAddress ? ERASED_NAME : n.trip.pickupAddress,
          dropoffAddress: n.trip.dropoffAddress ? ERASED_NAME : n.trip.dropoffAddress,
        }
      : n.trip,
  };
}

/** Bridge identities allowed to settle payments and forget customers. */
export function requirePlatform(identity: Identity) {
  if (identity.role !== 'platform')
    throw new BookingError(403, 'Only the NexG platform may do this.', 'forbidden');
}

/** Every customer booking is paid before it is confirmed. */
export const PREPAID_POLICY = 'NEXG_PREPAID_V1';
/** How long a customer has to pay before the held time is released. */
export const PREPAID_HOLD_MINUTES = 15;
