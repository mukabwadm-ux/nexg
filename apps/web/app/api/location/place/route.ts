import { NextResponse } from 'next/server';

import { NO_KEY_REASON, placesKey, refusalReason, unreachableReason } from '@/lib/google-places';

export const dynamic = 'force-dynamic';

/**
 * The pin for one picked suggestion — Place Details (New).
 *
 * Called once, after a suggestion from /api/location/suggest is
 * chosen, with the same session token, which closes the session:
 * Google bills the typing and this lookup together.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id') ?? '';
  const session = params.get('session');

  /* Place ids are URL-safe base64-ish; anything else is not one. */
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) {
    return NextResponse.json({ error: 'Not a place id.' }, { status: 400 });
  }

  const { key, usedServerKey } = placesKey();
  if (!key) return NextResponse.json({ error: NO_KEY_REASON }, { status: 503 });

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${id}`);
    if (session) url.searchParams.set('sessionToken', session);
    url.searchParams.set('languageCode', 'en');

    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,plusCode',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: await refusalReason(response, usedServerKey) },
        { status: 502 },
      );
    }

    const p = (await response.json()) as {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
      plusCode?: { globalCode?: string };
    };
    if (!p.location) {
      return NextResponse.json({ error: 'Google has no pin for that place.' }, { status: 404 });
    }

    return NextResponse.json({
      place: {
        label: p.displayName?.text ?? p.formattedAddress ?? 'Chosen place',
        address_line: p.formattedAddress ?? null,
        plus_code: p.plusCode?.globalCode ?? null,
        lat: p.location.latitude,
        lng: p.location.longitude,
        coverage: 'unknown',
        source: 'search',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: unreachableReason(error) }, { status: 504 });
  }
}
