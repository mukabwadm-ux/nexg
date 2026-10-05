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
 * Places NexG already knows about: hotels, units and merchant
 * branches. These beat a geocoder for the thing guests actually
 * type, and they come with a zone already attached.
 */
async function knownPlaces(query: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('merchant_branch')
    .select('name, latitude, longitude')
    .ilike('name', `%${query}%`)
    .not('latitude', 'is', null)
    .limit(4);

  return (
    (data as { name: string; latitude: number; longitude: number }[] | null) ?? []
  ).map((b) => ({
    label: b.name,
    address_line: null,
    plus_code: null,
    lat: b.latitude,
    lng: b.longitude,
    coverage: 'unknown' as const,
    source: 'search',
  }));
}
