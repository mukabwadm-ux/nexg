import vocabulary from '../../docs/discovery/CATALOG_SECTIONS_V1.json';
import type { CatalogItem, Merchant } from '../providers/DiscoveryProvider';
import { offeringKind, subcategoryOf } from './offeringKinds';

/**
 * Store lists, sectioned one consistent, Wolt-like way for every store (owner, 8 Nov 2026): "Frequently
 * ordered" from real history first, then named sections such as "Desserts", each store type calling its
 * list in its own words (Menu, Aisles, Fleet, Treatments, Trips). Plain TypeScript with no browser code,
 * so the Expo app can reuse it. The vocabulary lives in CATALOG_SECTIONS_V1.json.
 */

/**
 * Where a section came from: the merchant's own menu, the engine, the V1 keyword rules, or real order and
 * booking history ("Frequently ordered", "New").
 */
export type SectionSource = 'catalogue' | 'engine' | 'rules' | 'history';

export interface CatalogSection {
  /** `<scheme>:<section>` for vocabulary sections; `catalogue:<slug>` for the merchant's own. */
  id: string;
  title: string;
  source: SectionSource;
  items: CatalogItem[];
}

interface VocabularySection { id: string; title: string; keywords: string[]; priority?: number }
export interface SectionScheme { id: string; categories: string[]; allTitle: string; sections: VocabularySection[] }
interface Naming { list: string; item: string; items: string; demand: string }
interface Vocabulary {
  version: string; schemes: SectionScheme[]; shared: VocabularySection[]; fallback: { id: string; title: string };
  naming: { default: Naming; byKind: Record<string, Partial<Naming>>; byCategory: Record<string, Partial<Naming>>; bySubcategory: Record<string, Partial<Naming>> };
  signals: { demand: { id: string; limit: number }; new: { id: string; title: string; limit: number } };
}

const { schemes, shared, fallback, naming, signals } = vocabulary as Vocabulary;
/** A history section needs at least this many items, so one stray order doesn't make a section. */
const MIN_HISTORY_ITEMS = 2;
export const sectionVocabularyVersion = (vocabulary as Vocabulary).version;

/** Lower-cased, with accents and curly quotes removed, so "Rosé" matches "rose". */
export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLocaleLowerCase('en-KE');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slug = (text: string) => fold(text).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface Rule { id: string; title: string; order: number; priority?: number; pattern: RegExp }
interface SchemeRules { scheme: SectionScheme; first: Rule[]; rest: Rule[]; byId: Map<string, Rule> }

function compile(scheme: string, section: VocabularySection, order: number): Rule {
  const words = section.keywords.map((keyword) => {
    const word = fold(keyword.trim());
    return word.endsWith('*') ? `${escape(word.slice(0, -1))}[a-z0-9-]*` : escape(word);
  });
  return { id: `${scheme}:${section.id}`, title: section.title, order, priority: section.priority, pattern: new RegExp(`(?:^|[^a-z0-9])(?:${words.join('|')})(?![a-z0-9])`) };
}

const compiled = new Map<string, SchemeRules>();
function rulesFor(scheme: SectionScheme): SchemeRules {
  const cached = compiled.get(scheme.id);
  if (cached) return cached;
  const own = scheme.sections.map((section, index) => compile(scheme.id, section, index));
  const common = shared.map((section, index) => compile(scheme.id, section, scheme.sections.length + index));
  const rules: SchemeRules = {
    scheme,
    first: own.filter((rule) => rule.priority !== undefined).sort((a, b) => a.priority! - b.priority! || a.order - b.order),
    rest: [...own.filter((rule) => rule.priority === undefined), ...common],
    byId: new Map([...own, ...common].map((rule) => [rule.id, rule])),
  };
  compiled.set(scheme.id, rules);
  return rules;
}

/** What a store calls its list and its items, in its own words ("Menu" and "dishes", "Fleet" and "vehicles"). */
export interface CatalogNaming extends Naming {
  /** "1 dish", "30 dishes". */
  count: (value: number) => string;
}

export function catalogNaming(merchant: Pick<Merchant, 'subcategoryId'>): CatalogNaming {
  const match = subcategoryOf(merchant);
  const merged: Naming = {
    ...naming.default,
    ...naming.byKind[offeringKind(merchant)],
    ...(match ? naming.byCategory[match.category.id] : undefined),
    ...(match ? naming.bySubcategory[match.subcategory.id] : undefined),
  };
  return { ...merged, count: (value) => `${value} ${value === 1 ? merged.item : merged.items}` };
}

/** The section scheme for a merchant's Discovery category, if it has one. */
export function sectionScheme(merchant: Pick<Merchant, 'subcategoryId'>): SectionScheme | undefined {
  const category = subcategoryOf(merchant)?.category.id;
  return category ? schemes.find((scheme) => scheme.categories.includes(category)) : undefined;
}

/** The vocabulary section an item name falls in, by the V1 keyword rules. */
export function ruleSection(scheme: SectionScheme, name: string): { id: string; title: string } | undefined {
  const rules = rulesFor(scheme);
  const folded = fold(name);
  const rule = rules.first.find((entry) => entry.pattern.test(folded)) ?? rules.rest.find((entry) => entry.pattern.test(folded));
  return rule && { id: rule.id, title: rule.title };
}

/**
 * Groups a store's items into sections. History sections come first and repeat their items below, as
 * Wolt does: the demand section ("Frequently ordered", "Most booked"...) from real `orders`, then "New".
 * Precedence per item for its own section: the merchant's own section, then a section the engine assigned,
 * then the keyword rules, then "More". Named sections follow the vocabulary's display order (the
 * merchant's own come first, in their order); items keep catalogue order.
 */
export function catalogSections(merchant: Pick<Merchant, 'subcategoryId'>, items: readonly CatalogItem[]): CatalogSection[] {
  const scheme = sectionScheme(merchant);
  const rules = scheme && rulesFor(scheme);
  const groups = new Map<string, { section: CatalogSection; order: number }>();
  const add = (id: string, title: string, source: SectionSource, order: number, item: CatalogItem) => {
    const group = groups.get(id);
    if (!group) groups.set(id, { section: { id, title, source, items: [item] }, order });
    else {
      group.section.items.push(item);
      if (source === 'engine') group.section.source = 'engine';
    }
  };
  items.forEach((item, index) => {
    const own = item.section?.trim();
    if (own) return add(`catalogue:${slug(own) || index}`, own, 'catalogue', index - items.length - 1, item);
    const assigned = item.sectionId ? rules?.byId.get(item.sectionId) : undefined;
    if (assigned) return add(assigned.id, assigned.title, 'engine', assigned.order, item);
    const matched = scheme && ruleSection(scheme, item.name);
    if (matched) return add(matched.id, matched.title, 'rules', rules!.byId.get(matched.id)!.order, item);
    add(`${scheme?.id ?? 'store'}:${fallback.id}`, fallback.title, 'rules', Number.MAX_SAFE_INTEGER, item);
  });
  const sections = [...groups.values()].sort((a, b) => a.order - b.order).map((group) => group.section);
  // A store whose items all fall outside the vocabulary shows one plain section.
  if (sections.length === 1 && sections[0]!.id.endsWith(`:${fallback.id}`)) sections[0] = { ...sections[0]!, title: scheme?.allTitle ?? 'All items' };
  const prefix = scheme?.id ?? 'store';
  const history: CatalogSection[] = [];
  const demand = items.filter((item) => item.isAvailable !== false && typeof item.orders === 'number' && Number.isFinite(item.orders) && item.orders > 0)
    .sort((a, b) => b.orders! - a.orders!).slice(0, signals.demand.limit);
  if (demand.length >= MIN_HISTORY_ITEMS) history.push({ id: `${prefix}:${signals.demand.id}`, title: catalogNaming(merchant).demand, source: 'history', items: demand });
  const fresh = items.filter((item) => item.isNew === true && item.isAvailable !== false).slice(0, signals.new.limit);
  if (fresh.length) history.push({ id: `${prefix}:${signals.new.id}`, title: signals.new.title, source: 'history', items: fresh });
  return [...history, ...sections];
}

/** Keeps the items matching a search, dropping sections left empty and the history sections (they repeat items). */
export function searchSections(sections: readonly CatalogSection[], term: string): CatalogSection[] {
  const query = fold(term.trim());
  if (!query) return [...sections];
  return sections
    .filter((section) => section.source !== 'history')
    .map((section) => ({ ...section, items: section.items.filter((item) => fold(`${item.name} ${item.description ?? ''}`).includes(query)) }))
    .filter((section) => section.items.length > 0);
}

/** The DOM id a section's heading block uses, for the sticky section bar. */
export const sectionAnchor = (section: Pick<CatalogSection, 'id'>) => `section-${section.id.replace(/[^a-z0-9]+/gi, '-')}`;
