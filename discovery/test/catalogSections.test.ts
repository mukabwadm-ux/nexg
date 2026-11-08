import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categories } from '../src/data/taxonomy';
import { catalogNaming, catalogSections, ruleSection, searchSections, sectionAnchor, sectionScheme } from '../src/data/catalogSections';
import type { CatalogItem, Merchant } from '../src/providers/DiscoveryProvider';

// Every store's menu is sectioned one consistent way (owner, 8 Nov 2026). These checks read files only.
const vocabulary = JSON.parse(readFileSync('docs/discovery/CATALOG_SECTIONS_V1.json', 'utf8')) as {
  schemes: { id: string; categories: string[]; sections: { id: string; keywords: string[] }[] }[]; shared: { id: string; keywords: string[] }[];
};
const item = (name: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id: name, merchantId: 'merchant-control', name, ...extra });
const titles = (merchant: Pick<Merchant, 'subcategoryId'>, names: string[]) => catalogSections(merchant, names.map((name) => item(name))).map((section) => section.title);
const scheme = (subcategoryId: string) => sectionScheme({ subcategoryId })!;

test('every Discovery category has exactly one section scheme with unique, non-empty sections', () => {
  for (const category of categories) assert.equal(vocabulary.schemes.filter((entry) => entry.categories.includes(category.id)).length, 1, category.id);
  for (const entry of vocabulary.schemes) {
    const ids = [...entry.sections, ...vocabulary.shared].map((section) => section.id);
    assert.equal(new Set(ids).size, ids.length, `${entry.id} repeats a section id`);
    for (const section of [...entry.sections, ...vocabulary.shared]) assert.ok(section.keywords.length && section.keywords.every((word) => word.trim()), `${entry.id}:${section.id}`);
  }
});

test('specific words win over general ones, whatever the display order', () => {
  const cases: [string, string, string][] = [
    ['restaurants-food_café', 'Matcha Latte', 'Tea'],
    ['restaurants-food_juice-bar', 'Acai Bowl', 'Smoothies & bowls'],
    ['restaurants-food_bakery', 'Chicken Pie', 'Savoury bakes'],
    ['restaurants-food_fast-food', 'Chicken Wings', 'Starters & sides'],
    ['restaurants-food_catering', 'Breakfast Catering (per person)', 'Packages & events'],
    ['fashion-apparel_watches', 'Dress Watch', 'Watches'],
    ['fashion-apparel_womens-fashion', 'Denim Jacket', 'Jackets & blazers'],
    ['alcohol-beverages_spirits', 'White Rum', 'Spirits'],
    ['alcohol-beverages_non-alcoholic-drinks', 'Ginger beer 330ml', 'Mixers'],
    ['alcohol-beverages_champagne', 'Rosé Champagne', 'Champagne & sparkling'],
    ['tech-electronics_accessories', 'Phone Case', 'Accessories'],
    ['tech-electronics_smartphones', 'Foldable Smartphone', 'Flagship & foldable phones'],
    ['tech-electronics_smart-devices', 'Smart Speaker', 'Smart home'],
    ['beauty_salon-barber', 'Box braids, medium', 'Hair & barber'],
    ['beauty_haircare', 'Leave-In Cream', 'Haircare'],
    ['vehicle-services_car-wash', 'Monthly Wash Plan', 'Washes'],
    ['vehicle-rentals_car-rental', 'Compact SUV', 'SUVs & 4x4s'],
    ['marketplace_stationery', 'Desk Organizer', 'Stationery & office'],
  ];
  for (const [subcategoryId, name, title] of cases) assert.equal(ruleSection(scheme(subcategoryId), name)?.title, title, name);
});

test('a store gets sections in menu order, and items keep catalogue order inside them', () => {
  const sections = catalogSections({ subcategoryId: 'restaurants-food_cloud-kitchen' }, [item('Loaded Fries'), item('Beef Burger'), item('Family Platter'), item('Veggie Curry'), item('Chicken Wrap')]);
  assert.deepEqual(sections.map((section) => section.title), ['Platters & combos', 'Burgers & wraps', 'Bowls & curries', 'Starters & sides']);
  assert.deepEqual(sections[1]!.items.map((entry) => entry.name), ['Beef Burger', 'Chicken Wrap']);
  assert.equal(sections[1]!.id, 'menu:burgers-wraps');
  assert.equal(sections[1]!.source, 'rules');
  assert.equal(sectionAnchor(sections[1]!), 'section-menu-burgers-wraps');
});

test('the merchant’s own sections win, then the engine’s, then the rules', () => {
  const sections = catalogSections({ subcategoryId: 'restaurants-food_restaurant' }, [
    item('Beef Burger'),
    item('House Fries', { section: 'Chef’s picks' }),
    item('Grilled Chicken', { sectionId: 'menu:starters-sides' }),
    item('Fish Fillet', { sectionId: 'menu:not-a-section' }),
  ]);
  assert.deepEqual(sections.map((section) => [section.title, section.source]), [
    ['Chef’s picks', 'catalogue'], ['Burgers & wraps', 'rules'], ['Grills & mains', 'rules'], ['Starters & sides', 'engine'],
  ]);
  assert.equal(sections[0]!.id, 'catalogue:chef-s-picks');
});

test('a store with nothing the vocabulary knows shows one plain section; search keeps only matching sections', () => {
  assert.deepEqual(titles({ subcategoryId: 'restaurants-food_restaurant' }, ['Mystery Item', 'Another Thing']), ['Menu']);
  assert.deepEqual(titles({ subcategoryId: 'no-such-group' }, ['Mystery Item']), ['All items']);
  const sections = catalogSections({ subcategoryId: 'restaurants-food_café' }, [item('Espresso'), item('Chai Latte'), item('Avocado Toast')]);
  assert.deepEqual(searchSections(sections, 'LATTE').map((section) => section.title), ['Tea']);
  assert.deepEqual(searchSections(sections, '  ').map((section) => section.title), ['Breakfast', 'Coffee', 'Tea']);
});

test('the demo catalogue falls almost entirely into named sections', () => {
  const snapshot = JSON.parse(readFileSync('demo-seed/source/demo-api-snapshot.json', 'utf8')) as { merchants: Merchant[] };
  let items = 0; let more = 0; let sectioned = 0;
  for (const merchant of snapshot.merchants) {
    const own = merchant.items.filter((entry) => entry.merchantId === merchant.id);
    // Only stores Discovery shows: demo groups with no taxonomy home (finance, logistics) never appear.
    if (!own.length || !sectionScheme(merchant)) continue;
    const sections = catalogSections(merchant, own);
    items += own.length;
    if (sections.length > 1) sectioned += 1;
    more += sections.filter((section) => section.id.endsWith(':more')).reduce((total, section) => total + section.items.length, 0);
  }
  assert.ok(more / items < 0.02, `${more} of ${items} items fell into More`);
  assert.ok(sectioned >= 300, `only ${sectioned} stores have more than one section`);
});

test('each store type names its list in its own words', () => {
  const name = (subcategoryId: string) => { const naming = catalogNaming({ subcategoryId }); return [naming.list, naming.count(1), naming.count(30), naming.demand]; };
  assert.deepEqual(name('restaurants-food_cloud-kitchen'), ['Menu', '1 dish', '30 dishes', 'Frequently ordered']);
  assert.deepEqual(name('groceries-essentials_supermarket'), ['Aisles', '1 product', '30 products', 'Frequently ordered']);
  assert.deepEqual(name('vehicle-rentals_car-rental'), ['Fleet', '1 vehicle', '30 vehicles', 'Most hired']);
  assert.deepEqual(name('wellness_massage'), ['Treatments', '1 treatment', '30 treatments', 'Most booked']);
  assert.deepEqual(name('travel-tours_safaris'), ['Trips', '1 trip', '30 trips', 'Most booked trips']);
  assert.deepEqual(name('concierge-services_reservations'), ['Requests', '1 request', '30 requests', 'Most requested']);
  assert.deepEqual(name('no-such-group'), ['Shop', '1 product', '30 products', 'Frequently ordered']);
});

test('"Frequently ordered" and "New" come only from real history, first, repeating their items below', () => {
  const merchant = { subcategoryId: 'restaurants-food_cloud-kitchen' };
  const plain = catalogSections(merchant, [item('Beef Burger'), item('Veggie Curry'), item('Loaded Fries')]);
  assert.ok(plain.every((section) => section.source !== 'history'), 'no history, no history sections');
  const lonely = catalogSections(merchant, [item('Beef Burger', { orders: 40 }), item('Veggie Curry')]);
  assert.ok(lonely.every((section) => section.source !== 'history'), 'one ordered item is not a section');
  const sections = catalogSections(merchant, [
    item('Beef Burger', { orders: 12 }), item('Veggie Curry', { orders: 40 }), item('Loaded Fries', { orders: 0 }),
    item('Chicken Wrap', { orders: 25, isAvailable: false }), item('Family Platter', { isNew: true }),
  ]);
  assert.deepEqual(sections.slice(0, 2).map((section) => [section.title, section.source, section.items.map((entry) => entry.name)]), [
    ['Frequently ordered', 'history', ['Veggie Curry', 'Beef Burger']],
    ['New', 'history', ['Family Platter']],
  ]);
  assert.ok(sections.some((section) => section.title === 'Bowls & curries' && section.items.some((entry) => entry.name === 'Veggie Curry')), 'items repeat in their own section');
  assert.equal(sections[0]!.id, 'menu:demand');
  assert.ok(searchSections(sections, 'curry').every((section) => section.source !== 'history'), 'search drops the repeating sections');
  const fleet = catalogSections({ subcategoryId: 'vehicle-rentals_car-rental' }, [item('Compact SUV', { orders: 3 }), item('Economy Sedan', { orders: 9 })]);
  assert.equal(fleet[0]!.title, 'Most hired');
});
