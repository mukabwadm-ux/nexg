import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem, Merchant } from '../src/providers/DiscoveryProvider';
import { isGroceryStore, readSavedProducts, writeSavedProducts } from '../src/data/supermarketPresentation';
import { SupermarketStorefront } from '../src/components/storefronts/supermarket/SupermarketStorefront';

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
