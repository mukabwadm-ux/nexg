import { cookies } from 'next/headers';

import {
  DEFAULT_LOCALE,
  isSupported,
  translator,
  type Locale,
  type Translate,
} from './dictionaries';

export {
  DEFAULT_LOCALE,
  DICTIONARIES,
  isSupported,
  LOCALES,
  LOCALE_NAMES,
  pickLocale,
  translator,
  type Locale,
  type Translate,
} from './dictionaries';

/** The cookies this feature owns, named in one place. */
export const COOKIE = {
  /** The language the visitor agreed to be shown. */
  locale: 'nexg_locale',
  /** The city their location resolved to, as a slug. */
  city: 'nexg_city',
  /** That they have been asked. Its presence is what dismisses the card. */
  asked: 'nexg_asked',
} as const;

/** A year. Long enough that we are not asking again every week. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The locale for this request, from the cookie the visitor's answer set.
 *
 * Deliberately not the Accept-Language header. The header says what the
 * browser prefers; it says nothing about whether this person agreed to
 * be shown it, and the whole point of the welcome card is that we ask
 * first. No cookie means English.
 */
export function getLocale(): Locale {
  const value = cookies().get(COOKIE.locale)?.value;
  return isSupported(value) ? value : DEFAULT_LOCALE;
}

/** The locale and its translator, for a server component. */
export function getTranslations(): { locale: Locale; t: Translate } {
  const locale = getLocale();
  return { locale, t: translator(locale) };
}

/** The city slug the visitor's location resolved to, if they shared one. */
export function getCityPreference(): string | null {
  return cookies().get(COOKIE.city)?.value ?? null;
}

/** Whether the welcome card has had its answer. */
export function hasBeenAsked(): boolean {
  return cookies().get(COOKIE.asked)?.value === '1';
}
