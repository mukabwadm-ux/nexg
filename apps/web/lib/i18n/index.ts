import { cookies } from 'next/headers';

import { createPublicClient } from '@/lib/supabase/public';

import {
  AUTHORED_LOCALES,
  DEFAULT_LOCALE,
  DICTIONARIES,
  isAuthored,
  isLocaleTag,
  type Locale,
  type Translate,
} from './dictionaries';
import { canMachineTranslate } from './translate';

export {
  AUTHORED_LOCALES,
  DEFAULT_LOCALE,
  DICTIONARIES,
  isAuthored,
  isLocaleTag,
  LOCALE_NAMES,
  pickLocale,
  translator,
  type Locale,
  type Translate,
} from './dictionaries';

export { canMachineTranslate } from './translate';

/** The cookies this feature owns, named in one place. */
export const COOKIE = {
  /** The language the visitor agreed to be shown. Any BCP-47 tag. */
  locale: 'nexg_locale',
  /** The city their location resolved to, as a slug. */
  city: 'nexg_city',
  /** That they have been asked. Its presence is what dismisses the card. */
  asked: 'nexg_asked',
} as const;

/** A year. Long enough that we are not asking again every week. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The language for this request.
 *
 * Any well-formed tag, not a list of two: a phone set to `zh-CN` is
 * `zh-CN`, and whether we can actually say anything in it is a separate
 * question, answered by what is in the cache.
 *
 * Deliberately not the Accept-Language header. The header says what the
 * browser prefers; it says nothing about whether this person agreed to
 * be shown it, and the whole point of the welcome card is that we ask
 * first.
 */
export function getLocale(): Locale {
  const value = cookies().get(COOKIE.locale)?.value;
  return isLocaleTag(value) ? value : DEFAULT_LOCALE;
}

/**
 * The locale and a lookup for it.
 *
 * Three layers, most trusted first: a hand-written dictionary, then the
 * machine cache, then English. A language somebody has authored beats
 * the machine, a machine translation beats nothing, and a key that has
 * reached none of them renders the English rather than a blank or a key
 * name — which makes a partly translated site readable instead of holed.
 *
 * Async because two of those layers are a row in the database. One query
 * per render, not one per string.
 */
export async function getTranslations(): Promise<{ locale: Locale; t: Translate }> {
  const locale = getLocale();
  const english = DICTIONARIES[DEFAULT_LOCALE] ?? {};

  if (locale === DEFAULT_LOCALE) {
    return { locale, t: lookup([english]) };
  }

  const authored = isAuthored(locale) ? DICTIONARIES[locale] : undefined;

  let cached: Record<string, string> = {};
  try {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('fn_translations', { p_locale: locale });
    cached = (data as Record<string, string> | null) ?? {};
  } catch {
    /* A cache we cannot read is a site in English, not a site that is
       down. The translation layer never takes a page with it. */
  }

  const layers = [authored, cached, english].filter(Boolean) as Record<string, string>[];
  return { locale, t: lookup(layers) };
}

function lookup(layers: Record<string, string>[]): Translate {
  return (key, vars) => {
    let text = key;
    for (const layer of layers) {
      const hit = layer[key];
      if (hit) {
        text = hit;
        break;
      }
    }
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, value);
      }
    }
    return text;
  };
}

/** The city slug the visitor's location resolved to, if they shared one. */
export function getCityPreference(): string | null {
  return cookies().get(COOKIE.city)?.value ?? null;
}

/** Whether the welcome card has had its answer. */
export function hasBeenAsked(): boolean {
  return cookies().get(COOKIE.asked)?.value === '1';
}

/**
 * Languages the footer switcher offers: the hand-written ones, plus any
 * the machine has already filled. Not every language in the world —
 * only the ones this site can actually speak today.
 */
export async function availableLocales(): Promise<string[]> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('locale_request')
      .select('locale')
      .not('generated_at', 'is', null);

    const generated = ((data as { locale: string }[] | null) ?? []).map((r) => r.locale);
    return [...new Set([...AUTHORED_LOCALES, ...generated])];
  } catch {
    return [...AUTHORED_LOCALES];
  }
}

/** Whether we could show this language, given a key and a cache. */
export function couldTranslate(): boolean {
  return canMachineTranslate();
}
