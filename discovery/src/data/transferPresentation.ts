import type { CatalogItem, DiscoveryProvider, Merchant } from '../providers/DiscoveryProvider';
import type { TransferTrip } from '../components/cards/RentalTripPanel';
import { shortDate } from '../lib/calendar';
import { formatPrice } from '../lib/formatPrice';
import { fold, ruleSection, sectionScheme, type SectionScheme } from './catalogSections';
import { transferDirection, type TransferDirection } from './offeringKinds';

/*
 * Airport transfers, trip first (owner, 8 Nov 2026): pickup, drop-off, date, time, travellers and bags, then the
 * vehicles that match across every operator. Meet & greet is a tick box, not its own browse path. Vehicle classes
 * come from the "transfers" scheme in CATALOG_SECTIONS_V1.json (catalogSections.ts); the catalogue holds no seats,
 * bags, luggage, duration or vehicle model, so nothing here claims them. Plain TypeScript with no browser code, so
 * the Expo app can reuse it.
 */

export const TRANSFER_CATEGORY_ID = 'airport-transfers';
/** The Stepper limits the ride questions share (RentalTripPanel, the item sheet). */
export const MAX_TRAVELLERS = 20;
export const MAX_BAGS = 20;

/* Airports ---------------------------------------------------------------------------------------------------- */

export type AirportChoice = 'jkia' | 'wilson' | 'other';
export interface Airport { id: Exclude<AirportChoice, 'other'>; name: string; short: string; label: string }
/** Nairobi's two airports; anything else is typed in. `name` goes on the request, `label` in the field. */
export const AIRPORTS: readonly Airport[] = [
  { id: 'jkia', name: 'Jomo Kenyatta International Airport (JKIA)', short: 'JKIA', label: 'Jomo Kenyatta (JKIA)' },
  { id: 'wilson', name: 'Wilson Airport', short: 'Wilson Airport', label: 'Wilson Airport' },
];
export const OTHER_AIRPORT_LABEL = 'Other airport';

/** A stored or selected value as an airport choice; anything unknown is JKIA. */
export const airportChoice = (value: unknown): AirportChoice => (value === 'wilson' ? 'wilson' : value === 'other' ? 'other' : 'jkia');

/** The airport as the request names it. */
export function airportPlace(choice: AirportChoice, other: string): string {
  return AIRPORTS.find((airport) => airport.id === choice)?.name ?? other.trim();
}
/** A known airport's short name ("JKIA"); any other place as typed. */
export function shortPlace(place: string): string {
  const trimmed = place.trim();
  return AIRPORTS.find((airport) => airport.name === trimmed)?.short ?? trimmed;
}

/* The trip form ----------------------------------------------------------------------------------------------- */

/** What the trip form holds. The airport end and the other end swap sides with the direction. */
export interface TransferForm {
  direction: TransferDirection;
  airport: AirportChoice;
  otherAirport: string;
  /** The end that isn't the airport: an area, hotel or address. */
  place: string;
  date?: string;
  time: string;
  travellers: number;
  bags: number;
  /** Pickups only. */
  meetGreet: boolean;
}

/** A form from a planned ride (RentalTripPanel's TransferTrip), the airport on the side the direction says. */
export function transferForm(trip: TransferTrip, direction: TransferDirection = 'pickup'): TransferForm {
  const airportSide = (direction === 'pickup' ? trip.pickup : trip.dropoff).trim();
  const known = AIRPORTS.find((airport) => airport.name === airportSide);
  return {
    direction, airport: known?.id ?? (airportSide ? 'other' : 'jkia'), otherAirport: known ? '' : airportSide,
    place: direction === 'pickup' ? trip.dropoff : trip.pickup, date: trip.date, time: trip.time,
    travellers: trip.travellers, bags: trip.bags, meetGreet: direction === 'pickup' && trip.meetGreet,
  };
}

/** The ride the form describes, in the shape every transfer question shares (transferReady, the item sheet's `ride`). */
export function tripFromForm(form: TransferForm): TransferTrip {
  const airport = airportPlace(form.airport, form.otherAirport);
  const place = form.place.trim();
  const pickup = form.direction === 'pickup';
  return {
    pickup: pickup ? airport : place, dropoff: pickup ? place : airport, ...(form.date ? { date: form.date } : {}),
    time: form.time, travellers: form.travellers, bags: form.bags, meetGreet: pickup && form.meetGreet,
  };
}

/** The label of the end that isn't the airport: "Drop-off" on a pickup, "Pickup" on a drop-off. */
export const placeLabel = (direction: TransferDirection) => (direction === 'pickup' ? 'Drop-off' : 'Pickup');
export const airportLabel = (direction: TransferDirection) => (direction === 'pickup' ? 'Pickup' : 'Drop-off');

export type TransferField = 'airport' | 'place' | 'date' | 'time';
export type TransferErrors = Partial<Record<TransferField, string>>;

/**
 * What stops the form, field by field, in one short sentence each. `now` is the device's date ("YYYY-MM-DD") and
 * time ("HH:MM"), the clock the date picker uses. No errors means transferReady holds for tripFromForm(form).
 */
export function transferErrors(form: TransferForm, now: { today: string; time: string }): TransferErrors {
  const errors: TransferErrors = {};
  if (form.airport === 'other' && !form.otherAirport.trim()) errors.airport = 'Enter the airport.';
  if (!form.place.trim()) errors.place = `Add the ${placeLabel(form.direction).toLocaleLowerCase('en-KE')} place.`;
  if (!form.date) errors.date = 'Choose the pickup date.';
  else if (form.date < now.today) errors.date = 'Choose today or a later date.';
  if (!form.time) errors.time = 'Choose the pickup time.';
  else if (form.date === now.today && form.time <= now.time) errors.time = 'Choose a time later than now.';
  return errors;
}

/** The form fields in the order they appear, for moving focus to the first one that needs attention. */
export const transferFieldOrder: readonly TransferField[] = ['airport', 'place', 'date', 'time'];

/** The device's clock as "HH:MM", beside localDateKey's date. */
export function localTimeKey(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** The place a suggestion fills in: the catalogue's areas are Nairobi areas ("Westlands" → "Westlands, Nairobi"). */
export const placeFromArea = (area: string) => `${area.trim()}, Nairobi`;

/**
 * Areas that match what's typed, for the place field: names starting with it first, then names containing it. An
 * area already filled in exactly isn't offered again.
 */
export function placeSuggestions(areas: readonly string[], typed: string, limit = 6): string[] {
  const value = fold(typed.trim());
  const term = value.replace(/\s*,\s*nairobi$/, '').trim();
  if (!term) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const area of new Set(areas.map((entry) => entry.trim()).filter(Boolean))) {
    const name = fold(area);
    if (value === fold(placeFromArea(area))) continue;
    if (name.startsWith(term)) starts.push(area);
    else if (name.includes(term)) contains.push(area);
  }
  return [...starts, ...contains].slice(0, limit);
}

const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const whole = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
const words = (value: unknown) => (typeof value === 'string' ? value.slice(0, 120) : '');

/** A stored form, read defensively (storage can be empty, blocked or edited by hand). A date that has passed is dropped. */
export function cleanTransferForm(value: unknown, today: string): TransferForm | undefined {
  const entry = record(value);
  if (!entry) return undefined;
  const direction: TransferDirection = entry.direction === 'dropoff' ? 'dropoff' : 'pickup';
  const airport = airportChoice(entry.airport);
  const date = typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.date >= today ? entry.date : undefined;
  return {
    direction, airport, otherAirport: words(entry.otherAirport), place: words(entry.place), ...(date ? { date } : {}),
    time: typeof entry.time === 'string' && /^\d{2}:\d{2}$/.test(entry.time) ? entry.time : '',
    travellers: whole(entry.travellers, 1, MAX_TRAVELLERS, 1), bags: whole(entry.bags, 0, MAX_BAGS, 0),
    meetGreet: direction === 'pickup' && entry.meetGreet === true,
  };
}

/* Vehicle classes ---------------------------------------------------------------------------------------------- */

/** Sections of the transfers scheme that are vehicles; the others (meet & greet, chauffeur, early & late) are services. */
const VEHICLE_SECTIONS: ReadonlySet<string> = new Set(['sedans', 'suvs', 'vans', 'business', 'standard']);
const SERVICE_SECTIONS: ReadonlySet<string> = new Set(['meet-greet', 'chauffeur', 'early-late']);
/** "Standard transfers" catches every pickup and drop-off, so a merchant section named for it says nothing about the vehicle. */
const CATCH_ALL = 'standard';
export const MEET_GREET = 'meet-greet';

export interface TransferClass {
  /** The section's ID in the transfers scheme, e.g. "sedans". */
  id: string;
  /** The vocabulary's title, e.g. "SUVs & 4x4s". */
  title: string;
  kind: 'vehicle' | 'service';
  /** Display order in the scheme. */
  order: number;
}

function transferScheme(merchant: Pick<Merchant, 'subcategoryId'>): SectionScheme | undefined {
  const scheme = sectionScheme(merchant);
  return scheme?.categories.includes(TRANSFER_CATEGORY_ID) ? scheme : undefined;
}

function classOf(scheme: SectionScheme, sectionId: string | undefined): TransferClass | undefined {
  if (!sectionId?.startsWith(`${scheme.id}:`)) return undefined;
  const id = sectionId.slice(scheme.id.length + 1);
  const kind = VEHICLE_SECTIONS.has(id) ? 'vehicle' : SERVICE_SECTIONS.has(id) ? 'service' : undefined;
  const order = scheme.sections.findIndex((section) => section.id === id);
  return kind && order >= 0 ? { id, title: scheme.sections[order]!.title, kind, order } : undefined;
}

/**
 * The class of a transfer operator's item, by the owner's precedence: the merchant's own section when it names a class
 * (not the catch-all), then the section the engine assigned, then the keyword rules on the item's name. Undefined when
 * the vocabulary doesn't class it (a bundle, a plan, a bare model name), so it is never shown as a vehicle by guesswork.
 */
export function transferClass(merchant: Pick<Merchant, 'subcategoryId'>, item: Pick<CatalogItem, 'name' | 'section' | 'sectionId'>): TransferClass | undefined {
  const scheme = transferScheme(merchant);
  if (!scheme) return undefined;
  const own = item.section?.trim() ? classOf(scheme, ruleSection(scheme, item.section)?.id) : undefined;
  return (own && own.id !== CATCH_ALL ? own : undefined) ?? classOf(scheme, item.sectionId) ?? classOf(scheme, ruleSection(scheme, item.name)?.id);
}

/* Matching ------------------------------------------------------------------------------------------------------ */

const PICKUP_WORD = /(?:^|[^a-z0-9])pick-?ups?(?![a-z0-9])/;
const DROPOFF_WORD = /(?:^|[^a-z0-9])drop-?offs?(?![a-z0-9])/;
const AIRPORT_WORDS: Record<Airport['id'], RegExp> = {
  jkia: /(?:^|[^a-z0-9])(?:jkia|jomo kenyatta)(?![a-z0-9])/,
  wilson: /(?:^|[^a-z0-9])wilson(?![a-z0-9])/,
};

/**
 * Which way a listing runs: the direction its name states, else the operator's own subcategory (Airport Pickup or
 * Airport Drop-off). Undefined when neither says, or the name says both: it serves either way.
 */
export function itemDirection(merchant: Pick<Merchant, 'subcategoryId'>, item: Pick<CatalogItem, 'name'>): TransferDirection | undefined {
  const name = fold(item.name);
  const pickup = PICKUP_WORD.test(name);
  const dropoff = DROPOFF_WORD.test(name);
  if (pickup || dropoff) return pickup && dropoff ? undefined : pickup ? 'pickup' : 'dropoff';
  return transferDirection(merchant);
}

/** The airport a listing names, if any. */
export function itemAirport(item: Pick<CatalogItem, 'name'>): Airport['id'] | undefined {
  const name = fold(item.name);
  return AIRPORTS.find((airport) => AIRPORT_WORDS[airport.id].test(name))?.id;
}

/** A shilling price the catalogue lists, the only fare that can be compared. */
export function listedFare(item: Pick<CatalogItem, 'price' | 'currency'>): number | undefined {
  return item.currency === 'KES' && typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0 ? item.price : undefined;
}
/** The listed price as the card prints it, without "From". */
export const fareLabel = (item: Pick<CatalogItem, 'price' | 'currency'>) => formatPrice(item, 'code') ?? 'Price on request';

export interface TransferVehicle { merchant: Merchant; item: CatalogItem; vehicleClass: TransferClass; fare?: number }
export interface TransferMatch { direction: TransferDirection; airport: AirportChoice }
export const vehicleKey = (vehicle: { merchant: Pick<Merchant, 'id'>; item: Pick<CatalogItem, 'id'> }) => `${vehicle.merchant.id}:${vehicle.item.id}`;

/** Lowest listed fare first (unpriced last), then class order, operator, name and ID, so the order never shifts. */
export function byFare(left: TransferVehicle, right: TransferVehicle): number {
  const fares = (left.fare ?? Number.POSITIVE_INFINITY) - (right.fare ?? Number.POSITIVE_INFINITY);
  return (Number.isNaN(fares) ? 0 : fares)
    || left.vehicleClass.order - right.vehicleClass.order
    || left.merchant.name.localeCompare(right.merchant.name, 'en-KE')
    || left.item.name.localeCompare(right.item.name, 'en-KE')
    || vehicleKey(left).localeCompare(vehicleKey(right));
}

/**
 * Every available vehicle the transfer operators list that fits the ride's direction and airport, once, lowest listed
 * fare first. Services (meet & greet, chauffeur, early & late) are not cars, and nothing is matched on seats or bags,
 * which the catalogue doesn't hold: the operator confirms them.
 */
export function transferVehicles(merchants: readonly Merchant[], match: TransferMatch): TransferVehicle[] {
  const seen = new Set<string>();
  const vehicles: TransferVehicle[] = [];
  for (const merchant of merchants) {
    for (const item of merchant.items) {
      const key = vehicleKey({ merchant, item });
      if (item.merchantId !== merchant.id || item.isAvailable === false || seen.has(key)) continue;
      const vehicleClass = transferClass(merchant, item);
      if (vehicleClass?.kind !== 'vehicle') continue;
      const direction = itemDirection(merchant, item);
      if (direction && direction !== match.direction) continue;
      const named = itemAirport(item);
      if (named && named !== match.airport) continue;
      seen.add(key);
      vehicles.push({ merchant, item, vehicleClass, fare: listedFare(item) });
    }
  }
  return vehicles.sort(byFare);
}

/**
 * "Recommended for your trip", honestly: the lowest listed fare in each vehicle class, in the scheme's class order.
 * Only shilling fares compare; an unpriced vehicle is never the lowest.
 */
export function lowestFarePerClass(vehicles: readonly TransferVehicle[]): TransferVehicle[] {
  const best = new Map<string, TransferVehicle>();
  for (const vehicle of vehicles) {
    if (vehicle.fare === undefined) continue;
    const current = best.get(vehicle.vehicleClass.id);
    if (!current || byFare(vehicle, current) < 0) best.set(vehicle.vehicleClass.id, vehicle);
  }
  return [...best.values()].sort((left, right) => left.vehicleClass.order - right.vehicleClass.order);
}

export interface ClassCount { id: string; title: string; count: number }
/** The classes present, in the scheme's order, with how many vehicles each holds: the filter chips. */
export function classCounts(vehicles: readonly TransferVehicle[]): ClassCount[] {
  const counts = new Map<string, ClassCount & { order: number }>();
  for (const { vehicleClass } of vehicles) {
    const entry = counts.get(vehicleClass.id);
    if (entry) entry.count += 1;
    else counts.set(vehicleClass.id, { id: vehicleClass.id, title: vehicleClass.title, count: 1, order: vehicleClass.order });
  }
  return [...counts.values()].sort((left, right) => left.order - right.order).map(({ id, title, count }) => ({ id, title, count }));
}

/** How many operators the vehicles come from. */
export const operatorCount = (vehicles: readonly TransferVehicle[]) => new Set(vehicles.map((vehicle) => vehicle.merchant.id)).size;

/** How many operators list at least one available vehicle, either way and at any airport (meet & greet alone isn't a vehicle). */
export const vehicleOperatorCount = (merchants: readonly Merchant[]) => new Set(merchants
  .filter((merchant) => merchant.items.some((item) => item.merchantId === merchant.id && item.isAvailable !== false && transferClass(merchant, item)?.kind === 'vehicle'))
  .map((merchant) => merchant.id)).size;

/* Meet & greet --------------------------------------------------------------------------------------------------- */

export interface MeetGreetListing { merchant: Merchant; services: CatalogItem[] }

/** Operators that list meet & greet as a service (by the transfers scheme), by name. */
export function meetGreetListings(merchants: readonly Merchant[]): MeetGreetListing[] {
  const listings = new Map<string, MeetGreetListing>();
  for (const merchant of merchants) {
    if (listings.has(merchant.id)) continue;
    const services = merchant.items.filter((item) => item.merchantId === merchant.id && item.isAvailable !== false && transferClass(merchant, item)?.id === MEET_GREET);
    if (services.length) listings.set(merchant.id, { merchant, services });
  }
  return [...listings.values()].sort((left, right) => left.merchant.name.localeCompare(right.merchant.name, 'en-KE'));
}

const names = (list: readonly string[]) => new Intl.ListFormat('en-KE', { style: 'long', type: 'conjunction' }).format(list);

/**
 * What the results say when meet & greet is ticked: which operators with matching vehicles also list it, and who lists
 * it on its own. Whoever drives confirms it; nothing here claims an operator offers what it doesn't list.
 */
export function meetGreetSummary(listings: readonly MeetGreetListing[], vehicles: readonly TransferVehicle[]): { text: string; alongside: Merchant[]; separate: Merchant[] } {
  const operators = new Set(vehicles.map((vehicle) => vehicle.merchant.id));
  const alongside = listings.filter((listing) => operators.has(listing.merchant.id)).map((listing) => listing.merchant);
  const separate = listings.filter((listing) => !operators.has(listing.merchant.id)).map((listing) => listing.merchant);
  const text = alongside.length
    ? `${names(alongside.map((merchant) => merchant.name))} ${alongside.length === 1 ? 'lists' : 'list'} meet & greet alongside ${alongside.length === 1 ? 'its' : 'their'} vehicles. For any other vehicle, the operator confirms it.`
    : 'None of the operators with matching vehicles list meet & greet, so the operator you choose confirms it.';
  return { text, alongside, separate };
}

/** True when the vehicle's own operator lists meet & greet. */
export const listsMeetGreet = (listings: readonly MeetGreetListing[], vehicle: Pick<TransferVehicle, 'merchant'>) => listings.some((listing) => listing.merchant.id === vehicle.merchant.id);

/* Summaries ------------------------------------------------------------------------------------------------------ */

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** "2 travellers · 2 bags", "1 traveller · no bags". */
export const partySummary = (travellers: number, bags: number) => `${plural(travellers, 'traveller', 'travellers')} · ${bags > 0 ? plural(bags, 'bag', 'bags') : 'no bags'}`;
/** "2 travellers and 2 bags", "1 traveller". */
export const partyPhrase = (travellers: number, bags: number) => `${plural(travellers, 'traveller', 'travellers')}${bags > 0 ? ` and ${plural(bags, 'bag', 'bags')}` : ''}`;
/** "JKIA → Westlands, Nairobi"; an end not filled in yet says so. */
export const routeLabel = (trip: Pick<TransferTrip, 'pickup' | 'dropoff'>) => `${shortPlace(trip.pickup) || 'Pickup to add'} → ${shortPlace(trip.dropoff) || 'drop-off to add'}`;
/** "Tue, 18 Nov, 14:30". */
export const whenLabel = (trip: Pick<TransferTrip, 'date' | 'time'>) => [trip.date ? shortDate(trip.date) : '', trip.time].filter(Boolean).join(', ');

/** One line for the results: route, when, party, and meet & greet when ticked. */
export function rideSummary(trip: TransferTrip): string {
  return [routeLabel(trip), whenLabel(trip), partySummary(trip.travellers, trip.bags), trip.meetGreet ? 'meet & greet' : ''].filter(Boolean).join(' · ');
}

/** The page's one honest line about fares and fit: the catalogue lists a fare, never seats or bags. */
export const fareNote = (trip: Pick<TransferTrip, 'travellers' | 'bags'>) =>
  `Fares are as each operator lists them. The operator confirms the final fare and that the vehicle fits ${partyPhrase(trip.travellers, trip.bags)}.`;

export interface TransferRequestSummary {
  vehicle: string; vehicleClass: string; operator: string; fare: string;
  route: string; when: string; party: string;
  /** Present when meet & greet is ticked: it goes with the request and the operator confirms it. */
  meetGreet?: string;
  /** Where the request goes: this device only. */
  note: string;
}

/** The selected transfer in words: the vehicle, the whole ride, and where the request is kept. */
export function transferRequestSummary(trip: TransferTrip, vehicle: TransferVehicle): TransferRequestSummary {
  const operator = vehicle.merchant.name;
  return {
    vehicle: vehicle.item.name, vehicleClass: vehicle.vehicleClass.title, operator, fare: fareLabel(vehicle.item),
    route: routeLabel(trip), when: whenLabel(trip), party: partySummary(trip.travellers, trip.bags),
    ...(trip.meetGreet ? { meetGreet: `Meet & greet goes with the request. ${operator} confirms it.` } : {}),
    note: `Saved on this device only. Nothing is sent to ${operator} yet.`,
  };
}

/* Reading the operators ------------------------------------------------------------------------------------------ */

/** Operators per read: the providers' page limit. */
const OPERATOR_PAGE = 48;
/** Five pages of operators at most; past that the page says the list is partial. */
const MAX_OPERATORS = OPERATOR_PAGE * 5;

/**
 * Every transfer operator with its listed items, in a handful of requests: one category read per page of 48 operators
 * (each page brings its operators' items), never one request per operator or per item.
 */
export async function readTransferOperators(provider: Pick<DiscoveryProvider, 'getMerchants'>, signal?: AbortSignal): Promise<{ merchants: Merchant[]; partial: boolean }> {
  const query = { categoryId: TRANSFER_CATEGORY_ID, limit: OPERATOR_PAGE };
  const first = await provider.getMerchants({ ...query, offset: 0 }, signal);
  const pages = [first.merchants];
  let partial = false;
  if (first.semantics === 'bounded/v2') {
    let cursor = first.nextCursor;
    let count = first.merchants.length;
    while (cursor && count < MAX_OPERATORS) {
      const page = await provider.getMerchants({ ...query, cursor }, signal);
      if (page.semantics !== 'bounded/v2' || !page.merchants.length) break;
      pages.push(page.merchants);
      count += page.merchants.length;
      cursor = page.nextCursor;
    }
    partial = Boolean(cursor);
  } else if (first.hasMore) {
    const offsets: number[] = [];
    for (let offset = OPERATOR_PAGE; offset < Math.min(first.total, MAX_OPERATORS); offset += OPERATOR_PAGE) offsets.push(offset);
    const rest = await Promise.all(offsets.map((offset) => provider.getMerchants({ ...query, offset }, signal)));
    pages.push(...rest.map((page) => page.merchants));
    partial = first.total > MAX_OPERATORS;
  }
  const merchants = new Map<string, Merchant>();
  for (const merchant of pages.flat()) if (!merchants.has(merchant.id)) merchants.set(merchant.id, merchant);
  return { merchants: [...merchants.values()], partial };
}
