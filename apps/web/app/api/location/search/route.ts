import { maps } from '@nexg/ui/capabilities';
import { NextResponse } from 'next/server';

import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';

/**
 * Address search.
 *
 * Proxied rather than called from the browser so the request
 * can be shaped — a field mask that keeps the bill down, and a
 * bias to Kenya and the launch cities so a search for
 * "Westlands" does not offer the one in Ontario.
 *
 * It used to claim the proxy kept the key off the client. It
 * did not: the key it used was a NEXT_PUBLIC_ one, which is in
 * the bundle by definition. The secrecy now comes from using a
 * separate server key, below.
 *
 * When no key is configured this returns an empty list and says
 * why in `reason`. It does **not** fall back to a plausible
 * list of made-up addresses: somebody would order to one, and a
 * rider would be sent to a place that does not exist. An empty
 * result with an explanation is the honest failure.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 3) return NextResponse.json({ results: [] });

  /* Saved places and known properties first — they are free,
     instant, and far more likely to be what somebody means when
     they type "Yaya" than anything a geocoder returns. */
  const local = await knownPlaces(query);

  /*
   * The server's own key, not the browser's.
   *
   * These cannot be the same key. The browser key must be
   * locked to our domains by HTTP referrer, or anyone can lift
   * it out of the bundle and spend our quota. This request is
   * made from a Vercel function, which sends no Referer header
   * at all — so a referrer-restricted key is refused here with
   * "Requests from referer <empty> are blocked", which is
   * exactly what happened the first time the key went live.
   *
   * So: GOOGLE_MAPS_API_KEY, restricted by API rather than by
   * referrer, is what this route wants. It falls back to the
   * public key so a deployment with only one key still works —
   * that only succeeds if the public key has no referrer
   * restriction, which is a trade worth making knowingly
   * rather than a silent failure.
   */
  const serverKey = process.env['GOOGLE_MAPS_API_KEY'] ?? '';

  const capability = maps();
  if (!capability.live) {
    return NextResponse.json({
      results: local,
      reason: capability.why,
    });
  }

  try {
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': serverKey || capability.key,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.location,places.plusCode',
        },
        body: JSON.stringify({
          textQuery: query,
          /* Biased to the launch footprint rather than filtered
             to it: a hotel just outside a zone boundary is still
             a real place somebody may be standing in. */
          locationBias: {
            rectangle: {
              low: { latitude: -4.8, longitude: 33.9 },
              high: { latitude: 1.6, longitude: 41.9 },
            },
          },
          maxResultCount: 6,
        }),
        /* The visitor is waiting with a cursor in a box. A slow
           geocoder must not hold the panel open. */
        signal: AbortSignal.timeout(3000),
      },
    );

    if (!response.ok) {
      /*
       * Say that Google refused, and why.
       *
       * This returned a bare empty list, which is the same
       * thing it returns when Google simply found nothing. A
       * key restricted to the wrong referrer, an unenabled
       * Places API and a genuine no-match were three different
       * problems wearing one face — and the one person who
       * needs to tell them apart is whoever has just added the
       * key and is wondering whether it worked.
       *
       * The status alone is most of the answer: 403 is
       * restriction or an unenabled API, 429 is quota.
       */
      const detail = await response.text().catch(() => '');
      const why = (() => {
        try {
          return (JSON.parse(detail) as { error?: { message?: string } }).error?.message;
        } catch {
          return undefined;
        }
      })();
      return NextResponse.json({
        results: local,
        reason:
          `Address search is configured but Google refused the request (HTTP ${response.status}).` +
          (why ? ` ${why}` : '') +
          (serverKey
            ? ' This used GOOGLE_MAPS_API_KEY, so check that key’s own API restrictions' +
              ' include Places API (New) and that billing is enabled on the Cloud project.'
            : ' This used the browser key, because GOOGLE_MAPS_API_KEY is not set. A' +
              ' referrer-restricted key cannot work here: the call comes from a server and' +
              ' sends no referer. Set GOOGLE_MAPS_API_KEY to a second key restricted by API' +
              ' rather than by referrer.'),
      });
    }

    const body = (await response.json()) as {
      places?: {
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
        plusCode?: { globalCode?: string };
      }[];
    };

    const remote = (body.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({
        label: p.displayName?.text ?? p.formattedAddress ?? query,
        address_line: p.formattedAddress ?? null,
        plus_code: p.plusCode?.globalCode ?? null,
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        coverage: 'unknown' as const,
        source: 'search',
      }));

    return NextResponse.json({ results: [...local, ...remote].slice(0, 8) });
  } catch (error) {
    /*
     * Almost always the 3s timeout above. Named rather than
     * swallowed for the same reason as the branch above: a slow
     * geocoder and an absent one are different problems, and an
     * empty list says neither.
     */
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return NextResponse.json({
      results: local,
      reason: timedOut
        ? 'Google did not answer within 3 seconds, so only places NexG already knows are shown.'
        : 'Address search could not reach Google, so only places NexG already knows are shown.',
    });
  }
}

/**
 * Places NexG already knows about.
 *
 * Read from `merchant_public` rather than the branch table,
 * because guests type the name over the door — "Westlands
 * Trattoria", not whatever the branch row is called internally.
 * Searching the internal name returned nothing for the most
 * obvious query on the site.
 *
 * These beat a geocoder for what people actually type, they
 * cost nothing, and they come with coordinates already in a
 * zone.
 */
async function knownPlaces(query: string) {
  /*
   * `.or()` takes a PostgREST filter *string*, so the search
   * term is being interpolated into a small query language —
   * commas separate filters, parentheses group them, and a dot
   * separates column from operator. A term containing any of
   * them does not fail; it changes which rows come back, which
   * is the quiet half of an injection.
   *
   * Stripped rather than escaped, because PostgREST has no
   * escape for these inside a filter value, and nobody searching
   * for a hotel needs a comma.
   */
  const safe = query.replace(/[,().*"'%\\]/g, ' ').trim().slice(0, 60);
  if (safe.length < 3) return [];

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('merchant_public')
    .select('trading_name, branch_name, city_name, branch_latitude, branch_longitude')
    .or(`trading_name.ilike.%${safe}%,branch_name.ilike.%${safe}%`)
    .not('branch_latitude', 'is', null)
    .limit(5);

  return (
    (data as {
      trading_name: string;
      branch_name: string | null;
      city_name: string | null;
      branch_latitude: number;
      branch_longitude: number;
    }[] | null) ?? []
  ).map((m) => ({
    label: m.trading_name,
    address_line: [m.branch_name, m.city_name].filter(Boolean).join(', ') || null,
    plus_code: null,
    lat: m.branch_latitude,
    lng: m.branch_longitude,
    coverage: 'unknown' as const,
    source: 'search',
  }));
}
