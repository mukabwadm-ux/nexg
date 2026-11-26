import type { BridgeMapRow } from './catalogBridge.js';

/** Master taxonomy source groups. Mapping is navigation, never booking capability.
 * Legacy flights rows must be migrated by the source, not silently exposed here.
 * Scenic/safari share Flight & Hotel Bookings; helicopter/private share Private Jet Charters.
 */
const groups = [
  ['travel_tours', 'Travels & Tours', 'flight_hotel_bookings', 'Flight & Hotel Bookings'],
  ['premium_services', 'Premium Services & Reservations', 'private_jet_charters', 'Private Jet Charters'],
  ['experiences', 'Experiences', 'cinemas', 'Cinemas'],
] as const;

export const platformCatalogueRows: readonly BridgeMapRow[] = groups.map(([category, categoryLabel, subcategory, label]) => {
  const slug = subcategory.replaceAll('_', '-');
  const discoveryCategory = category.replaceAll('_', '-');
  return {
    demoSubcategoryId: discoveryCategory + '_' + slug,
    demoLabel: label,
    demoCategoryId: discoveryCategory,
    demoCategoryLabel: categoryLabel,
    supabase: { category, subcategory },
    discovery: { categoryId: discoveryCategory, subcategoryId: discoveryCategory + ':' + slug },
    status: 'mapped',
  };
});

/** Keep reviewed source rows; append missing canonical groups only. Applying twice is stable. */
export function withPlatformCatalogueRows(rows: readonly BridgeMapRow[]): BridgeMapRow[] {
  const key = (row: BridgeMapRow) => row.supabase.category + '/' + row.supabase.subcategory;
  const existing = new Set(rows.map(key));
  return [...rows, ...platformCatalogueRows.filter(row => !existing.has(key(row)))];
}
