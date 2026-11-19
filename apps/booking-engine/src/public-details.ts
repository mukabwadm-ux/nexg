import { BookingError } from './types.js';

/*
 * What a customer needs to choose before booking, beyond one price per
 * offering: ticket types, rental terms and a quote's expected range. Pass plans
 * come from an ENTITLEMENT offering's typed setup and departures from its
 * published occurrences; this file only shapes them for the public catalogue.
 */

export interface TicketType {
  id: string;
  name: string;
  priceMinor: number;
  description?: string;
  maxPerBooking?: number;
}
export interface RentalTerms {
  depositMinor?: number;
  minimumUnits?: number;
  includedDistanceKm?: number;
  pickupNote?: string;
  terms: string;
}
export interface QuoteRange {
  minMinor: number;
  maxMinor: number;
  note?: string;
}

const RENTAL_MODELS = new Set(['ASSET_INTERVAL', 'STORAGE', 'TRANSFER']);
const TICKET_MODELS = new Set(['SESSION_CAPACITY', 'TOUR', 'SPACE_RESERVATION', 'APPOINTMENT']);
const QUOTE_MODELS = new Set([
  'REQUEST_QUOTE',
  'ORDER',
  'PRODUCTION_DUE',
  'SERVICE_JOB',
  'FREIGHT',
  'LINKED_WINDOWS',
]);

const bad = (message: string) => new BookingError(422, message, 'invalid_public_details');
const money = (v: unknown, name: string) => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > 1e11)
    throw bad(`${name} must be a whole amount in KES cents.`);
  return v;
};
const words = (v: unknown, name: string, max: number, required = false) => {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${name} is required.`);
    return undefined;
  }
  if (typeof v !== 'string' || v.trim().length > max)
    throw bad(`${name} must be text of at most ${max} characters.`);
  return v.trim() || undefined;
};
const whole = (v: unknown, name: string, min: number, max: number) => {
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw bad(`${name} must be a whole number from ${min} to ${max}.`);
  return v;
};

/** Validates the three optional detail fields of an offering, for its model. */
export function normalizePublicDetails(model: string, input: Record<string, any>) {
  const out: { ticketTypes?: TicketType[]; rentalTerms?: RentalTerms; quoteRange?: QuoteRange } =
    {};
  if (input.ticketTypes !== undefined && input.ticketTypes !== null) {
    if (!TICKET_MODELS.has(model))
      throw bad('Ticket types are for dated sessions, tours or spaces.');
    if (!Array.isArray(input.ticketTypes) || input.ticketTypes.length > 20)
      throw bad('List up to 20 ticket types.');
    const ids = new Set<string>();
    out.ticketTypes = input.ticketTypes.map((t: any, i: number) => {
      const id = words(t?.id, `Ticket type ${i + 1} id`, 40, true)!;
      if (!/^[a-z0-9_-]+$/.test(id) || ids.has(id))
        throw bad('Each ticket type needs its own short id (a-z, 0-9, - or _).');
      ids.add(id);
      return {
        id,
        name: words(t?.name, `Ticket type ${i + 1} name`, 80, true)!,
        priceMinor: money(t?.priceMinor, `Ticket type ${i + 1} price`),
        description: words(t?.description, 'Ticket type description', 300),
        maxPerBooking: whole(t?.maxPerBooking, 'Tickets per booking', 1, 100),
      };
    });
    if (!out.ticketTypes!.length) delete out.ticketTypes;
  }
  if (input.rentalTerms !== undefined && input.rentalTerms !== null) {
    if (!RENTAL_MODELS.has(model)) throw bad('Rental terms are for rentals, storage or transfers.');
    const r = input.rentalTerms;
    out.rentalTerms = {
      depositMinor: r.depositMinor === undefined ? undefined : money(r.depositMinor, 'Deposit'),
      minimumUnits: whole(r.minimumUnits, 'Minimum rental units', 1, 366),
      includedDistanceKm: whole(r.includedDistanceKm, 'Included distance', 0, 100000),
      pickupNote: words(r.pickupNote, 'Pickup note', 300),
      terms: words(r.terms, 'Rental terms', 2000, true)!,
    };
  }
  if (input.quoteRange !== undefined && input.quoteRange !== null) {
    if (!QUOTE_MODELS.has(model)) throw bad('A quote range is for requests priced on request.');
    const q = input.quoteRange;
    const minMinor = money(q.minMinor, 'Lowest expected price'),
      maxMinor = money(q.maxMinor, 'Highest expected price');
    if (maxMinor < minMinor) throw bad('The highest expected price must not be below the lowest.');
    out.quoteRange = { minMinor, maxMinor, note: words(q.note, 'Quote note', 300) };
  }
  return out;
}

/** The ticket type a booking chose, required when the offering has any. */
export function chosenTicketType(n: Record<string, any>, ticketTypeId: unknown) {
  const types: TicketType[] = Array.isArray(n.ticketTypes) ? n.ticketTypes : [];
  if (!types.length) {
    if (ticketTypeId !== undefined && ticketTypeId !== null)
      throw new BookingError(422, 'This offering has no ticket types.', 'invalid_ticket_type');
    return undefined;
  }
  const found = types.find((t) => t.id === ticketTypeId);
  if (!found) throw new BookingError(422, 'Choose a ticket type.', 'ticket_type_required');
  return found;
}

/** The offering's pricing fields with the chosen ticket type's price. */
export function pricedFor<T extends Record<string, any>>(service: T, ticket?: TicketType): T {
  if (!ticket) return service;
  return { ...service, nexg: { ...service.nexg, priceMinor: ticket.priceMinor } };
}

/** Public shape of a pass plan, from an ENTITLEMENT offering. */
export function passPlanView(n: Record<string, any>) {
  const s = n.specialistSetup;
  if (n.model !== 'ENTITLEMENT' || !s || s.model !== 'ENTITLEMENT') return undefined;
  return {
    planId: s.planId,
    planVersion: s.planVersion,
    priceMinor: n.priceMinor,
    validity: s.validity,
    credits: s.credits,
    renewal: s.renewal,
    scopeOfferingIds: s.scopeOfferingIds,
  };
}

export function publicDetailsView(n: Record<string, any>) {
  return {
    ticketTypes: Array.isArray(n.ticketTypes)
      ? n.ticketTypes.map((t: TicketType) => ({
          id: t.id,
          name: t.name,
          priceMinor: t.priceMinor,
          description: t.description,
          maxPerBooking: t.maxPerBooking,
        }))
      : undefined,
    rentalTerms: n.rentalTerms ?? undefined,
    quoteRange: n.quoteRange ?? undefined,
    passPlan: passPlanView(n),
  };
}
