import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem, CatalogModifierGroup, Merchant } from '../src/providers/DiscoveryProvider';
import { catalogNaming } from '../src/data/catalogSections';
import {
  cartBlock, cartBlockNote, cartNote, cartPillNote, cartSwitchNote, choiceRule, kes, MAX_DISH_QUANTITY, optionPrice, optionsNote,
} from '../src/data/restaurantPresentation';
import { writeSavedProducts } from '../src/data/supermarketPresentation';
import { RestaurantStorefront } from '../src/components/storefronts/restaurant/RestaurantStorefront';

// Saved hearts live in the browser's localStorage; this file runs in its own process, so a stand-in is safe.
// The NexG cart renders empty on the server; the shared cart pieces have their own tests (cart.test.tsx).
const kept = new Map<string, string>();
Object.assign(globalThis, { window: { localStorage: {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => { kept.set(key, String(value)); },
  removeItem: (key: string) => { kept.delete(key); },
} } });

// Isolated presentation controls, never catalogue data.
const noop = () => {};
const dish = (id: string, name: string, price?: number, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, merchantId: 'kitchen-control', name, ...(price === undefined ? {} : { price, currency: 'KES' }), ...extra });
const size: CatalogModifierGroup = { id: 'size', name: 'Size', required: true, minSelections: 1, maxSelections: 1, options: [
  { id: 'regular', name: 'Regular', priceDelta: 0, currency: 'KES' },
  { id: 'large', name: 'Large', priceDelta: 200, currency: 'KES' },
  { id: 'family', name: 'Family', priceDelta: 600, currency: 'KES', isAvailable: false },
] };
const extras: CatalogModifierGroup = { id: 'extras', name: 'Extras', required: false, minSelections: 0, maxSelections: 2, options: [
  { id: 'cheese', name: 'Extra cheese', priceDelta: 150, currency: 'KES' },
  { id: 'egg', name: 'Fried egg', priceDelta: 100, currency: 'KES' },
  { id: 'avocado', name: 'Avocado', priceDelta: 120, currency: 'KES' },
] };
const burger = dish('burger', 'Beef Burger', 800, { description: 'Grilled beef patty with lettuce and tomato.', modifierGroups: [size] });
const bowl = dish('bowl', 'Chicken Rice Bowl', 650, { description: 'Smoky grilled chicken with rice.' });
const wrap = dish('wrap', 'Chicken Wrap', 570, { modifierGroups: [extras] });
const tea = dish('tea', 'Masala Tea');
const kitchen: Merchant = { id: 'kitchen-control', name: 'Control Kitchen', subcategoryId: 'restaurants-food_restaurant', area: 'Kilimani', items: [bowl, wrap, burger, tea] };
const naming = catalogNaming(kitchen);
const render = (merchant: Merchant = kitchen, extra: { activeItem?: CatalogItem; itemMissing?: boolean } = {}) =>
  renderToStaticMarkup(<RestaurantStorefront merchant={merchant} onBack={noop} onSelectItem={noop} onCloseItem={noop} {...extra} />);
/** The open sheet's markup alone, without the menu behind it. */
const dialogOf = (html: string) => html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));

test('the restaurant storefront: the shared hero with confirmed facts, then the menu in sections under the section bar', () => {
  kept.clear();
  const html = render();
  assert.match(html, /class="store-hero"/);
  assert.match(html, /Back<\/button>/);
  assert.match(html, /class="store-hero__eyebrow">Restaurant</);
  assert.match(html, /Kilimani/);
  assert.match(html, /4 dishes/);
  assert.doesNotMatch(html, /Open now|Closed now/);
  assert.match(html, /aria-label="Menu"/);
  assert.match(html, /placeholder="Search Control Kitchen"/);
  assert.ok(html.indexOf('Burgers &amp; wraps') > 0 && html.indexOf('Burgers &amp; wraps') < html.indexOf('Bowls &amp; curries'));
  assert.match(html, /offering-card offering-card--dish/);
  assert.match(html, /aria-label="Add Chicken Rice Bowl[^"]*"/);
  // The + only ever adds. A dish the cart can't take offers its sheet in words instead.
  assert.doesNotMatch(html, /aria-label="(Add|Choose) Beef Burger/);
  assert.doesNotMatch(html, /aria-label="(Add|Choose) Masala Tea/);
  assert.match(html, /Price on request/);
  assert.match(html, /View dish<svg/);
  assert.doesNotMatch(html, /Explore menu|Back to discovery|store-basket/);
  assert.doesNotMatch(html, /demo|example|estimate/i);
  assert.match(render({ ...kitchen, isOpen: false }), /Closed now/);
  assert.match(render({ ...kitchen, items: [] }), /No dishes listed yet/);
  // A delivery time shows only when the source confirms one, never one built from ranking defaults.
  assert.doesNotMatch(render({ ...kitchen, deliveryTimeMin: 25, deliveryTimeMax: 40 }), /25–40|From 25/);
  assert.match(render({ ...kitchen, displayFacts: { deliveryTime: '30–45 min' } }), /30–45 min/);
  assert.match(render(kitchen, { itemMissing: true }), /That dish isn’t listed at Control Kitchen any more/);
  assert.match(render(kitchen, { activeItem: bowl }), /item-sheet item-sheet--dish[\s\S]*Add to cart/);
  writeSavedProducts('kitchen-control', ['wrap']);
  assert.match(render(), /aria-label="Unsave Chicken Wrap"/);
});

test('catering takes requests rather than orders, so it keeps the shared request storefront', () => {
  kept.clear();
  const html = render({ id: 'kitchen-control', name: 'Control Catering', subcategoryId: 'restaurants-food_catering', items: [dish('lunch', 'Corporate Lunch (per person)', 1200)] });
  assert.match(html, /class="generic-store/);
  assert.match(html, /Start a request/);
  assert.doesNotMatch(html, /restaurant-menu/);
});

test('a dish goes in the cart only with a menu price in shillings and no choice the cart can’t hold', () => {
  assert.equal(cartBlock(bowl), undefined);
  assert.equal(cartBlock(wrap), undefined, 'optional extras alone never block a dish');
  assert.equal(cartBlock(burger), 'choices');
  assert.equal(cartBlock(tea), 'unpriced');
  assert.equal(cartBlock({ ...bowl, price: 0 }), 'unpriced');
  assert.equal(cartBlock({ ...bowl, currency: 'USD' }), 'currency');
  assert.equal(cartBlock({ ...bowl, isAvailable: false }), 'unavailable');
  assert.equal(cartBlockNote('choices', naming), 'This dish needs a choice, and the cart can’t hold choices yet.');
  assert.equal(cartBlockNote('unpriced', naming), 'This dish has no menu price yet, so it can’t go in the cart.');
  assert.equal(optionsNote(naming), 'The cart can’t hold extras yet, so the dish goes in on its own.');
  assert.equal(choiceRule(size), 'Required · choose 1');
  assert.equal(choiceRule(extras), 'Optional · up to 2');
  assert.match(optionPrice(extras.options[0]!) ?? '', /^\+ KES\s*150$/);
  assert.equal(optionPrice(size.options[0]!), undefined);
  assert.match(kes(1870), /^KES\s*1,870$/);
  assert.equal(cartPillNote(false), 'Kept on this device');
  assert.equal(cartNote(false), 'Your cart stays on this device. Checkout isn’t on this site yet.');
  assert.equal(cartNote(true), 'Prices are confirmed at checkout.');
  assert.equal(cartSwitchNote('Other Grill'), 'Your cart has items from Other Grill. A new cart replaces them.');
  assert.equal(cartSwitchNote('Other Grill Co.'), 'Your cart has items from Other Grill Co. A new cart replaces them.');
  assert.equal(MAX_DISH_QUANTITY, 50);
});

test('a dish opens the one item sheet: its own options as listed, then the quantity and "Add to cart"', () => {
  kept.clear();
  const sheet = (item: CatalogItem) => dialogOf(render(kitchen, { activeItem: item }));
  const plain = sheet(bowl);
  assert.match(plain, /^<dialog class="item-sheet item-sheet--dish item-sheet--cart"/);
  assert.match(plain, /Chicken Rice Bowl/);
  assert.match(plain, /aria-label="Increase quantity"/);
  assert.match(plain, /<span class="item-sheet__label">Add to cart<\/span><span class="item-sheet__dot" aria-hidden="true">·<\/span><span class="item-sheet__total">KES\s*650<\/span>/);
  assert.match(plain, /Checkout happens on the NexG website\./);
  assert.doesNotMatch(plain, /Order from|this device|add-ons|example|demo|payment|Special request/i, 'inside the store: no store card, and cart words only');
  const required = sheet(burger);
  assert.match(required, /Size<span>Required · choose 1<\/span>/);
  assert.match(required, /\+ KES\s*200/);
  assert.match(required, /Currently unavailable/);
  assert.doesNotMatch(required, /<input/, 'options are listed, not chosen: the cart can’t hold them yet');
  assert.match(required, /class="offering-sheet__primary" disabled=""/);
  assert.match(required, /needs a choice, and the cart can’t hold choices yet/);
  const extra = sheet(wrap);
  assert.match(extra, /Optional · up to 2/);
  assert.match(extra, /goes in on its own/);
  assert.doesNotMatch(extra, /class="offering-sheet__primary" disabled=""/);
  assert.match(sheet(tea), /Price on request[\s\S]*has no listed price yet, so it can’t go in the cart/);
});
