import test from 'node:test';
import assert from 'node:assert/strict';
import { NEXG_CART_KEY, addToNexgCart, clearNexgCart, readNexgCart, setNexgCartQuantity } from '../src/cart/nexgCart';

// An in-memory localStorage stand-in; no real storage or website is involved.
const store = new Map<string, string>();
let blocked = false;
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => { if (blocked) throw new Error('blocked'); return store.get(key) ?? null; },
  setItem: (key: string, value: string) => { if (blocked) throw new Error('blocked'); store.set(key, value); },
  removeItem: (key: string) => store.delete(key),
} });
const shop = { id: 'c1000000-0000-4000-8000-000000000001', name: 'Jua Café' };
const other = { id: '7d3f0b6e-1c2a-4f5e-9a8b-0c1d2e3f4a5b', name: 'Kahawa House' };
const espresso = { id: 'f1000000-0000-4000-8000-000000000001', name: 'Espresso', price: 450 };

test('the cart uses the website key and shape, one merchant at a time', () => {
  store.clear();
  assert.deepEqual(readNexgCart(), { merchantId: null, merchantName: null, lines: [] });
  assert.equal(addToNexgCart(shop, espresso), 'added');
  assert.equal(addToNexgCart(shop, espresso), 'added');
  assert.deepEqual(JSON.parse(store.get(NEXG_CART_KEY)!), { merchantId: shop.id, merchantName: 'Jua Café', lines: [{ id: espresso.id, name: 'Espresso', price_kes: 450, quantity: 2 }] });
  const kahawa = { id: 'f1000000-0000-4000-8000-000000000002', name: 'Kahawa', price: 200 };
  assert.equal(addToNexgCart(other, kahawa), 'needs-switch');
  assert.equal(readNexgCart().merchantId, shop.id, 'nothing changes until the shopper agrees');
  assert.equal(addToNexgCart(other, kahawa, { replace: true }), 'switched');
  assert.deepEqual(readNexgCart().lines.map((line) => [line.name, line.quantity]), [['Kahawa', 1]]);
});

test('quantities cap at 50, zero removes the line, and an empty cart resets the merchant', () => {
  store.clear();
  addToNexgCart(shop, espresso);
  setNexgCartQuantity(espresso.id, 80);
  assert.equal(readNexgCart().lines[0]!.quantity, 50);
  assert.equal(addToNexgCart(shop, espresso), 'added');
  assert.equal(readNexgCart().lines[0]!.quantity, 50);
  setNexgCartQuantity(espresso.id, 0);
  assert.deepEqual(readNexgCart(), { merchantId: null, merchantName: null, lines: [] });
  addToNexgCart(shop, espresso);
  clearNexgCart();
  assert.equal(readNexgCart().lines.length, 0);
});

test('unpriced items, demo codes and blocked or broken storage are handled', () => {
  store.clear();
  assert.equal(addToNexgCart(shop, { id: espresso.id, name: 'On request' }), 'unavailable');
  assert.equal(addToNexgCart({ id: 'M0001', name: 'Old link' }, espresso), 'unavailable');
  assert.equal(addToNexgCart(shop, { ...espresso, id: 'I00001' }), 'unavailable');
  store.set(NEXG_CART_KEY, '{not json');
  assert.deepEqual(readNexgCart().lines, []);
  blocked = true;
  try {
    assert.deepEqual(readNexgCart().lines, []);
    assert.equal(addToNexgCart(shop, espresso), 'unavailable');
  } finally { blocked = false; }
});
