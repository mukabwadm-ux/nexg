import test from 'node:test';
import assert from 'node:assert/strict';
import { platformCatalogueRows, withPlatformCatalogueRows } from '../src/adapters/supabase/platformCatalogueRows.ts';

test('canonical flight groups use master source keys and hyphenated Discovery navigation', () => {
  assert.deepEqual(platformCatalogueRows.slice(0, 2).map(row => [row.supabase, row.discovery]), [
    [{category: 'travel_tours', subcategory: 'flight_hotel_bookings'}, {categoryId: 'travel-tours', subcategoryId: 'travel-tours:flight-hotel-bookings'}],
    [{category: 'premium_services', subcategory: 'private_jet_charters'}, {categoryId: 'premium-services', subcategoryId: 'premium-services:private-jet-charters'}],
  ]);
});

test('merged flight specialties produce two source groups, not duplicated canonical rows', () => {
  const rows = withPlatformCatalogueRows([]);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(row => row.supabase.category + '/' + row.supabase.subcategory)).size, rows.length);
  assert.deepEqual(withPlatformCatalogueRows(rows), rows);
});

test('reviewed canonical source identity and mapping take precedence without mutation', () => {
  const reviewed = {...platformCatalogueRows[0], demoSubcategoryId: 'reviewed-stable-source-id'};
  const input = [reviewed];
  const rows = withPlatformCatalogueRows(input);
  assert.equal(rows[0], reviewed);
  assert.equal(rows.filter(row => row.supabase.subcategory === 'flight_hotel_bookings').length, 1);
  assert.deepEqual(input, [reviewed]);
});

test('retired source keys are not advertised or silently aliased into bookable inventory', () => {
  for (const specialty of ['helicopter_charters', 'private_charters', 'scenic_flights', 'safari_flights']) {
    assert.equal(platformCatalogueRows.some(row => row.supabase.category === 'flights' || row.supabase.subcategory === specialty), false);
  }
  for (const row of platformCatalogueRows) {
    assert.deepEqual(Object.keys(row).sort(), ['demoCategoryId','demoCategoryLabel','demoLabel','demoSubcategoryId','discovery','status','supabase'].sort());
  }
});

test('unrelated cinema mapping and unmapped reviewed rows remain unchanged', () => {
  assert.deepEqual(platformCatalogueRows[2].discovery, {categoryId: 'experiences', subcategoryId: 'experiences:cinemas'});
  const hidden = {...platformCatalogueRows[0], discovery: null, status: 'unmapped'};
  assert.equal(withPlatformCatalogueRows([hidden])[0], hidden);
});
