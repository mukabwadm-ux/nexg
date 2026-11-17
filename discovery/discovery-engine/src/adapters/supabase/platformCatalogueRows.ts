import type { BridgeMapRow } from './catalogBridge.js';

/** Platform groups for the operator catalog. The bridge fields preserve its existing wire IDs.
 *  Flights was retired on 16 Nov 2026 (its groups moved to Travels & Tours and Premium Services). */
const groups = [
  ['experiences', 'Experiences', 'cinemas', 'Cinemas'],
] as const;

export const platformCatalogueRows: readonly BridgeMapRow[] = groups.map(([category, categoryLabel, subcategory, label]) => {
  const slug = subcategory.replaceAll('_', '-');
  return {
    demoSubcategoryId: category + '_' + slug,
    demoLabel: label,
    demoCategoryId: category,
    demoCategoryLabel: categoryLabel,
    supabase: { category, subcategory },
    discovery: { categoryId: category, subcategoryId: category + ':' + slug },
    status: 'mapped',
  };
});

/** Add operator-owned groups after parsing the reviewed source map and its console aliases. */
export function withPlatformCatalogueRows(rows: readonly BridgeMapRow[]): BridgeMapRow[] {
  const key = (row: BridgeMapRow) => row.supabase.category + '/' + row.supabase.subcategory;
  const existing = new Set(rows.map(key));
  return [...rows, ...platformCatalogueRows.filter(row => !existing.has(key(row)))];
}
