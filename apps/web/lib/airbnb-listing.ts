/*
 * Reading an Airbnb listing from its public link preview.
 *
 * Airbnb has no open API. Every listing page does carry the preview tags
 * that WhatsApp and Slack read, and they are consistent:
 *
 *   og:title        "Rental unit in Nairobi · ★4.81 · 2 bedrooms · 2 beds · 2 baths"
 *   og:description  the listing's own name
 *   og:image        a cover photo on a0.muscache.com
 *   personCapacity  the guest maximum, in the page's embedded data
 *
 * Nothing here fetches; see the hosts listing action for that.
 */

export type PropertyKind =
  | 'apartment'
  | 'apartment_block'
  | 'villa'
  | 'townhouse'
  | 'guest_house'
  | 'cottage'
  | 'penthouse'
  | 'studio';

export interface AirbnbListing {
  id: string;
  url: string;
  name: string | null;
  typeLabel: string | null;
  kind: PropertyKind;
  city: string | null;
  rating: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  maxGuests: number | null;
  photoUrl: string | null;
}

const AIRBNB_HOST = /^(?:[a-z0-9-]+\.)*airbnb\.(?:com|[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/;

/** airbnb.com and its country sites, plus the abnb.me share links. */
export function isAirbnbHost(host: string): boolean {
  const h = host.toLowerCase();
  return AIRBNB_HOST.test(h) || h === 'abnb.me' || h.endsWith('.abnb.me');
}

/** Airbnb's image host, the only place a cover photo may be copied from. */
export function isAirbnbImageHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'muscache.com' || h.endsWith('.muscache.com');
}

/** The listing id in a /rooms/<id> link, or null. */
export function airbnbListingId(url: URL): string | null {
  if (!isAirbnbHost(url.hostname)) return null;
  const match = /^\/rooms\/(?:plus\/)?(\d{4,25})(?:\/|$)/.exec(url.pathname);
  return match?.[1] ?? null;
}

/** Accepts "airbnb.com/rooms/123", with or without https://, and share links. */
export function parseAirbnbUrl(raw: string): URL | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return isAirbnbHost(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export function canonicalAirbnbUrl(id: string): string {
  return `https://www.airbnb.com/rooms/${id}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function meta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forward = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const reverse = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
    'i',
  );
  const value = forward.exec(html)?.[1] ?? reverse.exec(html)?.[1];
  return value ? decodeEntities(value).trim() : null;
}

const KINDS: [RegExp, PropertyKind][] = [
  [/villa/i, 'villa'],
  [/town ?house/i, 'townhouse'],
  [/guest ?(house|suite)|bed and breakfast|hostel/i, 'guest_house'],
  [/cottage|cabin|bungalow|chalet|tiny home|farm stay/i, 'cottage'],
  [/penthouse/i, 'penthouse'],
  [/studio/i, 'studio'],
];

/** Airbnb's type ("Rental unit", "Villa", ...) to our property kinds. */
export function propertyKindFor(typeLabel: string | null, bedrooms: number | null): PropertyKind {
  for (const [pattern, kind] of KINDS) if (typeLabel && pattern.test(typeLabel)) return kind;
  return bedrooms === 0 ? 'studio' : 'apartment';
}

function count(part: string, noun: RegExp): number | null {
  const match = new RegExp(
    `^(\\d+(?:\\.\\d+)?)\\s+(?:shared\\s+|private\\s+)?(?:${noun.source})`,
    'i',
  ).exec(part);
  return match ? Number(match[1]) : null;
}

/** "Rental unit in Nairobi · ★4.81 · 2 bedrooms · 2 beds · 2 baths" */
export function parsePreviewTitle(title: string) {
  const parts = title.split(/\s+·\s+/).map((part) => part.trim());
  const head = parts[0] ?? '';
  const where = /^(.*?)\s+in\s+(.+)$/i.exec(head);
  let rating: number | null = null;
  let bedrooms: number | null = null;
  let beds: number | null = null;
  let bathrooms: number | null = null;
  for (const part of parts.slice(1)) {
    const star = /^★\s*(\d+(?:\.\d+)?)/.exec(part);
    if (star) rating = Number(star[1]);
    else if (/^studio$/i.test(part)) bedrooms = 0;
    else if (count(part, /bedrooms?/) !== null) bedrooms = count(part, /bedrooms?/);
    else if (count(part, /beds?\b/) !== null) beds = count(part, /beds?\b/);
    else if (count(part, /(?:half-)?baths?|bathrooms?/) !== null)
      bathrooms = count(part, /(?:half-)?baths?|bathrooms?/);
    else if (/^half-bath$/i.test(part)) bathrooms = 0.5;
  }
  return {
    typeLabel: (where?.[1] ?? head) || null,
    city: where?.[2] ?? null,
    rating,
    bedrooms,
    beds,
    bathrooms,
  };
}

/** Pulls what the preview tags say. `id` is the listing id from the URL. */
export function parseAirbnbListing(html: string, id: string): AirbnbListing {
  const title = meta(html, 'og:title') ?? '';
  const parsed = parsePreviewTitle(title);
  const guests = /"personCapacity":\s*(\d{1,3})/.exec(html);
  const photo = meta(html, 'og:image');
  let photoUrl: string | null = null;
  if (photo) {
    try {
      const url = new URL(photo);
      if (url.protocol === 'https:' && isAirbnbImageHost(url.hostname)) {
        /* Ask for a larger rendition than the 720px preview. */
        url.search = '?im_w=1200';
        photoUrl = url.toString();
      }
    } catch {
      photoUrl = null;
    }
  }
  const name = meta(html, 'og:description');
  return {
    id,
    url: canonicalAirbnbUrl(id),
    name: name ? name.slice(0, 120) : null,
    typeLabel: parsed.typeLabel,
    kind: propertyKindFor(parsed.typeLabel, parsed.bedrooms),
    city: parsed.city,
    rating: parsed.rating,
    bedrooms: parsed.bedrooms,
    beds: parsed.beds,
    bathrooms: parsed.bathrooms,
    maxGuests: guests ? Number(guests[1]) : null,
    photoUrl,
  };
}
