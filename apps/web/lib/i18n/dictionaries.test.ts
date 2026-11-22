import { describe, expect, it } from 'vitest';

import {
  AUTHORED_LOCALES,
  dirFor,
  DICTIONARIES,
  ENGLISH,
  pickLocale,
  translator,
} from './dictionaries';
import { LOCALE_SCRIPT } from './script';

const placeholders = (text: string) => (text.match(/\{[a-z]+\}/g) ?? []).sort();

describe('dictionaries', () => {
  it.each(AUTHORED_LOCALES.filter((l) => l !== 'en'))('%s has every English key', (locale) => {
    const dictionary = DICTIONARIES[locale] ?? {};
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(ENGLISH).sort());
  });

  it.each(AUTHORED_LOCALES)('%s keeps every placeholder', (locale) => {
    const dictionary = DICTIONARIES[locale] ?? {};
    for (const [key, english] of Object.entries(ENGLISH)) {
      const text = dictionary[key];
      if (text === undefined) continue;
      expect(placeholders(text), `${locale} ${key}`).toEqual(placeholders(english));
      expect(text.trim(), `${locale} ${key}`).not.toBe('');
    }
  });

  it('answers regional tags with the authored language', () => {
    expect(pickLocale(['zh-CN'])).toBe('zh');
    expect(pickLocale(['pt-BR', 'en'])).toBe('pt');
    expect(pickLocale(['ar-AE'])).toBe('ar');
    expect(translator('fr')('nav.signIn')).not.toBe('Sign in');
  });

  it('writes Arabic right to left and the rest left to right', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('ar-EG')).toBe('rtl');
    expect(dirFor('fr')).toBe('ltr');
    expect(dirFor(undefined)).toBe('ltr');
  });
});

describe('LOCALE_SCRIPT', () => {
  function run(cookie: string, pathname: string) {
    const documentElement = { lang: 'en', dir: '' };
    new Function('document', 'location', LOCALE_SCRIPT)({ cookie, documentElement }, { pathname });
    return documentElement;
  }

  it('sets lang and dir from the cookie before paint', () => {
    expect(run('nexg_locale=ar', '/')).toEqual({ lang: 'ar', dir: 'rtl' });
    expect(run('x=1; nexg_locale=fr', '/stays')).toEqual({ lang: 'fr', dir: '' });
    expect(run('', '/')).toEqual({ lang: 'en', dir: '' });
  });

  it('keeps the English-only portals left to right', () => {
    expect(run('nexg_locale=ar', '/merchant/home')).toEqual({ lang: 'ar', dir: '' });
  });
});
