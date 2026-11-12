import type { SearchSuggestions } from '../providers/DiscoveryProvider';
import { categories, type DiscoveryCategory } from './taxonomy';

/** A category's name as its home-page tile says it; the same rules as categoryTitle in CategoryDiscovery.tsx. */
function categoryTitle(category: Pick<DiscoveryCategory, 'id' | 'label'>): string {
  if (category.id === 'travel-tours') return 'Safaris & Tours';
  if (category.id === 'experiences') return 'Experiences & Events';
  if (category.id === 'tech-electronics') return 'Electronics';
  return category.label.replace(/\s+and\s+/gi, ' & ');
}

/**
 * Suggestions under the search box (owner, 12 Nov 2026: "i should get suggestions just below my search immediately").
 * Categories and subcategories match instantly from the taxonomy; stores and items come from the provider.
 * Plain TypeScript, so NEXG APP can reuse it.
 */
export type Suggestion =
  | { kind: 'search'; key: string; label: string; search: string }
  | { kind: 'category'; key: string; label: string; categoryId: string }
  | { kind: 'subcategory'; key: string; label: string; context: string; categoryId: string; subcategoryId: string }
  | { kind: 'merchant'; key: string; label: string; context?: string; merchantId: string }
  | { kind: 'item'; key: string; label: string; context: string; price?: number; merchantId: string; itemId: string };

/** Case and accents ignored, so "cafe" finds "Café". */
export const foldSearch = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-KE').trim();

/**
 * How well a name matches what was typed (owner, 12 Nov 2026: rank by the matching letters and their order).
 * The name starts with it, then a word in it starts with it, then it contains it (earlier is better), then its letters
 * appear in the same order with gaps (fewer and shorter gaps are better). Undefined when the letters aren't there in order.
 */
export function matchScore(name: string, search: string): number | undefined {
  const label = foldSearch(name);
  const term = foldSearch(search).replace(/\s+/g, ' ');
  if (!term || !label) return undefined;
  if (label === term) return 120;
  if (label.startsWith(term)) return 100;
  const at = label.indexOf(term);
  if (at > 0 && /[\s&,/(-]/.test(label[at - 1]!)) return 90 - Math.min(at, 20) / 2;
  if (at > 0) return 70 - Math.min(at, 20) / 2;
  // Letters in order: each typed letter found after the previous one; spaces typed are skipped.
  let position = -1; let gaps = 0; let spread = 0;
  for (const letter of term.replace(/\s/g, '')) {
    const next = label.indexOf(letter, position + 1);
    if (next < 0) return undefined;
    if (position >= 0 && next > position + 1) { gaps += 1; spread += next - position - 1; }
    position = next;
  }
  return Math.max(1, 50 - gaps * 6 - Math.min(spread, 30));
}

/** Promoted (featured) stores rise above an equal or slightly better plain match, never above a much closer one. */
export const PROMOTION_BOOST = 12;

/** Sorts candidates best first: letter match plus promotion, then name. Drops candidates whose letters don't match. */
export function rankByMatch<T>(candidates: readonly T[], search: string, name: (candidate: T) => string, promoted: (candidate: T) => boolean = () => false): T[] {
  return candidates.flatMap((candidate) => {
    const score = matchScore(name(candidate), search);
    return score === undefined ? [] : [{ candidate, score: score + (promoted(candidate) ? PROMOTION_BOOST : 0) }];
  }).sort((left, right) => right.score - left.score || name(left.candidate).localeCompare(name(right.candidate), 'en-KE')).map((entry) => entry.candidate);
}

/** A label matches when the typed text starts it or starts one of its words; starts rank first. */
function rank(label: string, term: string): number | undefined {
  const folded = foldSearch(label);
  if (folded.startsWith(term)) return 0;
  if (folded.split(/[\s&,/-]+/).some((word) => word.startsWith(term))) return 1;
  return undefined;
}

/** Up to `limit` categories and subcategories whose names match, best first, then in navigation order. */
export function taxonomySuggestions(search: string, limit = 4): Suggestion[] {
  const term = foldSearch(search);
  if (!term) return [];
  const found: { rank: number; order: number; suggestion: Suggestion }[] = [];
  let order = 0;
  for (const category of categories) {
    const title = categoryTitle(category);
    const own = rank(title, term) ?? rank(category.label, term);
    if (own !== undefined) found.push({ rank: own, order: order++, suggestion: { kind: 'category', key: `category:${category.id}`, label: title, categoryId: category.id } });
    for (const subcategory of category.subcategories) {
      const match = rank(subcategory.label, term);
      if (match === undefined) continue;
      found.push({ rank: match, order: order++, suggestion: { kind: 'subcategory', key: `subcategory:${subcategory.id}`, label: subcategory.label, context: title, categoryId: category.id, subcategoryId: subcategory.id } });
    }
  }
  return found.sort((left, right) => left.rank - right.rank || left.order - right.order).slice(0, limit).map((entry) => entry.suggestion);
}

/** The full list in display order: search for the text, then categories, stores and items. */
export function suggestionList(search: string, remote: SearchSuggestions | undefined): Suggestion[] {
  const text = search.trim();
  if (!text) return [];
  const merchants = (remote?.merchants ?? []).map((merchant): Suggestion => ({
    kind: 'merchant', key: `merchant:${merchant.id}`, label: merchant.name, merchantId: merchant.id, ...(merchant.context ? { context: merchant.context } : {}) }));
  const items = (remote?.items ?? []).map((item): Suggestion => ({
    kind: 'item', key: `item:${item.itemId}`, label: item.name, context: item.merchantName, merchantId: item.merchantId, itemId: item.itemId, ...(item.price ? { price: item.price } : {}) }));
  return [{ kind: 'search', key: 'search', label: text, search: text }, ...taxonomySuggestions(text), ...merchants, ...items];
}
