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
  { key: 'home.pc.restaurants', image: 'restaurants', category: 'restaurant' },
  { key: 'home.pc.groceries', image: 'groceries', category: 'supermarket' },
  { key: 'home.pc.pharmacy', image: 'pharmacy', category: 'pharmacy' },
  { key: 'home.pc.beauty', image: 'beauty', category: 'beauty_fashion' },
  { key: 'home.pc.drinks', image: 'drinks', category: 'bar_liquor' },
  { key: 'home.pc.flowers', image: 'flowers', category: 'florist' },
  { key: 'home.pc.laundry', image: 'laundry', category: 'laundry' },
  { key: 'home.pc.gifts', image: 'gifts', category: 'gift_shop' },
  /* Arranged by a concierge rather than sold by a merchant. */
  { key: 'home.pc.airport', image: 'airport', href: '/ask?need=Airport%20Transfer' },
] as const;

const CONFIG_CATEGORY_BY_TILE: Record<string, string> = {
  restaurant: 'restaurants_food',
  supermarket: 'groceries_essentials',
  pharmacy: 'health',
  beauty_fashion: 'beauty',
  bar_liquor: 'alcohol_beverages',
  florist: 'flowers_gifts',
  laundry: 'laundry_cleaning',
  gift_shop: 'flowers_gifts',
};

/** Tile ids the click counter accepts: the tile's image name, which is unique. */
export const TILE_IDS: readonly string[] = POPULAR_CATEGORIES.map((item) => item.image);

/**
 * The tiles with their labels translated, as PopularCategories takes them,
 * most tapped first.
 *
 * `clicks` is taps per tile over the last 30 days (rpc_category_tile_popularity).
 * Ties, and a site with no taps yet, keep the order above.
 *
 * Two tiles can share one configured category (Flowers and Gifts are both
 * flowers_gifts). Its label would then appear twice, so those tiles keep
 * their own names.
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
  const shared = new Set(
    Object.values(CONFIG_CATEGORY_BY_TILE).filter(
      (config, index, all) => all.indexOf(config) !== index,
    ),
  );
  const tiles = POPULAR_CATEGORIES.map((item) => ({
    key: item.key,
    tile: item.image,
    label:
      ('category' in item &&
        !shared.has(CONFIG_CATEGORY_BY_TILE[item.category]!) &&
        configured.find((category) => category.category === CONFIG_CATEGORY_BY_TILE[item.category])
          ?.label) ||
      t(item.key),
    image: item.image,
    imageUrl:
      'category' in item
        ? configured.find(
            (category) => category.category === CONFIG_CATEGORY_BY_TILE[item.category],
          )?.image_url
        : null,
    ...('category' in item ? { category: item.category } : { href: item.href }),
  }));
  return tiles
    .map((tile, index) => ({ tile, index, taps: clicks[tile.tile] ?? 0 }))
    .sort((a, b) => b.taps - a.taps || a.index - b.index)
    .map(({ tile }) => tile);
}

export { CATEGORY_IMAGE_MAP, getCategoryImage } from '@nexg/contracts';
