import { describe, expect, it } from 'vitest';

import { categoryTiles, POPULAR_CATEGORIES, TILE_IDS } from './categories';

const t = (key: string) => key;
const configured = [
  { category: 'flowers_gifts', label: 'Flowers & Gifts', image_path: null },
  { category: 'laundry_cleaning', label: 'Laundry & Cleaning', image_path: null },
];

describe('categoryTiles', () => {
  it('keeps the usual order when nothing has been tapped yet', () => {
    expect(categoryTiles(t, configured).map((tile) => tile.tile)).toEqual(
      POPULAR_CATEGORIES.map((item) => item.image),
    );
  });

  it('puts the most tapped tiles first and keeps the usual order for ties', () => {
    const order = categoryTiles(t, configured, { laundry: 40, airport: 12, beauty: 12 }).map(
      (tile) => tile.tile,
    );
    expect(order.slice(0, 3)).toEqual(['laundry', 'beauty', 'airport']);
    expect(order.slice(3)).toEqual(
      POPULAR_CATEGORIES.map((item) => item.image).filter(
        (id) => !['laundry', 'beauty', 'airport'].includes(id),
      ),
    );
  });

  it('never shows one configured label on two tiles', () => {
    const labels = categoryTiles(t, configured).map((tile) => tile.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('home.pc.flowers');
    expect(labels).toContain('home.pc.gifts');
    expect(labels).toContain('Laundry & Cleaning');
  });

  it('counts taps only for tiles that exist', () => {
    expect(TILE_IDS).toContain('restaurants');
    expect(TILE_IDS).not.toContain('home.pc.restaurants');
    expect(new Set(TILE_IDS).size).toBe(TILE_IDS.length);
  });
});
