'use server';

/**
 * Reading a merchant's existing listing so they do not have to retype it.
 *
 * Two paths. With a Google Maps Platform key, a Maps link is resolved to a
 * place and we get the name, address, coordinates and opening hours — which
 * is the version the artboard shows, and the one that saves the most typing.
 * Without a key, the page is fetched and its OpenGraph tags are read, which
 * still gets a name and a photo from Instagram or a shop's own site.
 *
 * Nothing is stored except the fields used. The page itself is not kept, and
 * the whole thing is time-boxed: a merchant staring at a spinner is worse off
 * than one who was told quickly that it did not work.
 */

export interface PrefillResult {
  ok: boolean;
  message?: string;
  name?: string;
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
  return /(^|\.)(google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|g\.page)$/i.test(url.hostname);
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

  try {
    if (isMapsLink(url)) {
      const viaPlaces = await fromGooglePlaces(url, signal);
      if (viaPlaces) return viaPlaces;
    }
    const viaOpenGraph = await fromOpenGraph(url, signal);
    return viaOpenGraph ?? FAILED;
  } catch {
    return FAILED;
  }
}

async function fromGooglePlaces(url: URL, signal: AbortSignal): Promise<PrefillResult | null> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) return null;

  /* Short links redirect to the real one, which carries the place. */
  const resolved = await fetch(url.toString(), { redirect: 'follow', signal });
  const finalUrl = new URL(resolved.url);
  const query =
    finalUrl.searchParams.get('q') ??
    decodeURIComponent(finalUrl.pathname.split('/place/')[1]?.split('/')[0] ?? '');
  if (!query) return null;

  const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.location,places.rating,places.photos,places.currentOpeningHours.openNow',
    },
    body: JSON.stringify({ textQuery: query.replace(/\+/g, ' '), regionCode: 'KE' }),
  });

  if (!search.ok) return null;
  const body = (await search.json()) as {
    places?: {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      rating?: number;
      photos?: unknown[];
      currentOpeningHours?: { openNow?: boolean };
    }[];
  };

  const place = body.places?.[0];
  if (!place?.displayName?.text) return null;

  return {
    ok: true,
    name: place.displayName.text,
    address: place.formattedAddress ?? null,
    area: place.formattedAddress?.split(',')[1]?.trim() ?? null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    photoCount: place.photos?.length ?? null,
    openNow: place.currentOpeningHours?.openNow ?? null,
  };
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
