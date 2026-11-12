/**
 * Links into Discovery (`/discover`), which replaced the Explore pages (owner, 12 Nov 2026).
 *
 * Discovery's pages are query strings on one address (`?merchant=`, `?item=`, `?category=`, `?q=`).
 * Old `/explore` URLs redirect here through the same helpers, so shared links keep working.
 */
export const DISCOVER_PATH = '/discover';

/**
 * Supabase category keys (and the original enum values still on older merchants) to Discovery's
 * category ids. `discover-links.test.ts` checks this against Discovery's reviewed subcategory map.
 */
export const DISCOVERY_CATEGORY: Record<string, string> = {
  activities_games_sports: 'play',
  adults_only: 'adults-only',
  airport_transfers: 'airport-transfers',
  alcohol_beverages: 'alcohol-beverages',
  beauty: 'beauty-wellness',
  concierge_services: 'concierge-services',
  experiences: 'experiences',
  fashion_apparel: 'fashion-apparel',
  flowers_gifts: 'flowers-gifts',
  groceries_essentials: 'groceries-essentials',
  health: 'health-pharmacy',
  laundry_cleaning: 'laundry-cleaning',
  marketplace: 'marketplace',
  pharmacy: 'health-pharmacy',
  restaurants_food: 'restaurants-food',
  tech_electronics: 'tech-electronics',
  travel_tours: 'travel-tours',
  vehicle_rentals: 'vehicle-rentals',
  vehicle_services: 'vehicle-rentals',
  wellness: 'beauty-wellness',
  // Original merchant_category enum values.
  restaurant: 'restaurants-food',
  bar_liquor: 'alcohol-beverages',
  laundry: 'laundry-cleaning',
  florist: 'flowers-gifts',
  beauty_fashion: 'beauty-wellness',
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
