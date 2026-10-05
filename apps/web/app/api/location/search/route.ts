import { maps } from '@nexg/ui/capabilities';
import { NextResponse } from 'next/server';

import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';

/**
 * Address search.
 *
 * Proxied rather than called from the browser so the Maps key
 * stays on the server, and restricted to Kenya and the launch
 * cities so a search for "Westlands" does not offer the one in
 * Ontario.
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
          'X-Goog-Api-Key': capability.key,
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

    if (!response.ok) return NextResponse.json({ results: local });

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
  } catch {
    return NextResponse.json({ results: local });
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
