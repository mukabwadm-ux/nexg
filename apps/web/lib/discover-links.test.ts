import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DISCOVERY_CATEGORY, discoverCategoryHref, discoverMerchantHref } from './discover-links';

const merchantId = '20000000-0000-4000-8000-000000000002';

describe('Discovery links', () => {
  it('opens a merchant, and an item inside it', () => {
    expect(discoverMerchantHref(merchantId)).toBe(`/discover?merchant=${merchantId}`);
    expect(discoverMerchantHref(merchantId, 'item-1')).toBe(
      `/discover?merchant=${merchantId}&item=item-1`,
    );
  });

  it('translates Supabase and legacy category keys, and drops unknown ones', () => {
    expect(discoverCategoryHref('restaurants_food')).toBe('/discover?category=restaurants-food');
    expect(discoverCategoryHref('bar_liquor')).toBe('/discover?category=alcohol-beverages');
    expect(discoverCategoryHref('travel-tours')).toBe('/discover?category=travel-tours');
    expect(discoverCategoryHref('not_a_category', { search: ' sushi ' })).toBe('/discover?q=sushi');
    expect(discoverCategoryHref()).toBe('/discover');
  });

  it('agrees with Discovery’s reviewed subcategory map', () => {
    const map = JSON.parse(
      readFileSync(resolve(__dirname, '../../../discovery/demo-seed/subcategory-map.json'), 'utf8'),
    ) as {
      subcategories: {
        supabase: { category: string };
        discovery: { categoryId: string } | null;
      }[];
    };
    for (const row of map.subcategories) {
      if (!row.discovery) continue;
      expect([row.supabase.category, DISCOVERY_CATEGORY[row.supabase.category]]).toEqual([
        row.supabase.category,
        row.discovery.categoryId,
      ]);
    }
  });
});
