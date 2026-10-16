'use server';

import { unstable_cache } from 'next/cache';
import { headers } from 'next/headers';

import { createPublicClient } from '@/lib/supabase/public';

/* Result types Google gives for a spot a rider can walk up to, best first. */
const PRECISE = ['street_address', 'premise', 'subpremise', 'establishment', 'point_of_interest'];

interface GeocodeBody {
  status: string;
  error_message?: string;
  plus_code?: { global_code?: string };
  results?: { formatted_address: string; types: string[] }[];
}

/*
 * Cached by grid cell for 30 days. A cell is the same ~11 m square
 * as `fn_geo_cell` in the database: two pins a few metres apart are
 * one doorway, one lookup and one charge. A failed lookup throws, so
 * it is never cached — a key without Geocoding enabled today must not
 * mean no street names for a month after somebody fixes it.
 */
const geocodeCell = unstable_cache(
  async (cell: string) => {
    const key = process.env['GOOGLE_MAPS_API_KEY'] ?? '';
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${cell}&language=en&key=${key}`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
    const body = (await response.json()) as GeocodeBody;
    if (body.status === 'ZERO_RESULTS') return { address_line: null, plus_code: null };
    if (body.status !== 'OK') {
      throw new Error(`Geocoding ${body.status}: ${body.error_message ?? 'no message'}`);
    }
    const results = body.results ?? [];
    const best = results.find((r) => r.types.some((t) => PRECISE.includes(t))) ?? results[0];
    return {
      /* "Kenya" is on every one of them and tells a rider nothing. */
      address_line: best ? best.formatted_address.replace(/,\s*Kenya$/, '') : null,
      plus_code: body.plus_code?.global_code ?? null,
    };
  },
  ['reverse-geocode'],
  { revalidate: 60 * 60 * 24 * 30 },
);

/**
 * The server half of the location layer.
 *
 * Everything here is a thin call onto a database function,
 * because coverage, zones and saved places are decided in one
 * place and these actions must not become a second opinion. The
 * one piece of real logic is the IP fallback, and only because
 * the headers it reads exist nowhere else.
 */

export interface ResolvedPlace {
  label: string;
  lat: number;
  lng: number;
  [key: string]: unknown;
}

export async function resolveLocation(context: Record<string, unknown>) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('rpc_resolve_location', {
    p_context: context as never,
  });
  if (error) return { step: 'none', chip_state: 'empty', place: null };
  return data as { step: string; chip_state: string; place: ResolvedPlace | null };
}

export async function coverageFor(lat: number, lng: number) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('rpc_coverage_lookup', { p_lat: lat, p_lng: lng });
  if (error) return { coverage: 'unknown', message: error.message };
  return data as Record<string, unknown> & { coverage: string };
}

/**
 * A street name for a pin, from Google's Geocoding API.
 *
 * Uses the server key (GOOGLE_MAPS_API_KEY), which must have the
 * Geocoding API among its API restrictions. Any failure comes back
 * as null and the confirm view shows coordinates instead: a missing
 * street name is not a reason to stop somebody ordering.
 */
export async function streetFor(
  lat: number,
  lng: number,
): Promise<{ address_line: string | null; plus_code: string | null } | null> {
  if (!process.env['GOOGLE_MAPS_API_KEY']) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  try {
    return await geocodeCell(`${lat.toFixed(4)},${lng.toFixed(4)}`);
  } catch (e) {
    console.warn('[location] reverse geocode failed:', (e as Error).message);
    return null;
  }
}

export async function confirmPlace(payload: Record<string, unknown>) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('rpc_place_confirm', { p_payload: payload as never });
  if (error) {
    /*
     * A signed-out visitor is refused this RPC, which is correct
     * — their places live in their own browser. It is not an
     * error worth surfacing, so it comes back as "not stored"
     * and the client carries on with the place it already has.
     */
    return { ok: true, stored: false, reason: 'Kept on this device only.' };
  }
  return data as { ok: boolean; stored: boolean; id?: string };
}

export async function listPlaces() {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('rpc_place_list');
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}

export async function deletePlace(id: string) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('rpc_place_delete', { p_id: id });
  if (error) return { ok: false, message: error.message };
  return data as { ok: boolean; message?: string };
}

export async function noteLocationEvent(
  sessionId: string,
  surface: string,
  action: string,
  accuracyBand?: string,
  step?: string,
) {
  const supabase = createPublicClient();
  await supabase.rpc('rpc_location_event', {
    p_session: sessionId,
    p_surface: surface,
    p_action: action,
    p_accuracy_band: accuracyBand ?? undefined,
    p_step: step ?? undefined,
  });
}

/**
 * Where the connection says they are.
 *
 * The last rung of the ladder and the weakest. It is a city, not
 * a place: the headers resolve to the exit point of a mobile
 * network, which in Kenya can be a different town from the
 * handset. So it is used only to open the site somewhere
 * plausible, it is always labelled "from your connection", and
 * no price is ever locked against it.
 *
 * Vercel sets these at the edge. Locally there are none, and the
 * honest answer is then nothing at all rather than defaulting to
 * Nairobi — a hard-coded city would be indistinguishable on
 * screen from a real resolution.
 */
export async function cityFromConnection(): Promise<{
  step: 'ip_city';
  place: Record<string, unknown>;
} | null> {
  const h = headers();
  const rawLat = h.get('x-vercel-ip-latitude');
  const rawLng = h.get('x-vercel-ip-longitude');

  /*
   * The headers are checked for existence before being parsed,
   * because `Number(null)` is 0 and `Number.isFinite(0)` is
   * true. Reading them straight through resolved every local
   * request to 0°N 0°E — a real point in the Gulf of Guinea —
   * and the site opened on "Nairobi · from your connection" with
   * a banner offering Karen, 4,085 km away. Nothing errored.
   * It was simply confidently wrong, which is the failure mode
   * this whole layer exists to avoid.
   */
  if (!rawLat || !rawLng) return null;

  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  const cover = await coverageFor(lat, lng);
  const cityName =
    (cover.city as string | undefined) ??
    (cover.nearest_city as string | undefined) ??
    h.get('x-vercel-ip-city');

  if (!cityName) return null;

  return {
    step: 'ip_city',
    place: {
      ...cover,
      label: `${decodeURIComponent(cityName)} · from your connection`,
      city: decodeURIComponent(cityName),
      lat,
      lng,
      /*
       * Deliberately coarse. The confirm view reads this to
       * decide whether a pin needs adjusting, and a city-level
       * guess needs adjusting more than any GPS fix does.
       */
      accuracy_m: 20000,
      source: 'ip_city',
    },
  };
}
