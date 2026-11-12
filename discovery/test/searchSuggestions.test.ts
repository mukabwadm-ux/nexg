import test from 'node:test';
import assert from 'node:assert/strict';
import { matchScore, PROMOTION_BOOST, rankByMatch, suggestionList, taxonomySuggestions } from '../src/data/searchSuggestions';

// Isolated ranking controls (owner, 12 Nov 2026): names below are examples, never catalog data.
test('letters rank by how closely and how early they match, in order', () => {
  const score = (name: string) => matchScore(name, 'ugali');
  assert.ok(score('Ugali')! > score('Ugali & sukuma')!, 'the exact name comes first');
  assert.ok(score('Ugali & sukuma')! > score('Beef stew with ugali')!, 'a name that starts with it beats one with it as a word');
  assert.ok(score('Beef stew with ugali')! > score('Mugali special')!, 'a word that starts with it beats one that only contains it');
  assert.ok(score('Mugali special')! > score('Uga Lime Bar')!, 'contained beats letters in order with gaps');
  assert.equal(matchScore('Chapati', 'ugali'), undefined, 'letters out of order or missing never match');
  assert.ok(matchScore('Ugali', 'ugli')! > matchScore('Uga Lime Bar', 'ugli')!, 'fewer, shorter gaps rank higher');
  assert.equal(matchScore('Café Jua', 'CAFE'), matchScore('cafe jua', 'cafe'), 'case and accents are ignored');
});

test('promoted stores rise above a similar match but never above a much closer one', () => {
  const stores = [
    { name: 'Grill Ugali Corner', featured: true },
    { name: 'Ugali House', featured: false },
    { name: 'Mama Ugali Grill', featured: false },
    { name: 'Chapati Place', featured: true },
  ];
  const ranked = rankByMatch(stores, 'ugali', (store) => store.name, (store) => store.featured).map((store) => store.name);
  assert.deepEqual(ranked, ['Ugali House', 'Grill Ugali Corner', 'Mama Ugali Grill'], 'a store without the letters is dropped, even if promoted');
  assert.ok(PROMOTION_BOOST < matchScore('Ugali House', 'ugali')! - matchScore('Mugali', 'ugali')!, 'the boost is smaller than the gap between starts-with and contains');
});

test('the box lists search first, then categories, stores and items', () => {
  assert.equal(taxonomySuggestions('bakery')[0]?.label, 'Bakery');
  assert.deepEqual(taxonomySuggestions('bowl').map((entry) => entry.label), ['Bowling']);
  assert.equal(taxonomySuggestions('rest')[0]?.label, 'Restaurants & Food');
  assert.deepEqual(taxonomySuggestions('   '), []);
  const list = suggestionList('ugali', {
    merchants: [{ id: 'm1', name: 'Ugali House', context: 'Restaurant · Westlands' }],
    items: [{ merchantId: 'm2', merchantName: 'Sokoni Grill House', itemId: 'i1', name: 'Ugali', price: 100 }],
  });
  assert.deepEqual(list.map((entry) => entry.kind), ['search', 'merchant', 'item']);
  assert.deepEqual(list.at(-1), { kind: 'item', key: 'item:i1', label: 'Ugali', context: 'Sokoni Grill House', merchantId: 'm2', itemId: 'i1', price: 100 });
  assert.deepEqual(suggestionList('', undefined), []);
});
