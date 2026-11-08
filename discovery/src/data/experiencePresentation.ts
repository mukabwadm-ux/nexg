import type { Merchant } from '../providers/DiscoveryProvider';
import { findCategory } from './taxonomy';

const experiences = findCategory('experiences');

function experienceSubcategory(merchant: Merchant) {
  return experiences?.subcategories.find((subcategory) => merchant.subcategoryId && subcategory.sourceIds.includes(merchant.subcategoryId));
}

/** Route recognized activity/event offerings directly; commissioned photography stays with its provider. */
export function isDirectExperienceMerchant(merchant: Merchant): boolean {
  const subcategory = experienceSubcategory(merchant);
  return Boolean(subcategory && subcategory.id !== 'experiences:photography');
}

/** Display the official nested label when the original source group identifies one. */
export function experienceLabel(merchant: Merchant): string | undefined {
  const subcategory = experienceSubcategory(merchant);
  return subcategory?.options.find((option) => merchant.subcategoryId && option.sourceIds.includes(merchant.subcategoryId))?.label ?? subcategory?.label;
}
