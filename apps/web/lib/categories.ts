import { CATEGORY_IMAGE_MAP, currentCategoryId } from '@nexg/contracts';

/**
 * Popular categories on the homepage: photo tiles, each opening Discovery
 * for one category_config category.
 *
 * The owner's five priorities lead while NexG has few customers (2026-11-25).
 * Once enough real taps and searches have been counted over the last 30
 * days, the most wanted categories take over, a few places at a time
 * (`popularTiles`). Photos are CC0; provenance in
 * public/images/categories/CREDITS.md.
 */
export const PRIORITY_CATEGORIES = [
  'restaurants_food',
  'laundry_cleaning',
  'pharmacy',
  'airport_transfers',
  'beauty',
] as const;

/** After the five, until the counts say otherwise. */
const FILL_CATEGORIES = [
  'groceries_essentials',
  'alcohol_beverages',
  'flowers_gifts',
  'travel_tours',
] as const;

/** Tiles shown: one row of nine on desktop. */
export const TILE_COUNT = 9;

/**
 * Taps plus searches over 30 days before the ranking moves anything, and how
 * many priorities stay pinned at the front as the total grows. Below the
 * first step the order is fixed; from 1,000 the ranking decides everything.
 */
export const RANKING_STEPS: readonly { from: number; pinned: number }[] = [
  { from: 300, pinned: 3 },
  { from: 600, pinned: 1 },
  { from: 1000, pinned: 0 },
];

/** A category needs this many of its own before it can move up. */
export const MIN_CATEGORY_SIGNALS = 10;

/** Tile names the homepage counted taps under before 2026-11-25. */
const LEGACY_TILES: Record<string, string> = {
  restaurants: 'restaurants_food',
  groceries: 'groceries_essentials',
  drinks: 'alcohol_beverages',
  flowers: 'flowers_gifts',
  gifts: 'flowers_gifts',
  laundry: 'laundry_cleaning',
  airport: 'airport_transfers',
};

/** Translated names for the usual tiles (lib/i18n, home.pc.*). */
const LABEL_KEYS: Record<string, string> = {
  restaurants_food: 'home.pc.restaurants',
  laundry_cleaning: 'home.pc.laundry',
  pharmacy: 'home.pc.pharmacy',
  airport_transfers: 'home.pc.airport',
  beauty: 'home.pc.beauty',
  groceries_essentials: 'home.pc.groceries',
  alcohol_beverages: 'home.pc.drinks',
};

/** The category a counted key stands for: a category id, an alias or an old tile name. */
export function countedCategory(key: string): string | undefined {
  return LEGACY_TILES[key] ?? currentCategoryId(key);
}

/** How many priorities stay at the front for this many signals; null keeps the fixed order. */
export function pinnedPriorities(total: number): number | null {
  let pinned: number | null = null;
  for (const step of RANKING_STEPS) if (total >= step.from) pinned = step.pinned;
  return pinned;
}

export interface CategoryTile {
  key: string;
  category: string;
  label: string;
  /** The stock photo; imageUrl is one uploaded in the admin. */
  image: string;
  imageUrl?: string | null;
}

/**
 * The tiles to show, in order.
 *
 * `signals` holds the 30-day counts from both counters (taps on tiles and
 * category cards, and searches that led to a category), keyed by whatever
 * was counted; old tile names fold into their category. Only active
 * categories with a photo are shown.
 */
export function popularTiles(
  t: (key: string) => string,
  configured: { category: string; label: string; image_url?: string | null }[] = [],
  signals: Record<string, number> = {},
): CategoryTile[] {
  const scores = new Map<string, number>();
  for (const [key, count] of Object.entries(signals)) {
    const id = countedCategory(key);
    if (id && count > 0) scores.set(id, (scores.get(id) ?? 0) + count);
  }
  const total = [...scores.values()].reduce((sum, count) => sum + count, 0);

  const config = new Map(configured.map((row) => [row.category, row]));
  const shown = (id: string) =>
    (configured.length === 0 || config.has(id)) &&
    Boolean(CATEGORY_IMAGE_MAP[id] || config.get(id)?.image_url);

  const usual: string[] = [...PRIORITY_CATEGORIES, ...FILL_CATEGORIES];
  const pinned = pinnedPriorities(total);
  let order = usual;
  if (pinned !== null) {
    const place = (id: string) => (usual.includes(id) ? usual.indexOf(id) : usual.length);
    const ranked = [...scores]
      .filter(([, count]) => count >= MIN_CATEGORY_SIGNALS)
      .sort(([a, x], [b, y]) => y - x || place(a) - place(b) || a.localeCompare(b))
      .map(([id]) => id);
    order = [...PRIORITY_CATEGORIES.slice(0, pinned), ...ranked, ...usual];
  }

  return [...new Set(order)]
    .filter(shown)
    .slice(0, TILE_COUNT)
    .map((id) => {
      const labelKey = LABEL_KEYS[id];
      const translated = labelKey ? t(labelKey) : '';
      return {
        key: id,
        category: id,
        label:
          (translated && translated !== labelKey ? translated : '') || config.get(id)?.label || id,
        image: CATEGORY_IMAGE_MAP[id] ?? '',
        imageUrl: config.get(id)?.image_url ?? null,
      };
    });
}

export { CATEGORY_IMAGE_MAP, getCategoryImage } from '@nexg/contracts';
