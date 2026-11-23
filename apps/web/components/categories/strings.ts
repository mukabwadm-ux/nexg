/*
 * Kept out of category-explorer.tsx: that file is a client component, and a
 * server page importing a value from one gets a reference, not the array.
 */

/** The page's words, translated on the server (lib/i18n dictionaries, cats.*). */
export const CATEGORY_STRING_KEYS = [
  'cats.eyebrow',
  'cats.title',
  'cats.gold',
  'cats.lede',
  'cats.searchPlaceholder',
  'cats.searchLabel',
  'cats.clear',
  'cats.filterLabel',
  'cats.kind.all',
  'cats.kind.menu',
  'cats.kind.products',
  'cats.kind.services',
  'cats.matchOne',
  'cats.matchMany',
  'cats.summaryOne',
  'cats.summaryMany',
  'cats.empty.title',
  'cats.empty.body',
  'cats.askConcierge',
  'cats.showAll',
  'cats.cta.eyebrow',
  'cats.cta.title',
  'cats.cta.body',
  'cats.cta.list',
  'cats.typeOne',
  'cats.typeMany',
  'cats.matches',
  'cats.more',
  'cats.seeWho',
] as const;
