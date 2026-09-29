'use server';

import { cookies } from 'next/headers';

import { COOKIE, COOKIE_MAX_AGE, DEFAULT_LOCALE, isAuthored, isLocaleTag } from '@/lib/i18n';
import { canMachineTranslate, fillTranslations } from '@/lib/i18n/translate';
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

/**
 * Switch language, generating it first if this is the first time anybody
 * has asked for it.
 *
 * The generation happens here, inside the click, rather than in the
 * background. It is a second or two, once ever, at the moment somebody
 * has just pressed a button and expects something to happen — which is
 * a far better place to spend it than on the next page load, where it
 * would look like the site is slow.
 *
 * If there is no provider the cookie is still set and the site stays in
 * English. That is not a failure worth an error message: the visitor
 * asked for their language and we do not have it, which the welcome
 * card already told them.
 */
export async function setLocale(locale: string): Promise<ConsentResult> {
  if (!isLocaleTag(locale)) {
    return { ok: false, message: 'That is not a language.' };
  }

  const tag = locale.toLowerCase();
  remember(COOKIE.locale, tag);
  remember(COOKIE.asked, '1');

  const supabase = createPublicClient();

  /* Counted whether or not we can serve it, so the languages people
     actually arrive in are visible rather than guessed at. */
  await supabase.rpc('rpc_note_locale', { p_locale: tag });

  if (tag === DEFAULT_LOCALE || isAuthored(tag) || !canMachineTranslate()) {
    return { ok: true };
  }

  /* Already generated? Then there is nothing to pay for. */
  const { data: existing } = await supabase.rpc('fn_translations', { p_locale: tag });
  if (Object.keys((existing as Record<string, string> | null) ?? {}).length > 0) {
    return { ok: true };
  }

  const result = await fillTranslations(tag, async (rows) => {
    await supabase.rpc('rpc_translations_put', { p_locale: tag, p_rows: rows });
  });

  return { ok: true, message: result.ok ? undefined : result.message };
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
