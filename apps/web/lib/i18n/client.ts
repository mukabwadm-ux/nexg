'use client';

import * as React from 'react';

import { DEFAULT_LOCALE, isLocaleTag, translator, type Translate } from './dictionaries';

/**
 * The chosen language in a client component that was not handed one.
 *
 * Reads the same cookie the server does. Renders English on the server and
 * during hydration, then the visitor's language — the server-rendered
 * pages pass `locale` down instead and never flash.
 */
function readLocale(): string {
  const match = document.cookie.match(/(?:^|;\s*)nexg_locale=([^;]+)/);
  const value = match?.[1];
  return isLocaleTag(value) ? value.toLowerCase().split('-')[0]! : DEFAULT_LOCALE;
}

const noop = () => () => {};

export function useClientTranslations(): { locale: string; t: Translate } {
  const locale = React.useSyncExternalStore(noop, readLocale, () => DEFAULT_LOCALE);
  return React.useMemo(() => ({ locale, t: translator(locale) }), [locale]);
}
