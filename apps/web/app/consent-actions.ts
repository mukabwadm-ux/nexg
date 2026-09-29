'use server';

import { cookies } from 'next/headers';

import { COOKIE, COOKIE_MAX_AGE, isSupported } from '@/lib/i18n';
import { createPublicClient } from '@/lib/supabase/public';

export interface ConsentResult {
  ok: boolean;
  /** The city we resolved them to, if any. */
  city?: { slug: string; name: string; status: string; km: number; insideZone: boolean };
  message?: string;
}

function remember(name: string, value: string) {
  cookies().set(name, value, {
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    /* Readable by the server on every request; nothing secret is in them. */
    httpOnly: false,
  });
}

/** They answered the card, whatever the answer was. Stops us asking again. */
export async function markAsked(): Promise<void> {
  remember(COOKIE.asked, '1');
}

/**
 * Turn a coordinate into a city, keep the city, forget the coordinate.
 *
 * The latitude and longitude are arguments to one query and are never
 * written anywhere — not a column, not a log line, not a cookie. What
 * survives is a slug like `nairobi`, which is the only part we have any
 * use for and the part that tells nobody where somebody lives.
 */
export async function setLocationFromCoords(
  lat: number,
  lng: number,
): Promise<ConsentResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, message: 'That does not look like a location.' };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('fn_city_for_point', {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) return { ok: false, message: error.message };

  const row = (data as { slug: string; name: string; status: string; distance_m: number; inside_a_zone: boolean }[] | null)?.[0];
  if (!row) return { ok: false, message: 'We could not place that.' };

  const km = Math.round(row.distance_m / 1000);

  /*
   * Two hundred kilometres is not "near". Past that we would be opening
   * the site on a city the visitor has no connection to, which is worse
   * than opening on nothing and letting them choose.
   */
  if (km > 200) {
    remember(COOKIE.asked, '1');
    return { ok: true, message: 'far' };
  }

  remember(COOKIE.city, row.slug);
  remember(COOKIE.asked, '1');

  return {
    ok: true,
    city: {
      slug: row.slug,
      name: row.name,
      status: row.status,
      km,
      insideZone: row.inside_a_zone,
    },
  };
}

/** Switch language. Used by the card and by the footer switcher. */
export async function setLocale(locale: string): Promise<ConsentResult> {
  if (!isSupported(locale)) {
    return { ok: false, message: 'We do not have that language yet.' };
  }
  remember(COOKIE.locale, locale);
  remember(COOKIE.asked, '1');
  return { ok: true };
}

/** Let someone pick a city by hand, without sharing a location. */
export async function setCity(slug: string): Promise<ConsentResult> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('city')
    .select('slug, name, status')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) return { ok: false, message: 'We are not in that city.' };

  remember(COOKIE.city, data.slug);
  remember(COOKIE.asked, '1');
  return { ok: true, city: { ...data, km: 0, insideZone: false } };
}
