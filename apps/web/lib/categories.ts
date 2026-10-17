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

/** The tiles with their labels translated, as PopularCategories takes them. */
export function categoryTiles(t: (key: string) => string) {
  return POPULAR_CATEGORIES.map((item) => ({
    key: item.key,
    label: t(item.key),
    image: item.image,
    ...('category' in item ? { category: item.category } : { href: item.href }),
  }));
}
