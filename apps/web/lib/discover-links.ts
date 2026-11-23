/**
 * Links into Discovery (`/discover`), which replaced the Explore pages (owner, 12 Nov 2026).
 *
 * Discovery's pages are query strings on one address (`?merchant=`, `?item=`, `?category=`, `?q=`).
 * Old `/explore` URLs redirect here through the same helpers, so shared links keep working.
 */
export const DISCOVER_PATH = '/discover';

/**
 * Supabase category keys to Discovery's category ids: the 22 categories of the master list (owner, 16 Nov 2026; Pets added 23 Nov 2026),
 * the keys it retired (where their merchants moved), and the original merchant_category enum values.
 * `discover-links.test.ts` checks this against Discovery's reviewed subcategory map.
 */
export const DISCOVERY_CATEGORY: Record<string, string> = {
  restaurants_food: 'restaurants-food',
  alcohol_beverages: 'alcohol-beverages',
  pharmacy: 'pharmacy',
  laundry_cleaning: 'laundry-cleaning',
  airport_transfers: 'airport-transfers',
  travel_tours: 'travel-tours',
  experiences: 'experiences',
  adults_only: 'adults-only',
  games_sports: 'games-sports',
  beauty: 'beauty',
  wellness: 'wellness',
  concierge_services: 'concierge-services',
  movers_relocation: 'movers-relocation',
  premium_services: 'premium-services',
  vehicle_rentals: 'vehicle-rentals',
  fashion_apparel: 'fashion-apparel',
  groceries_essentials: 'groceries-essentials',
  marketplace: 'marketplace',
  pets: 'pets',
  tech_electronics: 'tech-electronics',
  flowers_gifts: 'flowers-gifts',
  logistics_shipping: 'courier-services',
  // Retired by the master list (its retiredCategories): where their merchants moved.
  health: 'pharmacy',
  financial_services: 'concierge-services',
  vehicle_services: 'vehicle-rentals',
  flights: 'travel-tours',
  other: 'marketplace',
  activities_games_sports: 'games-sports',
  // Subcategory keys the master list moved into a new category: old links land there.
  pet_supplies: 'pets',
  // Original merchant_category enum values.
  restaurant: 'restaurants-food',
  bar_liquor: 'alcohol-beverages',
  laundry: 'laundry-cleaning',
  florist: 'flowers-gifts',
  beauty_fashion: 'beauty',
  supermarket: 'groceries-essentials',
  gift_shop: 'flowers-gifts',
};

function withParams(params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return search.size ? `${DISCOVER_PATH}?${search}` : DISCOVER_PATH;
}

/** A merchant's store in Discovery, optionally opened on one item. No merchant opens Discovery. */
export function discoverMerchantHref(
  merchantId: string | null | undefined,
  itemId?: string | null,
): string {
  return merchantId ? withParams({ merchant: merchantId, item: itemId }) : DISCOVER_PATH;
}

/**
 * Discovery opened on a category, from a Supabase key or a Discovery id. An unknown category
 * opens Discovery's home rather than an empty or broken filter.
 */
export function discoverCategoryHref(
  category?: string | null,
  options: { search?: string | null } = {},
): string {
  const id = category
    ? (DISCOVERY_CATEGORY[category] ??
      (Object.values(DISCOVERY_CATEGORY).includes(category) ? category : undefined))
    : undefined;
  return withParams({ category: id, q: options.search?.trim() || undefined });
}
