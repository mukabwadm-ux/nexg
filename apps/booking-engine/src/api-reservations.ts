/**
 * Reservations as NexG's public API shows them to the business that owns them
 * (GET /v1/reservations on api.nexgapp.com), and the summary its webhook
 * events carry.
 *
 * Built from the merchant view (BookingEngine.bookingView), so nothing that
 * view hides (the customer's token, booking code and reference, the accepted
 * configuration) can reach the API. On top of that only named fields are
 * copied: a new field on a booking stays inside the engine until it is added
 * here on purpose.
 *
 * - No contact details. A customer booking keeps none (owner, 19 Nov 2026),
 *   and a booking the business entered itself already has them there.
 * - The status is one of the API's five words (requested, confirmed,
 *   in_progress, completed, cancelled); `stage` keeps the engine's own word.
 * - The event summary leaves out the guest's name, the trip's addresses and
 *   the notes: events are stored by NexG for 30 days, so a system reads those
 *   with GET /v1/reservations/{id} instead.
 */
import { BookingError } from './types.js';

type Doc = Record<string, any>;

export type ApiStatus = 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface ApiReservationSummary {
  id: string;
  /** A reservation holds time or capacity; a request waits for the business to accept it. */
  kind: 'reservation' | 'request';
  status: ApiStatus;
  stage: string;
  offering: { id: string | null; name: string | null; model: string | null };
  starts_at: string | null;
  ends_at: string | null;
  quantity: number | null;
  payment_state: string | null;
  version: number;
  updated_at: string | null;
}

export interface ApiReservation extends ApiReservationSummary {
  occurrence_id: string | null;
  resource_ids: string[];
  ticket_type: { id: string; name: string | null } | null;
  capacity_unit: string | null;
  guest_name: string | null;
  trip: {
    pickup_area: string | null;
    pickup_address: string | null;
    dropoff_area: string | null;
    dropoff_address: string | null;
  } | null;
  service_location: { area: string | null; address: string | null } | null;
  notes: string | null;
  currency: 'KES';
  total_cents: number | null;
  paid_cents: number;
  checked_in_at: string | null;
  /** nexg: the customer booked on NexG. merchant: the business entered it. */
  booked_on: 'nexg' | 'merchant';
  created_at: string | null;
}

const CANCELLED = new Set([
  'cancelled',
  'expired',
  'no-show',
  'no_show',
  'declined',
  'rejected',
  'withdrawn',
]);

/** The API's word for a booking, from the merchant view's status and work state. */
export function apiStatus(view: Doc): ApiStatus {
  const stage = String(view.status ?? '');
  if (CANCELLED.has(stage)) return 'cancelled';
  if (stage === 'completed' || view.workState === 'completed' || view.custodyState === 'released')
    return 'completed';
  if (stage === 'in_progress' || view.workState === 'in_progress' || view.custodyState === 'in_use')
    return 'in_progress';
  if (['confirmed', 'accepted', 'active'].includes(stage) || view.workState === 'accepted')
    return view.arrivedAt ? 'in_progress' : 'confirmed';
  return 'requested';
}

function text(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : null;
}

function instant(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const at = Date.parse(String(value instanceof Date ? value.toISOString() : value));
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** One reservation for the API, from the merchant view and its stored record. */
export function apiReservation(
  view: Doc,
  doc: Doc,
  collection: 'reservations' | 'booking-requests',
): ApiReservation {
  const trip = view.trip && typeof view.trip === 'object' ? view.trip : null;
  const place =
    view.customerLocation && typeof view.customerLocation === 'object'
      ? view.customerLocation
      : null;
  const ticket = view.ticketType && typeof view.ticketType === 'object' ? view.ticketType : null;
  return {
    id: String(view.id),
    kind: collection === 'booking-requests' ? 'request' : 'reservation',
    status: apiStatus(view),
    stage: text(view.status, 40) ?? 'unknown',
    offering: {
      id: text(view.offeringId, 128),
      name: text(view.offeringName, 200),
      model: text(view.model, 40),
    },
    starts_at: instant(view.startTime),
    ends_at: instant(view.endTime),
    quantity: whole(view.quantity),
    payment_state: text(view.paymentState, 40),
    version: whole(view.version) ?? 1,
    updated_at: instant(doc.updatedAt),
    occurrence_id: text(view.occurrenceId, 128),
    resource_ids: Array.isArray(view.resourceIds)
      ? view.resourceIds.filter((id: unknown) => typeof id === 'string').slice(0, 50)
      : [],
    ticket_type:
      ticket && typeof ticket.id === 'string'
        ? { id: ticket.id.slice(0, 128), name: text(ticket.name, 200) }
        : null,
    capacity_unit: text(view.capacityUnit, 40),
    guest_name: text(view.customer?.name, 120),
    trip: trip
      ? {
          pickup_area: text(trip.pickupArea, 200),
          pickup_address: text(trip.pickupAddress, 500),
          dropoff_area: text(trip.dropoffArea, 200),
          dropoff_address: text(trip.dropoffAddress, 500),
        }
      : null,
    service_location: place
      ? { area: text(place.area, 200), address: text(place.address, 500) }
      : null,
    notes: text(view.notes, 2000),
    currency: 'KES',
    total_cents: whole(view.priceMinor),
    paid_cents: whole(view.paidMinor) ?? 0,
    checked_in_at: instant(view.arrivedAt),
    booked_on: doc.nexg?.bookingCode ? 'nexg' : 'merchant',
    created_at: instant(doc.createdAt),
  };
}

/** What a webhook event carries: no name, addresses or notes. */
export function apiReservationSummary(reservation: ApiReservation): ApiReservationSummary {
  const {
    id,
    kind,
    status,
    stage,
    offering,
    starts_at,
    ends_at,
    quantity,
    payment_state,
    version,
    updated_at,
  } = reservation;
  return {
    id,
    kind,
    status,
    stage,
    offering,
    starts_at,
    ends_at,
    quantity,
    payment_state,
    version,
    updated_at,
  };
}

export interface ReservationPageOptions {
  /** Only reservations changed after this instant. */
  updatedAfter?: string;
  /** The next_cursor of the previous page. */
  cursor?: string;
  limit?: number;
}

function cursorOf(item: ApiReservation): string {
  return Buffer.from(`${item.updated_at ?? ''}|${item.id}`).toString('base64url');
}

function after(item: ApiReservation, at: string, id: string): boolean {
  const mine = item.updated_at ?? '';
  return mine > at || (mine === at && item.id > id);
}

/**
 * A page of reservations, oldest change first, so a system can page forward
 * and keep the last updated_at as its bookmark.
 */
export function reservationPage(items: ApiReservation[], options: ReservationPageOptions = {}) {
  const limit = options.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new BookingError(400, 'Ask for between 1 and 100 reservations.', 'invalid_limit');
  let since: string | null = null;
  if (options.updatedAfter !== undefined) {
    since = instant(options.updatedAfter);
    if (!since)
      throw new BookingError(400, 'updated_after must be a date and time.', 'invalid_time');
  }
  let start: { at: string; id: string } | null = null;
  if (options.cursor !== undefined) {
    const decoded = Buffer.from(options.cursor, 'base64url').toString('utf8');
    const separator = decoded.lastIndexOf('|');
    if (options.cursor.length > 300 || separator < 0 || !decoded.slice(separator + 1))
      throw new BookingError(400, 'That cursor was not issued here.', 'invalid_cursor');
    start = { at: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
  }
  const sorted = items
    .filter((item) => since === null || (item.updated_at !== null && item.updated_at > since))
    .sort((a, b) =>
      (a.updated_at ?? '') === (b.updated_at ?? '')
        ? a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0
        : (a.updated_at ?? '') < (b.updated_at ?? '')
          ? -1
          : 1,
    )
    .filter((item) => start === null || after(item, start.at, start.id));
  const page = sorted.slice(0, limit);
  return {
    items: page,
    next_cursor: sorted.length > limit ? cursorOf(page[page.length - 1]!) : null,
  };
}
