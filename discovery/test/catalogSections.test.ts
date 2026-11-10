import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categories } from '../src/data/taxonomy';
import { catalogDepartments, catalogNaming, catalogSections, ruleSection, searchSections, sectionAnchor, sectionScheme } from '../src/data/catalogSections';
import { departmentIconNames } from '../src/components/storefronts/supermarket/departmentIcons';
import { isRetailStore } from '../src/data/supermarketPresentation';
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
    ['alcohol-beverages_spirits', 'White Rum', 'Rum'],
    ['alcohol-beverages_non-alcoholic-drinks', 'Ginger beer 330ml', 'Mixers'],
    ['alcohol-beverages_champagne', 'Rosé Champagne', 'Champagne & sparkling'],
    ['tech-electronics_accessories', 'Phone Case', 'Accessories'],
    ['tech-electronics_smartphones', 'Foldable Smartphone', 'Flagship & foldable phones'],
    ['tech-electronics_smart-devices', 'Smart Speaker', 'Smart home'],
    ['beauty_salon-barber', 'Box braids, medium', 'Hair & barber'],
    ['beauty_haircare', 'Leave-In Cream', 'Haircare'],
    ['vehicle-services_car-wash', 'Monthly Wash Plan', 'Washes'],
    ['vehicle-rentals_car-rental', 'Compact SUV', 'SUVs & 4x4s'],
    ['marketplace_stationery', 'Desk Organizer', 'Office supplies'],
    // The retail departments' finer aisles (owner, 9 Nov 2026).
    ['tech-electronics_smart-devices', 'Smart TV', 'TVs & projectors'],
    ['tech-electronics_smart-devices', 'Robot Vacuum', 'Home appliances'],
    ['tech-electronics_gaming', 'Gaming Monitor', 'Gaming gear'],
    ['tech-electronics_gaming', 'Gaming Laptop', 'Laptops'],
    ['tech-electronics_smartphones', 'Camera Smartphone', 'Smartphones'],
    ['tech-electronics_accessories', 'Cable Organizer', 'Cables & adapters'],
    ['tech-electronics_accessories', 'Fast Charger', 'Chargers & power banks'],
    ['tech-electronics_accessories', 'Laptop Stand', 'Keyboards, mice & webcams'],
    ['tech-electronics_device-repairs', 'Basic data recovery', 'Repairs'],
    ['alcohol-beverages_wine', 'Cabernet Sauvignon', 'Red wine'],
    ['alcohol-beverages_wine', 'Sauvignon Blanc', 'White wine'],
    ['alcohol-beverages_spirits', 'Craft Gin', 'Gin'],
    ['alcohol-beverages_beer', 'Non-Alcoholic Beer', 'Beer & cider'],
    ['alcohol-beverages_non-alcoholic-drinks', 'Sports drink 500ml', 'Soft drinks'],
    ['pharmacy_supplements', 'Protein Powder', 'Sports nutrition'],
    ['pharmacy_baby-products', 'Wipes Pack', 'Nappies & wipes'],
    ['health_clinics', 'Chronic Care Review', 'Consultations & visits'],
    ['fashion-apparel_accessories', 'Phone Case', 'Phone & tech accessories'],
    ['fashion-apparel_watches', 'Smart Hybrid', 'Watches'],
    ['fashion-apparel_bags', 'Laptop Bag', 'Backpacks & work bags'],
    ['marketplace_decor', 'Table Lamp', 'Lighting'],
    ['marketplace_hardware-diy', 'Masking tape 48mm', 'Tools & hardware'],
    ['marketplace_pet-supplies', 'Dry dog food 3kg', 'Pet food & treats'],
    ['adults-only_cigarettes', 'Classic Pack', 'Cigarettes'],
    ['flowers-gifts_chocolates', 'Premium Tasting Box', 'Chocolates'],
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

// Groceries get two levels for stores with thousands of products (owner, 9 Nov 2026): departments, then aisles.
const grocer = { subcategoryId: 'groceries-essentials_supermarket' };
const groceries = (vocabulary as unknown as { schemes: { id: string; sections: { id: string; priority?: number }[];
  departments: { id: string; title: string; icon: string; keywords: string[]; sections: string[] }[] }[] })
  .schemes.find((entry) => entry.id === 'groceries')!;
const placeOf = (name: string) => catalogDepartments(grocer, [item(name)])
  .flatMap((department) => department.sections.map((section) => `${department.title} › ${section.title}`))[0];

// Every product store uses the retail storefront (owner, 9 Nov 2026), so every retail scheme groups its aisles into departments.
const retailSchemes = ['groceries', 'tech', 'health', 'drinks', 'fashion', 'beauty', 'gifts', 'home', 'adults'];
/** Beauty's departments cover its products only: its service sections stay out. */
const serviceOnly: Record<string, string[]> = { beauty: ['hair-services', 'nails-lashes', 'massages', 'facials', 'body', 'spa-days', 'memberships', 'training'] };
type SchemeEntry = { id: string; sections: { id: string }[]; departments?: { id: string; icon: string; keywords: string[]; sections: string[] }[] };

test('every retail scheme: each aisle sits in exactly one department, with an icon the storefront draws', () => {
  const shared = vocabulary.shared.map((section) => section.id);
  for (const entry of (vocabulary as unknown as { schemes: SchemeEntry[] }).schemes) {
    if (!retailSchemes.includes(entry.id)) { assert.equal(entry.departments, undefined, `${entry.id} is not a retail scheme`); continue; }
    const departments = entry.departments ?? [];
    assert.ok(departments.length >= 2, `${entry.id} has no departments`);
    const aisles = entry.sections.map((section) => section.id);
    const listed = departments.flatMap((department) => department.sections);
    const unlisted = serviceOnly[entry.id] ?? [];
    assert.equal(new Set(listed).size, listed.length, `${entry.id}: an aisle is listed twice`);
    for (const aisle of aisles) assert.ok(listed.includes(aisle) !== unlisted.includes(aisle), `${entry.id}:${aisle} needs exactly one department`);
    for (const aisle of listed) assert.ok(aisles.includes(aisle) || shared.includes(aisle), `${entry.id}:${aisle} is not a section`);
    assert.equal(new Set(departments.map((department) => department.id)).size, departments.length, `${entry.id} repeats a department`);
    for (const department of departments) {
      assert.ok(departmentIconNames.includes(department.icon), `${entry.id}:${department.id} draws ${department.icon}`);
      assert.ok(department.keywords.length && department.keywords.every((word) => word.trim()), `${entry.id}:${department.id}`);
    }
  }
  // Every grocery aisle has a priority, so the most specific product words win whatever the display order.
  assert.ok(groceries.sections.every((section) => typeof section.priority === 'number'));
});

test('catalogDepartments puts aisles in their departments, drops empty ones and leaves other schemes alone', () => {
  const departments = catalogDepartments(grocer, ['Milk', 'Bread', 'Rice', 'Cooking Oil', 'Bottled Water', 'Toilet paper, 10 rolls', 'Eggs'].map((name) => item(name)));
  assert.deepEqual(departments.map((department) => [department.id, department.title, department.icon, department.count]), [
    ['groceries:dairy-eggs', 'Dairy & eggs', 'Milk', 2], ['groceries:bakery', 'Bakery', 'Croissant', 1], ['groceries:pantry', 'Pantry', 'Wheat', 2],
    ['groceries:drinks', 'Drinks', 'CupSoda', 1], ['groceries:household', 'Household & cleaning', 'SprayCan', 1],
  ]);
  assert.deepEqual(departments[0]!.sections.map((section) => section.title), ['Milk & cream', 'Eggs']);
  assert.deepEqual(departments[2]!.sections.map((section) => section.title), ['Rice, pasta & grains', 'Oils, spices & sauces']);
  assert.deepEqual(catalogDepartments({ subcategoryId: 'restaurants-food_restaurant' }, [item('Beef Burger')]), []);
  assert.deepEqual(catalogDepartments({ subcategoryId: 'no-such-group' }, [item('Milk')]), []);
  // History repeats items on the store's home, so it never counts inside a department.
  const withHistory = catalogDepartments(grocer, [item('Milk', { orders: 9 }), item('Eggs', { orders: 4 })]);
  assert.deepEqual(withHistory.map((department) => [department.title, department.count]), [['Dairy & eggs', 2]]);
});

test('in departments the merchant’s own sections win, then the engine’s, then the rules, else "More"', () => {
  const departments = catalogDepartments(grocer, [
    item('Fresh Milk 500ml', { section: 'Dairy' }),
    item('Weekly Special', { section: 'This week' }),
    item('Mystery Item', { sectionId: 'groceries:fruit' }),
    item('Basmati Rice 2kg', { section: 'Rice & Grains' }),
    item('Tomato Box'),
    item('Gadget'),
  ]);
  assert.deepEqual(departments.map((department) => [department.title, department.sections.map((section) => [section.title, section.source])]), [
    ['Fruit & veg', [['Fruit', 'engine'], ['Vegetables & herbs', 'rules']]],
    ['Dairy & eggs', [['Dairy', 'catalogue']]],
    ['Pantry', [['Rice & Grains', 'catalogue']]],
    ['More', [['This week', 'catalogue'], ['More', 'rules']]],
  ]);
  assert.equal(departments.at(-1)!.id, 'groceries:more');
  assert.equal(departments.at(-1)!.icon, 'LayoutGrid');
});

test('specific grocery words win over general ones', () => {
  const cases: [string, string][] = [
    ['Coconut milk 400ml', 'Pantry › Tins & jars'], ['Vegetable oil 3L', 'Pantry › Oils, spices & sauces'], ['Tuna Steak', 'Meat & fish › Fish'],
    ['Peanut butter 400g', 'Pantry › Breakfast & spreads'], ['Fish & Chips Pack', 'Meat & fish › Fish'], ['Salt & vinegar crisps', 'Snacks & sweets › Crisps, nuts & popcorn'],
    ['Hot dog rolls', 'Bakery › Bread'], ['Beef smokies', 'Meat & fish › Sausages & burgers'], ['Chicken samosa', 'Deli & ready meals › Ready meals'],
    ['Dry dog food 2kg', 'Pets › Pet food & care'], ['Baby wipes', 'Baby & kids › Nappies & wipes'], ['Iced tea 500ml', 'Drinks › Soft drinks & juice'],
    ['Strawberry yoghurt', 'Dairy & eggs › Yoghurt'], ['Laundry bar soap', 'Household & cleaning › Laundry'], ['Bar soap, 3 pack', 'Personal care › Bath & body'],
    ['Farm Basket', 'Fruit & veg › Fruit & veg boxes'], ['Seasonal Fruit Box', 'Fruit & veg › Fruit'], ['Quick Breakfast Box', 'Boxes & baskets › Boxes & baskets'],
    ['BBQ Meat Box', 'Meat & fish › BBQ & mixed meat'], ['Sweet potatoes 1kg', 'Fruit & veg › Vegetables & herbs'], ['Ice cream 1L', 'Frozen › Ice cream & ice'],
  ];
  for (const [name, place] of cases) assert.equal(placeOf(name), place, name);
});

test('every grocery product in the demo catalogue and the gap fill finds a department; under 1% lands in "More"', () => {
  const snapshot = JSON.parse(readFileSync('demo-seed/source/demo-api-snapshot.json', 'utf8')) as { merchants: Merchant[] };
  const gapFill = JSON.parse(readFileSync('demo-seed/source/gap-fill.json', 'utf8')) as { groups: { demoSubcategoryId: string; demoCategoryId: string; items: [string, number][] }[] };
  const stores: Merchant[] = snapshot.merchants.filter((merchant) => merchant.categoryId === 'groceries-essentials');
  for (const group of gapFill.groups.filter((entry) => entry.demoCategoryId === 'groceries-essentials')) {
    const id = `gap-${group.demoSubcategoryId}`;
    stores.push({ id, name: group.demoSubcategoryId, subcategoryId: group.demoSubcategoryId,
      items: group.items.map(([name, price], index) => ({ id: `${id}-${index}`, merchantId: id, name, price, currency: 'KES' })) });
  }
  let products = 0; let more = 0; let single = 0;
  for (const store of stores) {
    const own = store.items.filter((entry) => entry.merchantId === store.id);
    const departments = catalogDepartments(store, own);
    assert.equal(departments.reduce((total, department) => total + department.count, 0), own.length, `${store.id} loses products`);
    products += own.length;
    more += departments.filter((department) => department.id.endsWith(':more')).reduce((total, department) => total + department.count, 0);
    if (departments.length < 2) single += 1;
  }
  assert.ok(products >= 900, `only ${products} grocery products`);
  assert.ok(more / products < 0.01, `${more} of ${products} grocery products fell into More`);
  // The butcheries, fishmongers and greengrocers keep one department and show their aisles straight away.
  assert.equal(single, 15);
});

test('an electronics store gets Wolt’s departments, each with its own aisles', () => {
  const departments = catalogDepartments({ subcategoryId: 'tech-electronics_smart-devices' },
    ['Foldable Smartphone', 'Phone Case', 'USB-C Cable', 'Fast Charger', 'Smart TV', 'Gaming Monitor', 'Robot Vacuum'].map((name) => item(name)));
  assert.deepEqual(departments.map((department) => [department.id, department.title, department.icon, department.sections.map((section) => section.title)]), [
    ['tech:phones', 'Phones & smart tech', 'Smartphone', ['Flagship & foldable phones', 'Accessories']],
    ['tech:tv', 'TV & entertainment', 'Tv', ['TVs & projectors']],
    ['tech:cables-chargers', 'Cables & chargers', 'Cable', ['Chargers & power banks', 'Cables & adapters']],
    ['tech:gaming', 'Gaming', 'Gamepad2', ['Gaming gear']],
    ['tech:appliances', 'Kitchen & home appliances', 'Refrigerator', ['Home appliances']],
  ]);
});

test('every demo retail store finds departments for its products; under 2% lands in "More" in each scheme', () => {
  const snapshot = JSON.parse(readFileSync('demo-seed/source/demo-api-snapshot.json', 'utf8')) as { merchants: Merchant[] };
  const gapFill = JSON.parse(readFileSync('demo-seed/source/gap-fill.json', 'utf8')) as { groups: { demoSubcategoryId: string; items: [string, number][] }[] };
  const stores: Merchant[] = [...snapshot.merchants, ...gapFill.groups.map((group): Merchant => {
    const id = `gap-${group.demoSubcategoryId}`;
    return { id, name: group.demoSubcategoryId, subcategoryId: group.demoSubcategoryId,
      items: group.items.map(([name, price], index) => ({ id: `${id}-${index}`, merchantId: id, name, price, currency: 'KES' })) };
  })];
  const totals = new Map<string, { products: number; more: number }>();
  const layout = new Map<string, string[]>();
  for (const store of stores.filter((entry) => isRetailStore(entry))) {
    const own = store.items.filter((entry) => entry.merchantId === store.id);
    const departments = catalogDepartments(store, own);
    assert.equal(departments.reduce((total, department) => total + department.count, 0), own.length, `${store.id} loses products`);
    const scheme = sectionScheme(store)!.id;
    const total = totals.get(scheme) ?? { products: 0, more: 0 };
    total.products += own.length;
    total.more += departments.filter((department) => department.id.endsWith(':more')).reduce((sum, department) => sum + department.count, 0);
    totals.set(scheme, total);
    layout.set(store.id, departments.map((department) => department.id));
  }
  assert.deepEqual([...totals.keys()].sort(), [...retailSchemes].sort());
  for (const [scheme, { products, more }] of totals) assert.ok(more / products < 0.02, `${scheme}: ${more} of ${products} products fell into More`);
  // A phone shop keeps one department and shows its aisles straight away; mixed shops get the sidebar.
  assert.deepEqual(layout.get('M0462'), ['tech:phones']);
  assert.deepEqual(layout.get('M0494'), ['tech:phones', 'tech:tv', 'tech:appliances']);
  assert.deepEqual(layout.get('M0467'), ['tech:phones', 'tech:cables-chargers']);
  assert.deepEqual(layout.get('M0416'), ['health:medicines', 'health:care', 'health:services']);
  assert.deepEqual(layout.get('M0079'), ['drinks:wine', 'drinks:spirits', 'drinks:beer', 'drinks:soft', 'drinks:gifts']);
});
