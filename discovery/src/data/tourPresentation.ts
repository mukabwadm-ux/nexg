import type { Merchant } from '../providers/DiscoveryProvider';
import { findCategory } from './taxonomy';

// A Discovery subcategory ID (engine mode) or one of its source groups (Supabase and platform modes).
function tourSubcategory(merchant: Merchant) {
  return findCategory('travel-tours')?.subcategories.find((entry) => merchant.subcategoryId
    && (entry.id === merchant.subcategoryId || entry.sourceIds.includes(merchant.subcategoryId)));
}

/** Only recognized subcategories can open an operator or direct trip page. */
export function isTourOperator(merchant: Merchant): boolean {
  return Boolean(tourSubcategory(merchant));
}

export function tourLabel(merchant: Merchant): string | undefined {
  const subcategory = tourSubcategory(merchant);
  return subcategory?.options.find((entry) => merchant.subcategoryId && entry.sourceIds.includes(merchant.subcategoryId))?.label ?? subcategory?.label;
}
