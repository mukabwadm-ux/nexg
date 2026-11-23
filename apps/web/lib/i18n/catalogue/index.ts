import { ar } from './ar';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { pt } from './pt';
import { sw } from './sw';
import { zh } from './zh';

/**
 * The catalogue's words (category names, descriptions, headings and types)
 * in each language, keyed by their English text (./terms.ts says why).
 */
export const CATALOGUE: Record<string, Record<string, string>> = { sw, fr, ar, zh, es, de, pt };

/**
 * A catalogue word in `locale`; the English as written when there is no
 * translation for it (a new or renamed category, or English itself).
 */
export function catalogueTerm(locale: string, english: string): string {
  const base = locale.toLowerCase().split('-')[0] ?? locale;
  return CATALOGUE[base]?.[english.trim()] ?? english;
}
