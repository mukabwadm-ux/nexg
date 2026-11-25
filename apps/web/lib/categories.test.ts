import { describe, expect, it } from 'vitest';

import {
  countedCategory,
  MIN_CATEGORY_SIGNALS,
  pinnedPriorities,
  popularTiles,
  PRIORITY_CATEGORIES,
  TILE_COUNT,
} from './categories';

const t = (key: string) => key;
const ACTIVE = [
  'restaurants_food',
  'alcohol_beverages',
  'pharmacy',
  'laundry_cleaning',
  'airport_transfers',
  'travel_tours',
  'experiences',
  'games_sports',
  'beauty',
  'wellness',
  'groceries_essentials',
  'pets',
  'tech_electronics',
  'flowers_gifts',
];
const configured = ACTIVE.map((category) => ({ category, label: `Label ${category}` }));
const order = (signals: Record<string, number> = {}) =>
  popularTiles(t, configured, signals).map((tile) => tile.category);

describe('popularTiles', () => {
  it('leads with the five priorities, in order, with no data', () => {
    expect(order().slice(0, 5)).toEqual([...PRIORITY_CATEGORIES]);
    expect(order()).toHaveLength(TILE_COUNT);
  });

  it('keeps the fixed order while the counts are thin', () => {
    /* Today's live counts (2026-11-25): 30 taps in 30 days. */
    expect(order({ airport: 7, gifts: 7, laundry: 6, restaurants: 4, pharmacy: 1 })).toEqual(
      order(),
    );
    expect(order({ tech_electronics: 299 })).toEqual(order());
  });

  it('lets the ranking in gradually, keeping the first priorities pinned', () => {
    const busy = { tech_electronics: 250, wellness: 60 };
    expect(order(busy).slice(0, 5)).toEqual([
      'restaurants_food',
      'laundry_cleaning',
      'pharmacy',
      'tech_electronics',
      'wellness',
    ]);
    expect(order({ tech_electronics: 700 })[0]).toBe('restaurants_food');
    expect(order({ tech_electronics: 700 })[1]).toBe('tech_electronics');
    expect(order({ tech_electronics: 900, wellness: 150 }).slice(0, 2)).toEqual([
      'tech_electronics',
      'wellness',
    ]);
  });

  it('ignores a category with too few of its own', () => {
    const tiles = order({ tech_electronics: 400, pets: MIN_CATEGORY_SIGNALS - 1 });
    expect(tiles).not.toContain('pets');
  });

  it('shows only active categories', () => {
    const tiles = popularTiles(
      t,
      configured.filter((row) => row.category !== 'beauty'),
    );
    expect(tiles.map((tile) => tile.category)).not.toContain('beauty');
    expect(order({ marketplace: 2000 })).not.toContain('marketplace');
    expect(order({ games_sports: 2000 })[0]).toBe('games_sports');
  });

  it('uses the translated tile name, else the configured one', () => {
    const tiles = popularTiles(t, configured);
    expect(tiles[0]?.label).toBe('Label restaurants_food');
    const say = (key: string) => (key === 'home.pc.laundry' ? 'Laundry' : key);
    expect(popularTiles(say, configured)[1]?.label).toBe('Laundry');
  });
});

describe('counting', () => {
  it('folds old tile names and aliases into their category', () => {
    expect(countedCategory('gifts')).toBe('flowers_gifts');
    expect(countedCategory('airport')).toBe('airport_transfers');
    expect(countedCategory('restaurant')).toBe('restaurants_food');
    for (const id of PRIORITY_CATEGORIES) expect(countedCategory(id)).toBe(id);
    expect(countedCategory('not-a-category')).toBeUndefined();
  });

  it('pins all five below 300, then three, one and none', () => {
    expect(pinnedPriorities(0)).toBeNull();
    expect(pinnedPriorities(299)).toBeNull();
    expect(pinnedPriorities(300)).toBe(3);
    expect(pinnedPriorities(600)).toBe(1);
    expect(pinnedPriorities(1000)).toBe(0);
  });
});
