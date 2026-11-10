import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem } from '../src/providers/DiscoveryProvider';
import { readNexgCart, type NexgCartLine } from '../src/cart/nexgCart';
import { cartable, checkoutNote, itemCount, kes, putInCart, setStoreCartQuantity, storeCartView } from '../src/components/cart/useStoreCart';
import { CartPill } from '../src/components/cart/CartPill';
import { CartSheet, CartSwitchDialog } from '../src/components/cart/CartSheet';

// The NexG cart lives in localStorage; this file runs in its own process, so a stand-in is safe.
const kept = new Map<string, string>();
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => { kept.set(key, String(value)); },
  removeItem: (key: string) => { kept.delete(key); },
} });

// Isolated controls, never catalogue data. The cart takes only Supabase-style UUIDs.
const noop = () => {};
const uuid = (n: number) => `c1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const store = { id: uuid(1), name: 'Control Supermarket' };
const other = { id: uuid(2), name: 'Other Grocer' };
const product = (shop: string, n: number, name: string, price?: number, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id: uuid(n), merchantId: shop, name, ...(price === undefined ? {} : { price, currency: 'KES' }), ...extra });
const milk = product(store.id, 11, 'Milk', 170, { image: 'https://example.test/milk.jpg' });
const bread = product(store.id, 12, 'Bread', 65);
const apples = product(other.id, 21, 'Apples', 300);
const line = (item: CatalogItem, quantity: number): NexgCartLine => ({ id: item.id, name: item.name, price_kes: item.price!, quantity });

test('the + adds one, the sheet sets a quantity, and another store’s cart is never replaced without asking', () => {
  kept.clear();
  assert.equal(putInCart(store, milk, undefined), 'added');
  assert.equal(putInCart(store, milk, undefined), 'added');
  assert.equal(putInCart(store, bread, 3), 'added');
  assert.equal(putInCart(store, milk, 5), 'added');
  assert.deepEqual(readNexgCart().lines.map((entry) => [entry.name, entry.quantity]), [['Milk', 5], ['Bread', 3]]);
  const view = storeCartView(readNexgCart(), store.id);
  assert.deepEqual([view.count, view.subtotalKes, view.otherStore], [8, 5 * 170 + 3 * 65, undefined]);
  setStoreCartQuantity(store.id, bread.id, 0);
  assert.deepEqual(readNexgCart().lines.map((entry) => entry.name), ['Milk']);

  assert.equal(putInCart(other, apples, undefined), 'needs-switch');
  assert.deepEqual(storeCartView(readNexgCart(), other.id), { lines: [], count: 0, subtotalKes: 0, otherStore: 'Control Supermarket' });
  assert.equal(putInCart(other, apples, 2, true), 'switched');
  assert.deepEqual(readNexgCart(), { merchantId: other.id, merchantName: 'Other Grocer', lines: [line(apples, 2)] });
  setStoreCartQuantity(store.id, milk.id, 4);
  assert.deepEqual(readNexgCart().lines, [line(apples, 2)], 'a store can’t change another store’s cart');

  // What the cart can't take: no price, another store's item, an unavailable product.
  assert.equal(putInCart(other, product(other.id, 22, 'Mystery Jar'), undefined), 'unavailable');
  assert.equal(putInCart(other, milk, undefined), 'unavailable');
  assert.equal(putInCart(other, { ...apples, isAvailable: false }, undefined), 'unavailable');
});

test('cart words: what can go in, how much, and one honest line about checkout', () => {
  assert.equal(cartable(milk), true);
  assert.equal(cartable({ price: 0, currency: 'KES' }), false);
  assert.equal(cartable({ price: 100, currency: 'USD' }), false);
  assert.equal(cartable({ price: 100, currency: 'KES', isAvailable: false }), false);
  assert.equal(itemCount(1), '1 item');
  assert.equal(itemCount(3), '3 items');
  assert.match(kes(3400), /^KES\s3,400$/);
  assert.equal(checkoutNote(), 'Checkout happens on the NexG website.');
  assert.equal(checkoutNote('https://nexgapp.test/checkout'), 'Prices are confirmed at checkout.');
});

test('the pill shows only with this store’s lines and opens the cart', () => {
  assert.equal(renderToStaticMarkup(<CartPill count={0} subtotalKes={0} onOpen={noop} />), '');
  const pill = renderToStaticMarkup(<CartPill count={3} subtotalKes={405} onOpen={noop} />);
  assert.match(pill, /class="store-basket cart-pill"/);
  assert.match(pill, /3 items · KES\s405/);
  assert.match(pill, /aria-label="View cart: 3 items, KES\s405">View cart</);
  assert.doesNotMatch(pill, /list|demo/i);
});

test('your cart: the store’s photos, prices, the shared stepper, subtotal, clear and checkout only when it exists', () => {
  const cart = { lines: [line(milk, 2), line(bread, 1)], count: 3, subtotalKes: 405 };
  const sheet = (checkoutUrl?: string) => renderToStaticMarkup(<CartSheet merchant={store} cart={{ ...cart, checkoutUrl }} items={[milk, bread]} onClose={noop} />);
  const html = sheet();
  assert.match(html, /<h2 id="[^"]+">Your cart<\/h2>/);
  assert.match(html, /Control Supermarket · 3 items/);
  assert.match(html, /src="https:\/\/example.test\/milk.jpg"/);
  assert.match(html, /KES\s340 · KES\s170 each/);
  assert.match(html, /aria-label="Decrease milk quantity"/);
  assert.match(html, /aria-label="Increase bread quantity"/);
  assert.match(html, /<span>Subtotal<\/span><strong>KES\s405<\/strong>/);
  assert.match(html, />Clear cart</);
  assert.match(html, /Checkout happens on the NexG website\./);
  assert.doesNotMatch(html, /Go to checkout|demo/i);
  const live = sheet('https://nexgapp.test/checkout');
  assert.match(live, /<a class="cart-sheet__primary" href="https:\/\/nexgapp.test\/checkout">Go to checkout<\/a>/);
  assert.match(live, /Prices are confirmed at checkout\./);
  const empty = renderToStaticMarkup(<CartSheet merchant={store} cart={{ lines: [], count: 0, subtotalKes: 0 }} items={[]} onClose={noop} />);
  assert.match(empty, /Your cart is empty/);
  assert.doesNotMatch(empty, /Clear cart|Subtotal/);
});

test('starting a new cart asks first, in plain words', () => {
  const html = renderToStaticMarkup(<CartSwitchDialog current="Other Grocer" onKeep={noop} onStart={noop} />);
  assert.match(html, />Start a new cart\?</);
  assert.match(html, /Your cart has items from Other Grocer\. Starting a new cart removes them\./);
  assert.match(html, />Keep current cart</);
  assert.match(html, />Start new cart</);
});
