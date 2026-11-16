/**
 * The categories shown as photo tiles on the homepage (Popular categories)
 * and on /categories.
 *
 * Each opens Explore filtered to a merchant category, or goes to a fixed
 * destination for things a concierge arranges rather than a merchant sells.
 * Photos are CC0; provenance in public/images/categories/CREDITS.md. The
 * list grows with the merchant catalogue.
 */
export const POPULAR_CATEGORIES = [
  { key: 'home.pc.restaurants', image: 'restaurants', category: 'restaurants_food' },
  { key: 'home.pc.groceries', image: 'groceries', category: 'groceries_essentials' },
  { key: 'home.pc.pharmacy', image: 'pharmacy', category: 'pharmacy' },
  { key: 'home.pc.beauty', image: 'beauty', category: 'beauty' },
  { key: 'home.pc.drinks', image: 'drinks', category: 'alcohol_beverages' },
  { key: 'home.pc.flowers', image: 'flowers', category: 'flowers_gifts' },
  { key: 'home.pc.laundry', image: 'laundry', category: 'laundry_cleaning' },
  { key: 'home.pc.gifts', image: 'gifts', category: 'flowers_gifts' },
  /* Arranged by a concierge rather than sold by a merchant. */
  { key: 'home.pc.airport', image: 'airport', href: '/ask?need=Airport%20Transfer' },
] as const;

/** Tile ids the click counter accepts: the tile's image name, which is unique. */
export const TILE_IDS: readonly string[] = POPULAR_CATEGORIES.map((item) => item.image);

/**
 * The tiles with their labels translated, as PopularCategories takes them,
 * most tapped first.
 *
 * `clicks` is taps per tile over the last 30 days (rpc_category_tile_popularity).
 * Ties, and a site with no taps yet, keep the order above.
 *
 * Each tile's `category` is a category_config key. Two tiles can share one
 * (Flowers and Gifts are both flowers_gifts). Its label would then appear
 * twice, so those tiles keep their own names.
 */
export function categoryTiles(
  t: (key: string) => string,
  configured: {
    category: string;
    label: string;
    image_path: string | null;
    image_url?: string | null;
  }[] = [],
  clicks: Record<string, number> = {},
) {
  const keys = POPULAR_CATEGORIES.flatMap((item) => ('category' in item ? [item.category] : []));
  const shared = new Set(keys.filter((key, index) => keys.indexOf(key) !== index));
  const tiles = POPULAR_CATEGORIES.map((item) => ({
    key: item.key,
    tile: item.image,
    label:
      ('category' in item &&
        !shared.has(item.category) &&
        configured.find((category) => category.category === item.category)?.label) ||
      t(item.key),
    image: item.image,
    imageUrl:
      'category' in item
        ? configured.find((category) => category.category === item.category)?.image_url
        : null,
    ...('category' in item ? { category: item.category } : { href: item.href }),
  }));
  return tiles
    .map((tile, index) => ({ tile, index, taps: clicks[tile.tile] ?? 0 }))
    .sort((a, b) => b.taps - a.taps || a.index - b.index)
    .map(({ tile }) => tile);
}

export { CATEGORY_IMAGE_MAP, getCategoryImage } from '@nexg/contracts';
