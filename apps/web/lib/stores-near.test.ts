import { describe, expect, it } from 'vitest';

import { rankStores, type NearbyStore } from './stores-near';

const KILIMANI = { lat: -1.2921, lng: 36.7856 };

function store(id: string, patch: Partial<NearbyStore> = {}): NearbyStore {
  return {
    id,
    trading_name: id,
    category: 'restaurant',
    category_key: null,
    category_other: null,
    cover_photo_path: null,
    branch_name: null,
    branch_latitude: null,
    branch_longitude: null,
    concierge_pick: false,
    featured: false,
    accepting_orders: true,
    closed_today: false,
    closes_today: null,
    prep_minutes: null,
    listed_at: '2026-01-01',
    ...patch,
  };
}

describe('rankStores', () => {
  const near1 = store('near-1km', { branch_latitude: -1.2921, branch_longitude: 36.7946 });
  const near5 = store('near-5km', { branch_latitude: -1.2921, branch_longitude: 36.8306 });
  const far = store('mombasa', { branch_latitude: -4.0435, branch_longitude: 39.6682 });
  const pick = store('pick', { concierge_pick: true });
  const plain = store('plain', { listed_at: '2026-05-01' });

  it('puts stores near the spot first, nearest first, with their distance', () => {
    const { stores, nearCount } = rankStores([far, near5, pick, near1], KILIMANI);
    expect(nearCount).toBe(2);
    expect(stores.slice(0, 2).map((s) => s.id)).toEqual(['near-1km', 'near-5km']);
    expect(stores[0]!.km).toBeCloseTo(1, 0);
    expect(stores.find((s) => s.id === 'mombasa')!.km).toBeNull();
  });

  it("tops the row up with Nairobi's usual stores so it is never empty", () => {
    const { stores, nearCount } = rankStores([plain, far, pick], KILIMANI);
    expect(nearCount).toBe(0);
    expect(stores.map((s) => s.id)).toEqual(['pick', 'plain', 'mombasa']);
  });

  it('without a spot, shows the usual Nairobi order', () => {
    const { stores, nearCount } = rankStores([near1, plain, pick], null);
    expect(nearCount).toBe(0);
    expect(stores[0]!.id).toBe('pick');
  });

  it('lists open stores before closed ones nearby', () => {
    const closed = store('closed-near', {
      branch_latitude: -1.2921,
      branch_longitude: 36.787,
      closed_today: true,
    });
    const { stores } = rankStores([closed, near5], KILIMANI);
    expect(stores.map((s) => s.id).slice(0, 2)).toEqual(['near-5km', 'closed-near']);
  });
});
