import { categories, findCategory } from './taxonomy';

/** Preliminary catalog-group fallback. Final intent-led merchandising requires executable fact predicates. */
export function collectionDefinitions(categoryId: string) {
  return (findCategory(categoryId)?.subcategories ?? []).filter((subcategory) => subcategory.sourceIds.length).map((subcategory) => ({
    id: `${categoryId}:collection:${subcategory.id}`,
    title: subcategory.label,
    subcategoryId: subcategory.id,
    minimumDistinctMerchants: 2,
    // Restaurant also contains the mapped Cloud Kitchen source group. Show both
    // complete five-merchant groups in the food preview instead of truncating at 6.
    maximumMerchants: categoryId === 'restaurants-food' && subcategory.sourceIds.includes('restaurants-food_cloud-kitchen') ? 10 : 6,
  }));
}

export const catalogCategoryKeys = categories.map((category) => category.id);
