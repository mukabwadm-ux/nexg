'use server';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Reading a merchant's existing listing so they do not have to retype it.
 *
 * Google Maps links use Places API for verified listing details. Other public
 * pages use OpenGraph tags, which works for Instagram and many shop sites.
 *
 * Nothing is stored except the fields used. The page itself is not kept, and
 * the whole thing is time-boxed: a merchant staring at a spinner is worse off
 * than one who was told quickly that it did not work.
 */

export interface PrefillResult {
  ok: boolean;
  message?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  area?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  photoCount?: number | null;
  openNow?: boolean | null;
  coverUrl?: string | null;
}

const TIMEOUT_MS = 8000;
const FAILED: PrefillResult = {
  ok: false,
  message: 'We could not read that link — start from scratch instead',
};

function isMapsLink(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return (
    hostname === 'maps.app.goo.gl' ||
    hostname === 'goo.gl' ||
    hostname === 'g.page' ||
    hostname === 'google.com' ||
    hostname.endsWith('.google.com') ||
    hostname === 'google.co.ke' ||
    hostname.endsWith('.google.co.ke')
  );
}

export async function prefillFromUrl(raw: string): Promise<PrefillResult> {
  let url: URL;
  try {
    url = new URL(raw.trim().startsWith('http') ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return { ok: false, message: 'That does not look like a link.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return FAILED;

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  if (isMapsLink(url)) {
    if (!process.env['GOOGLE_MAPS_API_KEY']) {
      return {
        ok: false,
        message:
          'Google Maps autofill is not configured on this site yet. Enter your details manually or start from scratch.',
      };
    }
    try {
      const viaPlaces = await fromGooglePlaces(url, signal);
      if (viaPlaces) return viaPlaces;
      return {
        ok: false,
        message:
          'We could not match that Google Maps listing. Check the link, or enter your details from scratch.',
      };
    } catch {
      return {
        ok: false,
        message:
          'Google Maps lookup is unavailable right now. You can enter your details manually or try again.',
      };
    }
  }

  try {
    const viaOpenGraph = await fromOpenGraph(url, signal);
    return viaOpenGraph ?? FAILED;
  } catch {
    return FAILED;
  }
}

async function fromGooglePlaces(url: URL, signal: AbortSignal): Promise<PrefillResult | null> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) return null;

  const finalUrl = await resolveGoogleMapsUrl(url, signal);
  if (!finalUrl) return null;
  const query =
    finalUrl.searchParams.get('q') ??
    finalUrl.searchParams.get('query') ??
    decodeURIComponent(finalUrl.pathname.split('/place/')[1]?.split('/')[0] ?? '');
  if (!query) return null;

  const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.displayName,places.internationalPhoneNumber,places.websiteUri,places.formattedAddress,places.location,places.rating,places.photos,places.currentOpeningHours.openNow',
    },
    body: JSON.stringify({ textQuery: query.replace(/\+/g, ' '), regionCode: 'KE' }),
  });

  if (!search.ok) return null;
  const body = (await search.json()) as {
    places?: {
      displayName?: { text?: string };
      internationalPhoneNumber?: string;
      websiteUri?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      rating?: number;
      photos?: unknown[];
      currentOpeningHours?: { openNow?: boolean };
    }[];
  };

  const place = body.places?.[0];
  if (!place?.displayName?.text) return null;
  const website = place.websiteUri ?? null;
  let email: string | null = null;
  if (website) {
    try {
      email = await findWebsiteEmail(website, AbortSignal.timeout(1800));
    } catch {
      /* Website email is optional; a failed lookup must not hide the listing. */
    }
  }

  return {
    ok: true,
    name: place.displayName.text,
    phone: place.internationalPhoneNumber
      ? `+${place.internationalPhoneNumber.replace(/\D/g, '')}`
      : null,
    email,
    website,
    address: place.formattedAddress ?? null,
    area: place.formattedAddress?.split(',')[1]?.trim() ?? null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    photoCount: place.photos?.length ?? null,
    openNow: place.currentOpeningHours?.openNow ?? null,
  };
}

async function resolveGoogleMapsUrl(url: URL, signal: AbortSignal): Promise<URL | null> {
  let current = url;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!isMapsLink(current)) return null;
    const response = await fetch(current, { redirect: 'manual', signal });
    const location = response.headers.get('location');
    if (!location) return response.ok ? new URL(response.url || current) : null;
    if (redirects === 3) return null;
    current = new URL(location, current);
  }
  return null;
}

async function findWebsiteEmail(raw: string, signal: AbortSignal): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname.endsWith('.local') ||
    url.hostname.endsWith('.internal') ||
    isIP(url.hostname.replace(/^\[|\]$/g, ''))
  ) {
    return null;
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    return null;
  }

  const response = await fetch(url, {
    signal,
    redirect: 'manual',
    headers: { 'User-Agent': 'NexG-Onboarding/1.0 (+https://nexgapp.com)' },
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let html = '';
  let size = 0;
  try {
    while (size < 200_000) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, 200_000 - size);
      size += chunk.length;
      html += decoder.decode(chunk, { stream: true });
      if (chunk.length < value.length) break;
    }
    html += decoder.decode();
  } finally {
    await reader.cancel();
  }

  for (const match of html.matchAll(/mailto:([^"'?#\s<>]+)/gi)) {
    let email: string;
    try {
      email =
        decodeURIComponent(match[1] ?? '')
          .split(/[?,&]/)[0]
          ?.trim() ?? '';
    } catch {
      continue;
    }
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  }
  return null;
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    return isPrivateAddress(normalized.slice('::ffff:'.length));
  }
  if (isIP(normalized) !== 4) return false;

  const [first, second] = normalized.split('.').map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && (second ?? 0) >= 64 && (second ?? 0) <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && (second ?? 0) >= 16 && (second ?? 0) <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first! >= 224
  );
}

async function fromOpenGraph(url: URL, signal: AbortSignal): Promise<PrefillResult | null> {
  const response = await fetch(url.toString(), {
    signal,
    redirect: 'follow',
    headers: { 'User-Agent': 'NexG-Onboarding/1.0 (+https://nexgapp.com)' },
  });
  if (!response.ok) return null;

  /* Only the head is needed, and a shop's homepage can be megabytes. */
  const html = (await response.text()).slice(0, 200_000);

  const meta = (property: string): string | null => {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    );
    const reversed = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    );
    return pattern.exec(html)?.[1] ?? reversed.exec(html)?.[1] ?? null;
  };

  const title =
    meta('og:site_name') ??
    meta('og:title') ??
    /<title[^>]*>([^<]{2,120})<\/title>/i.exec(html)?.[1]?.trim() ??
    null;

  if (!title) return null;

  return {
    ok: true,
    /* Instagram and most shop sites append their own suffix to the title. */
    name: title.split(/[|·–—]/)[0]?.trim() ?? title,
    address: null,
    area: null,
    lat: null,
    lng: null,
    rating: null,
    photoCount: null,
    openNow: null,
    coverUrl: meta('og:image'),
  };
}
