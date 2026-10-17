import { describe, expect, it } from 'vitest';

import { MERCHANT_TAXONOMY } from '@nexg/contracts';

import { isSupportedSubcategoryField, questionsForSubcategory } from './subcategory-questions';

const categoriesWithTailoredSetup = new Set([
  'adults_only',
  'airport_transfers',
  'fashion_apparel',
  'vehicle_rentals',
  'experiences',
  'financial_services',
  'marketplace',
  'health',
  'tech_electronics',
  'travel_tours',
  'vehicle_services',
  'wellness',
  'concierge_services',
]);

describe('subcategory setup questions', () => {
  it('covers every setup field for each remaining merchant category', () => {
    const categories = MERCHANT_TAXONOMY.filter((category) =>
      categoriesWithTailoredSetup.has(category.id),
    );
    const unsupported = categories.flatMap((category) =>
      category.subcategories.flatMap((subcategory) =>
        subcategory.fields
          .filter((field) => !isSupportedSubcategoryField(field))
          .map((field) => `${category.id}/${subcategory.id}/${field}`),
      ),
    );

    expect(categories).toHaveLength(categoriesWithTailoredSetup.size);
    expect(unsupported).toEqual([]);

    for (const category of categories) {
      for (const subcategory of category.subcategories) {
        expect(subcategory.fields.every(isSupportedSubcategoryField)).toBe(true);
        expect(questionsForSubcategory(subcategory).map((question) => question.key)).toEqual(
          subcategory.fields,
        );
      }
    }
  });
});
