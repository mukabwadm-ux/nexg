/**
 * Merchant categories as the Merchants screens draw them.
 *
 * The full label comes from category_config (the database); the designs put
 * a one-word version in the table chips ("Food", "Groceries"), which is
 * what `shortCategory` gives. The tabs along the top of Catalogues,
 * Performance and Payouts group categories the way the designs do; the
 * grouping follows category_config.card_kind where it can (menu → Food &
 * Beverages, services → Services) and splits the rest as drawn.
 */

const SHORT: Record<string, string> = {
  restaurants_food: 'Food',
  restaurant: 'Food',
  alcohol_beverages: 'Drinks',
  bar_liquor: 'Drinks',
  pharmacy: 'Pharmacy',
  laundry_cleaning: 'Laundry',
  laundry: 'Laundry',
  airport_transfers: 'Transfers',
  travel_tours: 'Tours',
  experiences: 'Experiences',
  adults_only: 'Adult',
  games_sports: 'Sports',
  beauty: 'Beauty',
  beauty_fashion: 'Beauty',
  wellness: 'Wellness',
  concierge_services: 'Concierge',
  movers_relocation: 'Movers',
  premium_services: 'Premium',
  vehicle_rentals: 'Car hire',
  vehicle_services: 'Vehicles',
  fashion_apparel: 'Apparel',
  groceries_essentials: 'Groceries',
  supermarket: 'Groceries',
  marketplace: 'Marketplace',
  tech_electronics: 'Electronics',
  flowers_gifts: 'Flowers',
  florist: 'Flowers',
  gift_shop: 'Gifts',
  logistics_shipping: 'Courier',
  financial_services: 'Finance',
  health: 'Health',
  flights: 'Flights',
  other: 'Other',
};

/** "Food", "Groceries": the chip label for a category key, else its full label. */
export function shortCategory(key: string | null | undefined, label?: string | null): string {
  if (key && SHORT[key]) return SHORT[key]!;
  return label?.trim() || 'Other';
}

export type CategoryGroup =
  | 'all'
  | 'food'
  | 'stays'
  | 'experiences'
  | 'groceries'
  | 'apparel'
  | 'services'
  | 'more';

/** Which design tab a category key belongs to. Stays are hosts, never merchants. */
const GROUP_OF: Record<string, Exclude<CategoryGroup, 'all' | 'stays'>> = {
  restaurants_food: 'food',
  restaurant: 'food',
  alcohol_beverages: 'food',
  bar_liquor: 'food',
  experiences: 'experiences',
  travel_tours: 'experiences',
  games_sports: 'experiences',
  groceries_essentials: 'groceries',
  supermarket: 'groceries',
  fashion_apparel: 'apparel',
  laundry_cleaning: 'services',
  laundry: 'services',
  airport_transfers: 'services',
  wellness: 'services',
  concierge_services: 'services',
  movers_relocation: 'services',
  premium_services: 'services',
  vehicle_rentals: 'services',
  vehicle_services: 'services',
  logistics_shipping: 'services',
  financial_services: 'services',
};

export function categoryGroup(
  key: string | null | undefined,
): Exclude<CategoryGroup, 'all' | 'stays'> {
  return (key && GROUP_OF[key]) || 'more';
}

/** The category keys in a group, for filtering in SQL. Null for "all". */
export function groupKeys(group: CategoryGroup): string[] | null {
  if (group === 'all') return null;
  if (group === 'stays') return [];
  if (group === 'more') {
    return Object.keys(SHORT).filter((k) => !GROUP_OF[k]);
  }
  return Object.entries(GROUP_OF)
    .filter(([, g]) => g === group)
    .map(([k]) => k);
}

export function isCategoryGroup(value: unknown): value is CategoryGroup {
  return (
    typeof value === 'string' &&
    ['all', 'food', 'stays', 'experiences', 'groceries', 'apparel', 'services', 'more'].includes(
      value,
    )
  );
}

/**
 * merchant.cover_photo_path holds an image address the merchant gave us
 * (often their own site's preview image), not a storage path. Only a
 * plain https address is drawn; anything else falls back to initials.
 */
export function merchantPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https:\/\/[^\s"'<>]+$/i.test(path.trim()) ? path.trim() : null;
}
