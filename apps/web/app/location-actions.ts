'use server';

import { headers } from 'next/headers';

import { createPublicClient } from '@/lib/supabase/public';

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
