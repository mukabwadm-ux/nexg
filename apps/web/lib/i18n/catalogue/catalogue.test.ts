import { describe, expect, it } from 'vitest';

import { AUTHORED_LOCALES } from '../dictionaries';

import { CATALOGUE, catalogueTerm } from './index';
import { CATALOGUE_TERMS } from './terms';

describe('catalogue translations', () => {
  it.each(AUTHORED_LOCALES.filter((l) => l !== 'en'))('%s covers every category word', (locale) => {
    const table = CATALOGUE[locale] ?? {};
    expect(Object.keys(table).sort()).toEqual([...CATALOGUE_TERMS].sort());
    for (const [english, translated] of Object.entries(table)) {
      expect(translated.trim(), `${locale} ${english}`).not.toBe('');
    }
  });

  it('falls back to the English as written', () => {
    expect(catalogueTerm('en', 'Food & Restaurant')).toBe('Food & Restaurant');
    expect(catalogueTerm('fr', 'A category added yesterday')).toBe('A category added yesterday');
    expect(catalogueTerm('fr-CA', 'Food & Restaurant')).toBe(CATALOGUE.fr!['Food & Restaurant']);
  });
});
