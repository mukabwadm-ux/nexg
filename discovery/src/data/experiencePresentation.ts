import type { CatalogItem, Merchant } from '../providers/DiscoveryProvider';
import { formatPrice } from '../lib/formatPrice';
import { splitDescription, tripPrice, upcomingDepartures, type TripDeparture, type TripFact } from '../components/tours/tripFormat';
import { findCategory } from './taxonomy';

const experiences = findCategory('experiences');

function experienceSubcategory(merchant: Pick<Merchant, 'subcategoryId'>) {
  return experiences?.subcategories.find((subcategory) => merchant.subcategoryId && subcategory.sourceIds.includes(merchant.subcategoryId));
}

/** Route recognized activity/event offerings directly; commissioned photography stays with its provider. */
export function isDirectExperienceMerchant(merchant: Merchant): boolean {
  const subcategory = experienceSubcategory(merchant);
  return Boolean(subcategory && subcategory.id !== 'experiences:photography');
}

/** Display the official nested label when the original source group identifies one. */
export function experienceLabel(merchant: Pick<Merchant, 'subcategoryId'>): string | undefined {
  const subcategory = experienceSubcategory(merchant);
  return subcategory?.options.find((option) => merchant.subcategoryId && option.sourceIds.includes(merchant.subcategoryId))?.label ?? subcategory?.label;
}

/*
 * The experience page (events, workshops and classes, sports and recreation). Plain TypeScript, so the Expo
 * app can reuse it. Only catalogue facts are shown: listings carry a name, a price, a photo and a short
 * description, so the host confirms the date, time, venue and final price, and the page says so once.
 */

/** How an experience is requested, in its own words: tickets for events, guests for classes and activities. */
export interface ExperienceBooking {
  /** The facts-strip key for the experience's type. */
  fact: 'event' | 'class' | 'sport';
  typeLabel: string;
  countLabel: 'Tickets' | 'Guests';
  /** "1 ticket", "3 guests". */
  count: (value: number) => string;
  action: string;
}

const counted = (one: string, many: string) => (value: number) => `${value} ${value === 1 ? one : many}`;

export function experienceBooking(merchant: Pick<Merchant, 'subcategoryId'>): ExperienceBooking {
  const group = experienceSubcategory(merchant)?.id;
  if (group === 'experiences:events') return { fact: 'event', typeLabel: 'Event type', countLabel: 'Tickets', count: counted('ticket', 'tickets'), action: 'Request tickets' };
  if (group === 'experiences:workshops-classes') return { fact: 'class', typeLabel: 'Format', countLabel: 'Guests', count: counted('guest', 'guests'), action: 'Request booking' };
  return { fact: 'sport', typeLabel: 'Type', countLabel: 'Guests', count: counted('guest', 'guests'), action: 'Request booking' };
}

/** The facts strip: the type, where the host is based (never presented as the venue) and the listed price. */
export function experienceFacts(item: CatalogItem, merchant: Merchant): TripFact[] {
  const booking = experienceBooking(merchant);
  const label = experienceLabel(merchant);
  const facts: (TripFact | false | undefined | '')[] = [
    label && { key: booking.fact, label: booking.typeLabel, value: label },
    merchant.area && { key: 'base', label: 'Host based in', value: merchant.area },
    { key: 'price', label: 'Price', value: tripPrice(item) },
  ];
  return facts.filter((fact): fact is TripFact => Boolean(fact));
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-KE');

/** "Couples Pass from Kijiji Concerts Atelier." only repeats the title and the host line above it. */
function restatesName(name: string, sentence: string): boolean {
  const own = fold(name);
  const opening = fold(sentence).replace(/[.!?]+$/, '');
  return !opening || opening === own || opening.startsWith(`${own} from `) || opening.startsWith(`${own} by `);
}

/** The first sentence leads under the title and the rest is the overview, as on the trip page, minus a restated title. */
export function experienceDescription(item: Pick<CatalogItem, 'name' | 'description'>): { summary?: string; overview?: string } {
  const { summary, overview } = splitDescription(item.description);
  if (summary && restatesName(item.name, summary)) return overview ? { overview } : {};
  return { summary, overview };
}

/**
 * Dates the listing itself names, from today on. Catalogue items carry listed dates in `trip.departures`
 * until the catalogue has its own event dates; without them the shopper picks a preferred date.
 */
export function listedDates(item: Pick<CatalogItem, 'trip'>, today: string): TripDeparture[] {
  return upcomingDepartures(item.trip, today);
}

/** The one line that says who confirms what the listing doesn't. */
export function hostConfirms(host: string, datesListed: boolean): string {
  return `${host} confirms the ${datesListed ? 'time' : 'date, time'}, venue and final price.`;
}

/** The listed price times the count, or nothing when the listing has no usable price. */
export function listedTotal(item: Pick<CatalogItem, 'price' | 'currency' | 'isAvailable'>, count: number): string | undefined {
  if (item.isAvailable === false || item.price === undefined || !Number.isFinite(item.price) || !Number.isInteger(count) || count < 1) return undefined;
  return formatPrice({ price: item.price * count, currency: item.currency }, 'code');
}

/*
 * A request is kept on this device in the store's shelf ("nexg.discovery.shelf.v1:<merchant>"), the same
 * one the generic storefront reads, so the host's store shows it as a saved request. Nothing is sent.
 * The count travels as `adults` (people), the field the shelf already keeps.
 */
export const MAX_EXPERIENCE_COUNT = 20;
export interface ExperienceRequest { date: string; count: number; savedAt: string }
type ShelfStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const shelfKey = (merchantId: string) => `nexg.discovery.shelf.v1:${merchantId}`;
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

function readShelf(storage: ShelfStorage, merchantId: string): Record<string, unknown> | undefined {
  try {
    const raw = storage.getItem(shelfKey(merchantId));
    return raw ? record(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

/** The request kept for one item, read defensively: storage can be empty, blocked or edited by hand. */
export function readExperienceRequest(storage: ShelfStorage | undefined, merchantId: string, itemId: string, today: string): ExperienceRequest | undefined {
  if (!storage) return undefined;
  const entry = record(record(readShelf(storage, merchantId)?.requests)?.[itemId]);
  const answers = record(entry?.answers);
  // A request for a day that has passed is no longer a request.
  if (!answers || !isDay(answers.date) || answers.date < today) return undefined;
  const count = typeof answers.adults === 'number' && Number.isInteger(answers.adults) ? Math.min(MAX_EXPERIENCE_COUNT, Math.max(1, answers.adults)) : 1;
  return { date: answers.date, count, savedAt: typeof entry?.savedAt === 'string' ? entry.savedAt : '' };
}

/** Keeps (or, without a request, forgets) one item's request; the store's other hearts and requests stay. False when storage refuses. */
export function writeExperienceRequest(storage: ShelfStorage | undefined, merchantId: string, itemId: string, request?: ExperienceRequest): boolean {
  if (!storage) return false;
  try {
    const shelf = readShelf(storage, merchantId) ?? {};
    const saved = Array.isArray(shelf.saved) ? shelf.saved.filter((id): id is string => typeof id === 'string') : [];
    const requests: Record<string, unknown> = { ...record(shelf.requests) };
    if (request) requests[itemId] = { answers: { date: request.date, adults: request.count }, savedAt: request.savedAt };
    else delete requests[itemId];
    if (saved.length || Object.keys(requests).length) storage.setItem(shelfKey(merchantId), JSON.stringify({ ...shelf, saved, requests }));
    else storage.removeItem(shelfKey(merchantId));
    return true;
  } catch {
    return false;
  }
}
