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

/** One line in the suggestion list. `place_id` set means "look up the pin on pick". */
interface Suggestion {
  place_id: string | null;
  main: string;
  secondary: string | null;
  /** Character ranges of `main` that match what was typed, for bold. */
  matches: [number, number][];
  /** Already known (a NexG merchant): no lookup needed. */
  lat?: number;
  lng?: number;
}

/**
 * As-you-type address suggestions — Places Autocomplete (New).
 *
 * The same predictions Google Maps shows while you type: cheap, fast,
 * and without coordinates. The pin is fetched by /api/location/place
 * for the one suggestion picked. Both calls carry one session token
 * from the browser, so Google bills the keystrokes and the pick as a
 * single session rather than per keystroke.
 *
 * `near` (lat,lng) biases to where the visitor already is, the way
 * Maps prefers the café down the road to the one in Mombasa.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get('q')?.trim().slice(0, 120) ?? '';
  const session = params.get('session') ?? undefined;
  const near = parseNear(params.get('near'));
  if (query.length < 2) return NextResponse.json({ suggestions: [] });

  const local: Suggestion[] = (await knownPlaces(query, 3)).map((p) => ({
    place_id: null,
    main: p.label,
    secondary: p.address_line,
    matches: matchRanges(p.label, query),
    lat: p.lat,
    lng: p.lng,
  }));

  const { key, usedServerKey } = placesKey();
  if (!key) return NextResponse.json({ suggestions: local, reason: NO_KEY_REASON });

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify({
        input: query,
        sessionToken: session,
        includedRegionCodes: ['ke'],
        locationBias: near ? { circle: { center: near, radius: 30000 } } : KENYA_BOX,
        ...(near ? { origin: near } : {}),
        languageCode: 'en',
      }),
      /* Typing waits on this. A slow answer is replaced by the next keystroke anyway. */
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return NextResponse.json({
        suggestions: local,
        reason: await refusalReason(response, usedServerKey),
      });
    }

    const body = (await response.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string; matches?: { startOffset?: number; endOffset?: number }[] };
            secondaryText?: { text?: string };
          };
        };
      }[];
    };

    const remote: Suggestion[] = (body.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => {
        const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? '';
        return {
          place_id: p.placeId!,
          main,
          secondary: p.structuredFormat?.secondaryText?.text ?? null,
          matches: (p.structuredFormat?.mainText?.matches ?? []).map(
            (m) => [m.startOffset ?? 0, m.endOffset ?? 0] as [number, number],
          ),
        };
      });

    /* A NexG merchant and Google's entry for the same place: keep ours, it has the pin. */
    const ours = new Set(local.map((l) => l.main.toLowerCase()));
    const merged = [...local, ...remote.filter((r) => !ours.has(r.main.toLowerCase()))];

    return NextResponse.json({ suggestions: merged.slice(0, 7) });
  } catch (error) {
    return NextResponse.json({ suggestions: local, reason: unreachableReason(error) });
  }
}

function parseNear(value: string | null) {
  if (!value) return null;
  const [lat, lng] = value.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat!) > 90 || Math.abs(lng!) > 180) return null;
  return { latitude: lat!, longitude: lng! };
}

/** Where the typed words appear in a name, case-insensitive, for bold. */
function matchRanges(text: string, query: string): [number, number][] {
  const hay = text.toLowerCase();
  const out: [number, number][] = [];
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const at = hay.indexOf(word);
    if (at >= 0) out.push([at, at + word.length]);
  }
  return out;
}
