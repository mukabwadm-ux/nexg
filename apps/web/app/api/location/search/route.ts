import { NextResponse } from 'next/server';

import {
  KENYA_BOX,
  NO_KEY_REASON,
  knownPlaces,
  placesKey,
  refusalReason,
  unreachableReason,
} from '@/lib/google-places';

export const dynamic = 'force-dynamic';

/**
 * Address search: a typed term in, places with coordinates out.
 *
 * Used by the fields that need a pin straight away (the merchant's
 * map pin, "staying at"). The deliver-to box uses /suggest and
 * /place instead, which give as-you-type suggestions the way Google
 * Maps does and only look up coordinates for the one picked.
 *
 * Proxied rather than called from the browser so the request can be
 * shaped — a field mask that keeps the bill down, and a bias to
 * Kenya so "Westlands" does not offer the one in Ontario.
 *
 * When no key is configured this returns an empty list and says why
 * in `reason`. It does **not** fall back to made-up addresses:
 * somebody would order to one.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 3) return NextResponse.json({ results: [] });

  /* Saved places and known properties first — free, instant, and
     far more likely to be what somebody means by "Yaya". */
  const local = await knownPlaces(query);

  const { key, usedServerKey } = placesKey();
  if (!key) return NextResponse.json({ results: local, reason: NO_KEY_REASON });

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.location,places.plusCode',
      },
      body: JSON.stringify({
        textQuery: query,
        /* Biased rather than filtered: a hotel just outside a zone
           is still a real place somebody may be standing in. */
        locationBias: KENYA_BOX,
        maxResultCount: 6,
      }),
      /* The visitor is waiting with a cursor in a box. */
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return NextResponse.json({
        results: local,
        reason: await refusalReason(response, usedServerKey),
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
    return NextResponse.json({ results: local, reason: unreachableReason(error) });
  }
}
