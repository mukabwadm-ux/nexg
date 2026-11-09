import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem, Merchant } from '../src/providers/DiscoveryProvider';
import { isGroceryStore, isRetailStore, readSavedProducts, writeSavedProducts } from '../src/data/supermarketPresentation';
import { SupermarketStorefront } from '../src/components/storefronts/supermarket/SupermarketStorefront';
import { StoreRow } from '../src/components/MerchantInventoryRow';

// Hearts live in the browser's localStorage; this file runs in its own process, so a stand-in is safe.
const kept = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => { kept.set(key, String(value)); },
  removeItem: (key: string) => { kept.delete(key); },
};
Object.assign(globalThis, { window: { localStorage }, localStorage });

// Isolated presentation controls, never catalogue data. IDs look like Supabase UUIDs, as the cart needs.
const noop = () => {};
const uuid = (n: number) => `c1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const product = (shop: number, n: number, name: string, price?: number): CatalogItem => ({ id: uuid(n), merchantId: uuid(shop), name, ...(price === undefined ? {} : { price, currency: 'KES' }) });
const shop: Merchant = { id: uuid(1), name: 'Control Supermarket', subcategoryId: 'groceries-essentials_supermarket', area: 'Westlands',
  items: [product(1, 11, 'Milk', 170), product(1, 12, 'Bread', 65), product(1, 13, 'Rice', 240), product(1, 14, 'Bottled Water', 60)] };
const butchery: Merchant = { id: uuid(2), name: 'Control Butchery', subcategoryId: 'groceries-essentials_butchery', area: 'Kilimani',
  items: [product(2, 21, 'Beef Mince', 650), product(2, 22, 'Ribeye Steak', 1400), product(2, 23, 'Chicken Thighs', 520), product(2, 24, 'Goat Chops', 900)] };
const render = (merchant: Merchant = shop) => renderToStaticMarkup(<SupermarketStorefront merchant={merchant} onBack={noop} onSelectItem={noop} onCloseItem={noop} />);
const shelfKey = `nexg.discovery.shelf.v1:${uuid(1)}`;
const listWords = />View list<|Your list|on your list|to your list|on this device/;
/** The open sheet's markup alone, without the store behind it. */
const dialogOf = (html: string) => html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));

test('a supermarket opens on its home: the department sidebar, then one rail per department, in compact cards', () => {
  kept.clear();
  assert.ok(isGroceryStore(shop));
  const html = render();
  assert.match(html, /class="store-hero"/);
  assert.match(html, /4 products/);
  assert.match(html, /<nav class="grocery-departments" aria-label="Departments">/);
  assert.match(html, /aria-current="true"><span class="grocery-department__tile">.*?<\/span><span class="grocery-department__title">Discover</);
  const order = ['Dairy &amp; eggs', 'Bakery', 'Pantry', 'Drinks'].map((title) => html.indexOf(`grocery-department__title">${title}<`));
  assert.ok(order.every((index, position) => index > 0 && (position === 0 || index > order[position - 1]!)), 'departments in store order');
  assert.match(html, /class="store-section grocery-rail"/);
  assert.match(html, /aria-label="See all Dairy &amp; eggs">See all</);
  assert.match(html, /offering-card offering-card--compact offering-card--product/);
  assert.match(html, /aria-label="Add Milk to cart"/);
  assert.match(html, /placeholder="Search Control Supermarket"/);
  assert.match(html, /aria-label="Search Control Supermarket"/);
  assert.doesNotMatch(html, listWords);
  assert.doesNotMatch(html, /store-basket/, 'no pill while the cart is empty');
  assert.doesNotMatch(html, /demo/i);
  assert.match(render({ ...shop, isOpen: false }), /Closed now/);
  assert.match(render({ ...shop, items: [] }), /No products listed yet/);
});

test('real history leads the home: "Frequently ordered" comes first and is linked under Discover', () => {
  kept.clear();
  const ordered: Merchant = { ...shop, items: shop.items.map((entry, index) => ({ ...entry, orders: 10 - index })) };
  const html = render(ordered);
  assert.match(html, /<ul class="grocery-department__subs"><li><a href="#section-groceries-demand">Frequently ordered<\/a>/);
  assert.ok(html.indexOf('Frequently ordered</h2>') > 0 && html.indexOf('Frequently ordered</h2>') < html.indexOf('Dairy &amp; eggs</h2>'), 'history before the departments');
  assert.doesNotMatch(render(), /grocery-department__subs|Frequently ordered/, 'no history, no history rail');
});

test('a shop with one department shows its aisles straight away under the sticky section bar', () => {
  kept.clear();
  const html = render(butchery);
  assert.doesNotMatch(html, /aria-label="Departments"/);
  assert.match(html, /aria-label="Aisles"/);
  for (const aisle of [/>Beef</, /Chicken &amp; poultry/, /Goat &amp; lamb/]) assert.match(html, aisle);
  assert.match(html, /class="offering-grid offering-grid--compact"/);
  assert.match(html, /placeholder="Search Control Butchery"/);
  assert.doesNotMatch(html, listWords);
});

test('a product opens the one item sheet: its aisle, the shared stepper and "Add to cart", honest about checkout', () => {
  kept.clear();
  const milk = shop.items[0]!;
  const sheet = (item: CatalogItem, merchant: Merchant = shop) => dialogOf(renderToStaticMarkup(<SupermarketStorefront merchant={merchant} activeItem={item}
    onBack={noop} onSelectItem={noop} onCloseItem={noop} />));
  const fresh = sheet(milk);
  assert.match(fresh, /^<dialog class="item-sheet item-sheet--product item-sheet--cart"/);
  assert.match(fresh, /class="item-sheet__eyebrow">Milk &amp; cream</);
  assert.match(fresh, /aria-label="Save Milk"/);
  assert.match(fresh, /Quantity/);
  assert.match(fresh, /<span class="item-sheet__label">Add to cart<\/span><span class="item-sheet__dot" aria-hidden="true">·<\/span><span class="item-sheet__total">KES\s*170<\/span>/);
  assert.match(fresh, /Checkout happens on the NexG website\./);
  assert.doesNotMatch(fresh, listWords);
  assert.doesNotMatch(fresh, /Order from/, 'inside the store the store card is left out');
  const jar = product(1, 15, 'Mystery Jar');
  const unpriced = sheet(jar, { ...shop, items: [...shop.items, jar] });
  assert.match(unpriced, /no listed price yet/);
  assert.match(unpriced, /class="offering-sheet__primary" disabled=""/);
  const gone = { ...milk, isAvailable: false };
  const unavailable = sheet(gone, { ...shop, items: [gone, ...shop.items.slice(1)] });
  assert.match(unavailable, /This product is currently unavailable\./);
  assert.match(unavailable, /disabled=""><span class="item-sheet__label">Unavailable</);
  writeSavedProducts(uuid(1), [milk.id]);
  assert.match(sheet(milk), /aria-label="Unsave Milk"/);
});

test('the page address can name a department: the store opens there, and an id it doesn’t have shows Discover', () => {
  kept.clear();
  const at = (department?: string) => renderToStaticMarkup(<SupermarketStorefront merchant={shop} onBack={noop} onSelectItem={noop} onCloseItem={noop}
    department={department} onDepartment={noop} />);
  const dairy = at('groceries:dairy-eggs');
  assert.match(dairy, /<span aria-current="page">Dairy &amp; eggs<\/span>/);
  assert.doesNotMatch(dairy, /aria-current="true"><span class="grocery-department__tile">.*?<\/span><span class="grocery-department__title">Discover</, 'Discover is not the open one');
  for (const department of [undefined, 'groceries:no-such-department', 'dairy-eggs']) {
    const html = at(department);
    assert.doesNotMatch(html, /aria-current="page"/, String(department));
    assert.match(html, /aria-current="true"><span class="grocery-department__tile">.*?<\/span><span class="grocery-department__title">Discover</, String(department));
  }
});

test('hearts share the store shelf: unknown products drop out, requests already there stay', () => {
  kept.clear();
  kept.set(shelfKey, JSON.stringify({ saved: [uuid(11), 'gone', 7, uuid(11)], requests: { bread: { answers: {}, savedAt: '' } } }));
  assert.deepEqual(readSavedProducts(shop), [uuid(11)]);
  writeSavedProducts(uuid(1), []);
  assert.deepEqual(JSON.parse(kept.get(shelfKey)!), { saved: [], requests: { bread: { answers: {}, savedAt: '' } } });
  kept.set(shelfKey, JSON.stringify({ saved: [uuid(11)] }));
  writeSavedProducts(uuid(1), []);
  assert.equal(kept.has(shelfKey), false);
  kept.set(shelfKey, 'not json');
  assert.deepEqual(readSavedProducts(shop), []);
  writeSavedProducts(uuid(1), [uuid(12)]);
  assert.match(render(), /aria-label="Add Bread to cart"/);
});

// Every product store uses the retail storefront (owner, 9 Nov 2026): electronics, pharmacy, drinks, fashion and the rest.
const gadgets: Merchant = { id: uuid(3), name: 'Control Electronics', subcategoryId: 'tech-electronics_smart-devices', area: 'Westlands',
  items: [product(3, 31, 'Smart Speaker', 9500), product(3, 32, 'Smart Lock', 14000), product(3, 33, 'Smart TV', 65000), product(3, 34, 'Robot Vacuum', 42000)] };
const phones: Merchant = { id: uuid(4), name: 'Control Phones', subcategoryId: 'tech-electronics_smartphones', area: 'Kilimani',
  items: [product(4, 41, 'Foldable Smartphone', 98000), product(4, 42, 'Entry Smartphone', 12000), product(4, 43, 'Midrange Smartphone', 35000)] };
const liquor: Merchant = { id: uuid(5), name: 'Control Liquor', subcategoryId: 'alcohol-beverages_liquor-stores', area: 'Karen',
  items: [product(5, 51, 'London Dry Gin', 3200), product(5, 52, 'Premium Lager', 250), product(5, 53, 'Tonic Water', 150)] };
/** What a shopper reads: the markup's text, without tags or attributes. */
const words = (html: string) => html.replace(/<[^>]+>/g, ' ');

test('every product store, and only a product store, uses the retail storefront', () => {
  const retail = (subcategoryId?: string) => isRetailStore({ subcategoryId });
  for (const id of ['groceries-essentials_supermarket', 'tech-electronics_smartphones', 'tech-electronics_smart-devices', 'pharmacy_pharmacy', 'pharmacy_supplements',
    'fashion-apparel_mens-fashion', 'beauty_skincare', 'alcohol-beverages_liquor-stores', 'alcohol-beverages_non-alcoholic-drinks', 'flowers-gifts_flowers', 'marketplace_books',
    'adults-only_cigars']) assert.ok(retail(id), id);
  for (const id of ['restaurants-food_restaurant', 'wellness_spa', 'health_clinics', 'tech-electronics_telecom-services', 'tech-electronics_device-repairs',
    'vehicle-rentals_car-rental', 'travel-tours_safaris', 'experiences_concerts', 'laundry-cleaning_laundry', 'no-such-group', undefined]) assert.ok(!retail(id), String(id));
});

test('an electronics store opens on its home: departments, rails of compact cards, and none of the grocer’s words', () => {
  kept.clear();
  assert.ok(isRetailStore(gadgets) && !isGroceryStore(gadgets));
  const html = render(gadgets);
  assert.match(html, /<nav class="grocery-departments" aria-label="Departments">/);
  const order = ['Phones &amp; smart tech', 'TV &amp; entertainment', 'Kitchen &amp; home appliances'].map((title) => html.indexOf(`grocery-department__title">${title}<`));
  assert.ok(order.every((index, position) => index > 0 && (position === 0 || index > order[position - 1]!)), 'departments in the scheme’s order');
  assert.match(html, /aria-label="See all TV &amp; entertainment">See all</);
  assert.match(html, /offering-card offering-card--compact offering-card--product/);
  assert.match(html, /aria-label="Add Smart TV to cart"/);
  assert.match(html, /placeholder="Search Control Electronics"/);
  assert.match(html, /lucide-package/);
  assert.match(words(html), /4 products/);
  assert.doesNotMatch(words(html), /aisle|grocer|supermarket|basket|demo/i);
  assert.doesNotMatch(html, /lucide-shopping-basket/);
});

test('a phone shop has one department, so it shows its aisles straight away', () => {
  kept.clear();
  const html = render(phones);
  assert.doesNotMatch(html, /aria-label="Departments"/);
  assert.match(html, /aria-label="Shop sections"/);
  for (const aisle of [/Flagship &amp; foldable phones/, /Entry &amp; refurbished phones/, />Smartphones<\/h2>/]) assert.match(html, aisle);
  assert.match(html, /class="offering-grid offering-grid--compact"/);
  assert.doesNotMatch(words(html), /aisle|grocer|supermarket/i);
});

test('the page address opens an electronics department under its breadcrumb', () => {
  kept.clear();
  const html = renderToStaticMarkup(<SupermarketStorefront merchant={gadgets} onBack={noop} onSelectItem={noop} onCloseItem={noop} department="tech:tv" onDepartment={noop} />);
  assert.match(html, /<button type="button">Control Electronics<\/button>/);
  assert.match(html, /<span aria-current="page">TV &amp; entertainment<\/span>/);
  assert.match(html, /aria-label="Add Smart TV to cart"/);
  assert.doesNotMatch(html, /aria-label="Add Smart Lock to cart"/, 'only the open department draws');
});

test('a liquor store counts drinks and groups them into its departments', () => {
  kept.clear();
  const html = render(liquor);
  assert.match(words(html), /3 drinks/);
  for (const title of ['Spirits', 'Beer &amp; cider', 'Soft drinks &amp; mixers']) assert.match(html, new RegExp(`grocery-department__title">${title}<`));
});

test('store rows on discovery pages use the compact card for every product store, as its store does', () => {
  kept.clear();
  const row = (merchant: Merchant) => renderToStaticMarkup(<StoreRow merchant={merchant} onOpen={noop} />);
  const shop = row(phones);
  assert.match(shop, /store-row__rail--compact/);
  assert.match(shop, /offering-card offering-card--compact offering-card--product/);
  assert.match(shop, /aria-label="Add Foldable Smartphone to cart"/);
  const spa: Merchant = { id: uuid(6), name: 'Control Spa', subcategoryId: 'wellness_spa', items: [product(6, 61, 'Swedish Massage', 4500)] };
  assert.doesNotMatch(row(spa), /offering-card--compact/);
  // A product the cart can't take keeps its +, which opens it, as in the store.
  assert.match(row({ ...phones, items: [product(4, 44, 'Refurbished Smartphone')] }), /aria-label="Choose Refurbished Smartphone"/);
});
