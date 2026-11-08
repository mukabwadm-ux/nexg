import type { CatalogItem, Merchant, TripDetails } from '../../providers/DiscoveryProvider';
import { formatPrice } from '../../lib/formatPrice';
import { fromKey } from '../../lib/calendar';

export type TripFactKey = 'duration' | 'location' | 'style' | 'season' | 'type' | 'base' | 'price';
export interface TripFact { key: TripFactKey; label: string; value: string }
export interface TripDeparture { start: string; end?: string }

/** "From KES 93,000", or "Price on request" when the listing has no price. */
export function tripPrice(item: Pick<CatalogItem, 'price' | 'currency'>): string {
  const price = formatPrice(item, 'code');
  return price ? `From ${price}` : 'Price on request';
}

/**
 * The facts strip. The operator's own trip facts come first; when there are none (every demo trip),
 * it shows only what the listing does say. The operator's base is labelled as such, never as the destination.
 */
export function tripFacts(item: CatalogItem, merchant: Merchant, tripType?: string): TripFact[] {
  const trip = item.trip;
  const supplied: (TripFact | false | undefined | '' | 0)[] = [
    trip?.duration && { key: 'duration', label: 'Duration', value: trip.duration },
    trip?.location && { key: 'location', label: 'Location', value: trip.location },
    trip?.travelStyle?.length && { key: 'style', label: 'Travel style', value: trip.travelStyle.join(' · ') },
    trip?.bestTime && { key: 'season', label: 'Best time', value: trip.bestTime },
  ];
  const facts = supplied.filter((fact): fact is TripFact => Boolean(fact));
  if (facts.length) return facts;
  const listing: (TripFact | false | undefined | '')[] = [
    tripType && { key: 'type', label: 'Trip type', value: tripType },
    merchant.area && { key: 'base', label: 'Operator based in', value: merchant.area },
    { key: 'price', label: 'Price', value: tripPrice(item) },
  ];
  return listing.filter((fact): fact is TripFact => Boolean(fact));
}

const month = new Intl.DateTimeFormat('en-KE', { month: 'short' });

/** "13–15 Nov 2026", "28 Nov – 2 Dec 2026", "30 Dec 2026 – 2 Jan 2027", or "13 Nov 2026" for one day. */
export function departureLabel({ start, end }: TripDeparture): string {
  const from = fromKey(start);
  const day = (date: Date) => `${date.getDate()} ${month.format(date)}`;
  if (!end || end === start) return `${day(from)} ${from.getFullYear()}`;
  const to = fromKey(end);
  if (from.getFullYear() !== to.getFullYear()) return `${day(from)} ${from.getFullYear()} – ${day(to)} ${to.getFullYear()}`;
  if (from.getMonth() !== to.getMonth()) return `${day(from)} – ${day(to)} ${to.getFullYear()}`;
  return `${from.getDate()}–${to.getDate()} ${month.format(from)} ${from.getFullYear()}`;
}

/** Listed departures from today on, earliest first. */
export function upcomingDepartures(trip: TripDetails | undefined, today: string): TripDeparture[] {
  return (trip?.departures ?? []).filter((entry) => entry.start >= today).sort((a, b) => a.start.localeCompare(b.start));
}

export const listJoin = (parts: string[]) => parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** One honest line for whatever the operator has not listed yet; nothing when the trip is complete. */
export function missingDetailsNote(trip: TripDetails | undefined, operator: string): string | undefined {
  const missing = [
    !trip?.itinerary?.length && 'the day-by-day plan',
    !trip?.included?.length && !trip?.excluded?.length && 'inclusions',
    !trip?.departures?.length && 'departure dates',
  ].filter((part): part is string => Boolean(part));
  return missing.length ? `${operator} shares ${listJoin(missing)} when you send a request.` : undefined;
}

/** The first sentence leads under the title; the rest becomes the overview, so nothing repeats. */
export function splitDescription(description?: string): { summary?: string; overview?: string } {
  const text = description?.trim();
  if (!text) return {};
  const match = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(text);
  return match ? { summary: match[1], overview: match[2] } : { summary: text };
}
