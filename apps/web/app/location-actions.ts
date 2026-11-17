'use server';

import { unstable_cache } from 'next/cache';
import { headers } from 'next/headers';
import type { Coverage, Place } from '@nexg/location';

import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';

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
 * connection-city fallback runs after the initial render because
 * its headers and coverage lookup are not needed to show the page.
 *
 * Two clients, chosen by whether the answer depends on who is
 * asking. Coverage and street names are the same for everyone, so
 * they use the public client. Saved places, the account's last
 * place and the consent record belong to a guest, so they use the
 * visitor's own session: through the public client the database
 * cannot tell who is asking, and from October to November 2026 it
 * refused every saved-place call, so no signed-in guest's place
 * ever reached their account. These run only as server actions
 * after the page has rendered, so reading cookies here never makes
 * a page dynamic.
 */

export interface ResolvedPlace {
  label: string;
  lat: number;
  lng: number;
  [key: string]: unknown;
}

/**
 * The visitor's own session when they have a real account, else null.
 *
 * Saved places are only for real accounts, as ordering is. A signed-out
 * visitor or an anonymous session gets null, and the browser keeps their
 * places as before, without a refused database call on every page.
 */
async function signedInClient() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) return null;
  return supabase;
}

export async function resolveLocation(context: Record<string, unknown>) {
  /* Session client: step 3 of the ladder is the signed-in guest's
     last place, which the public client can never see. Signed-out
     visitors are allowed this call and get the same answer as before. */
  const supabase = createClient();
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
  /*
   * "Just this once" sends save: false. rpc_place_confirm stores
   * every pin it is given, so a one-off pin is not sent: it stays
   * in this browser like any other, and the account keeps only the
   * places somebody chose to save as Home or Work.
   */
  if (payload['save'] === false) {
    return { ok: true, stored: false, reason: 'Used for this visit only.' };
  }
  const supabase = await signedInClient();
  if (!supabase) return { ok: true, stored: false, reason: 'Kept on this device only.' };
  const { data, error } = await supabase.rpc('rpc_place_confirm', { p_payload: payload as never });
  if (error) {
    /*
     * Not an error worth surfacing: it comes back as "not stored"
     * and the client carries on with the place it already has.
     */
    return { ok: true, stored: false, reason: 'Kept on this device only.' };
  }
  return data as { ok: boolean; stored: boolean; id?: string };
}

export async function listPlaces() {
  const supabase = await signedInClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('rpc_place_list');
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}

export async function deletePlace(id: string) {
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, message: 'Sign in to manage your places.' };
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
  /* Session client, so a signed-in guest's consent is recorded
     against them, as the database function is written to do. */
  const supabase = createClient();
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
 * The last rung of the ladder and the weakest, resolved after hydration.
 * It is a city, not
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
export async function cityFromConnection(): Promise<{ step: 'ip_city'; place: Place } | null> {
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
  const city =
    stringField(cover.city) ?? stringField(cover.nearest_city) ?? h.get('x-vercel-ip-city');

  if (!city) return null;

  const coverage = isCoverage(cover.coverage) ? cover.coverage : 'unknown';
  const citySlug = stringField(cover.city_slug) ?? stringField(cover.nearest_city_slug);

  return {
    step: 'ip_city',
    place: {
      label: `${decodeURIComponent(city)} · from your connection`,
      city: decodeURIComponent(city),
      city_slug: citySlug,
      lat,
      lng,
      coverage,
      /*
       * Deliberately coarse. The confirm view reads this to
       * decide whether a pin needs adjusting, and a city-level
       * guess needs adjusting more than any GPS fix does.
       */
      accuracy_m: 20000,
      source: 'ip_city',
      zone_id: stringField(cover.zone_id),
      zone: stringField(cover.zone),
      eta_min: numberField(cover.eta_min),
      eta_max: numberField(cover.eta_max),
      paused: typeof cover.paused === 'boolean' ? cover.paused : undefined,
      nearest_city: stringField(cover.nearest_city),
      nearest_city_slug: stringField(cover.nearest_city_slug),
      nearest_km: numberField(cover.nearest_km),
      message: stringField(cover.message),
    },
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isCoverage(value: unknown): value is Coverage {
  return (
    value === 'covered' || value === 'outside' || value === 'unlaunched' || value === 'unknown'
  );
}
