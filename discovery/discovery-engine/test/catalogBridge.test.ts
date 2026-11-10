import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BridgeError, CatalogBridge, PORTAL_SUBCATEGORY_SPELLINGS, SupabaseCatalogReader, areaFromAddress, demoMediaFromSnapshot, merchantQuery, openState, portalMapRows,
  type BridgeFetch, type BridgeMapRow, type CatalogRows, type MerchantRow } from '../src/adapters/supabase/catalogBridge.js';
import { workspace } from './helpers.js';
import { buildBridgeServer } from '../src/bridge/server.js';
import { normalizeMerchantPage } from '../src/adapters/platform/normalize.js';

// Isolated bridge controls (plan step E1). These rows stand in for Supabase replies and are never served as catalog data.
const id = (prefix: string, value: number) => `${prefix}000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const map: BridgeMapRow[] = [
  { demoSubcategoryId: 'restaurants-food_café', demoLabel: 'Café', demoCategoryId: 'restaurants-food', demoCategoryLabel: 'Restaurants & Food',
    supabase: { category: 'restaurants_food', subcategory: 'caf' }, discovery: { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:cafe' }, status: 'mapped' },
  { demoSubcategoryId: 'travel-tours_safaris', demoLabel: 'Safaris', demoCategoryId: 'travel-tours', demoCategoryLabel: 'Travel & Tours',
    supabase: { category: 'travel_tours', subcategory: 'safaris' }, discovery: { categoryId: 'travel-tours', subcategoryId: 'travel-tours:safaris' }, status: 'mapped' },
  { demoSubcategoryId: 'financial-services_banking', demoLabel: 'Banking', demoCategoryId: 'financial-services', demoCategoryLabel: 'Financial Services',
    supabase: { category: 'financial_services', subcategory: 'banking' }, discovery: null, status: 'unmapped' },
];
const merchant = (number: number, name: string, category: string, subcategory: string | null, address: string, extra: Partial<MerchantRow> = {}): MerchantRow => ({
  id: id('c1', number), trading_name: name, category_key: category, subcategory, branch_address: address, branch_latitude: -1.2921, branch_longitude: 36.7856,
  accepting_orders: true, busy_mode_until: null, closed_today: null, opens_today: null, closes_today: null, ...extra });
const rows: CatalogRows = {
  merchants: [
    merchant(1, 'Jua Café', 'restaurants_food', 'caf', 'Kilimani, Nairobi'),
    merchant(2, 'Amani Café', 'restaurants_food', 'caf', 'Westlands, Nairobi'),
    merchant(3, 'Mara Safaris', 'travel_tours', 'safaris', 'Karen, Nairobi'),
    merchant(4, 'Benki Banking', 'financial_services', 'banking', 'CBD, Nairobi'),
    merchant(5, 'Street Kitchen', 'restaurants_food', null, 'Waiyaki Way, Westlands, Nairobi'),
  ],
  items: [
    { id: id('f1', 2), merchant_id: id('c1', 1), name: 'Flat white', description: null, price_kes: null, sort: 1 },
    { id: id('f1', 1), merchant_id: id('c1', 1), name: 'Espresso', description: 'Double shot', price_kes: 450, sort: 0 },
    { id: id('f1', 3), merchant_id: id('c1', 2), name: 'Chai', description: null, price_kes: 150, sort: 0 },
  ],
};
const media = demoMediaFromSnapshot({ merchants: [
  { id: 'M0001', heroImage: 'https://images.example/hero.jpg', logoUrl: 'http://insecure.example/logo.png', items: [{ id: 'I00001', image: 'https://images.example/espresso.jpg' }] },
  { id: 'not-a-demo-code', heroImage: 'https://images.example/ignored.jpg', items: [] },
] });
const loaded = (now = Date.parse('2026-11-09T07:00:00Z')) => { const bridge = new CatalogBridge(map, media); bridge.replace(rows, now); return bridge; };

test('areas come only from two-part Nairobi addresses; anything else stays unknown', () => {
  assert.equal(areaFromAddress('Kilimani, Nairobi'), 'Kilimani');
  assert.equal(areaFromAddress('Waiyaki Way, Westlands, Nairobi'), undefined);
  assert.equal(areaFromAddress('Kilimani, Mombasa'), undefined);
  assert.equal(areaFromAddress(null), undefined);
});

test('open state uses Nairobi time, and unknown hours never default to open', () => {
  const tenAm = Date.parse('2026-11-09T07:00:00Z'); const elevenPm = Date.parse('2026-11-09T20:00:00Z');
  const base = merchant(1, 'Control', 'restaurants_food', 'caf', 'Kilimani, Nairobi');
  assert.equal(openState(base, tenAm), undefined);
  assert.equal(openState({ ...base, accepting_orders: false, opens_today: '08:00:00', closes_today: '17:00:00' }, tenAm), false);
  assert.equal(openState({ ...base, busy_mode_until: '2026-11-09T08:00:00Z', opens_today: '08:00:00', closes_today: '17:00:00' }, tenAm), false);
  assert.equal(openState({ ...base, opens_today: '08:00:00', closes_today: '17:00:00' }, tenAm), true);
  assert.equal(openState({ ...base, opens_today: '08:00:00', closes_today: '17:00:00' }, elevenPm), false);
  assert.equal(openState({ ...base, opens_today: '18:00:00', closes_today: '02:00:00' }, elevenPm), true);
});

test('merchants keep Supabase IDs and gain the demo subcategory, area, coordinates, prices and demo images', () => {
  const detail = loaded().merchant(id('c1', 1));
  assert.deepEqual(detail, {
    id: id('c1', 1), name: 'Jua Café', categoryId: 'restaurants-food', category: 'Restaurants & Food', subcategoryId: 'restaurants-food_café', subcategory: 'Café',
    nairobiArea: 'Kilimani', address: 'Kilimani, Nairobi', latitude: -1.2921, longitude: 36.7856, heroImage: 'https://images.example/hero.jpg',
    items: [
      { id: id('f1', 1), merchantId: id('c1', 1), merchantName: 'Jua Café', name: 'Espresso', description: 'Double shot', price: 450, currency: 'KES', image: 'https://images.example/espresso.jpg' },
      { id: id('f1', 2), merchantId: id('c1', 1), merchantName: 'Jua Café', name: 'Flat white' },
    ],
  });
  // A merchant outside the reviewed map still opens by direct link, without invented categories.
  const unmapped = loaded().merchant(id('c1', 5));
  assert.equal(unmapped.subcategoryId, undefined);
  assert.equal(unmapped.nairobiArea, undefined);
  assert.throws(() => loaded().merchant('M0001'), (error: unknown) => error instanceof BridgeError && error.status === 404);
});

test('selection follows the demo API: exact groups, mapped-only category unions, area, name search and complete pages', () => {
  const bridge = loaded();
  const ids = (query: Parameters<CatalogBridge['merchants']>[0]) => bridge.merchants(query).merchants.map(row => row.name);
  assert.deepEqual(ids({ subcategory: 'restaurants-food_café', limit: 24, offset: 0 }), ['Amani Café', 'Jua Café']);
  assert.deepEqual(ids({ discoveryCategory: 'restaurants-food', limit: 24, offset: 0 }), ['Amani Café', 'Jua Café']);
  assert.deepEqual(ids({ discoveryCategory: 'all', limit: 24, offset: 0 }), ['Amani Café', 'Jua Café', 'Mara Safaris']);
  assert.deepEqual(ids({ subcategory: 'financial-services_banking', limit: 24, offset: 0 }), []);
  assert.deepEqual(ids({ discoveryCategory: 'all', search: ' jua ', limit: 24, offset: 0 }), ['Jua Café']);
  assert.deepEqual(ids({ discoveryCategory: 'all', area: 'Westlands', limit: 24, offset: 0 }), ['Amani Café']);
  assert.deepEqual(bridge.merchants({ discoveryCategory: 'all', limit: 2, offset: 2 }), { total: 3, offset: 2, limit: 2, merchants: [bridge.merchant(id('c1', 3))] });
  assert.deepEqual(bridge.areas(), { areas: ['Karen', 'Kilimani', 'Westlands'] });
});

test('the engine\'s existing source reader accepts bridge pages unchanged, including its strict area check', () => {
  const page = loaded().merchants({ subcategory: 'restaurants-food_café', area: 'Kilimani', limit: 5, offset: 0 });
  const observed = normalizeMerchantPage(JSON.parse(JSON.stringify(page)), 'platform-catalog', '2026-11-09T07:00:00Z', 5, 'Kilimani');
  assert.deepEqual(observed.map(row => [row.presentation.ref.id, row.presentation.area, row.presentation.items.length]), [[id('c1', 1), 'Kilimani', 2]]);
});

test('the reviewed map is checked row by row and gains the merchant portal\'s ten spellings', async () => {
  const raw = JSON.parse(await readFile(join(workspace, 'demo-seed/subcategory-map.json'), 'utf8')) as { subcategories: BridgeMapRow[] };
  const rows = portalMapRows(raw);
  const pair = (category: string, subcategory: string) => rows.filter(row => row.supabase.category === category && row.supabase.subcategory === subcategory);
  assert.equal(pair('restaurants_food', 'cafe').length, 1);
  assert.equal(pair('restaurants_food', 'cafe')[0]!.demoSubcategoryId, pair('restaurants_food', 'caf')[0]!.demoSubcategoryId);
  const present = Object.keys(PORTAL_SUBCATEGORY_SPELLINGS).filter(key => raw.subcategories.some(row => `${row.supabase.category}/${row.supabase.subcategory}` === key));
  assert.equal(present.length, 10, 'every spelling still names a pair in the reviewed map');
  assert.equal(rows.length, raw.subcategories.length + present.length);
  assert.throws(() => portalMapRows({}), /Invalid subcategory map/);
  assert.throws(() => portalMapRows({ subcategories: [{ ...map[0]!, discovery: null }] }), /Invalid subcategory map row/);
  assert.throws(() => portalMapRows({ subcategories: [{ ...map[0]!, supabase: { category: 'Restaurants Food', subcategory: 'caf' } }] }), /Invalid subcategory map row/);
  assert.throws(() => portalMapRows({ subcategories: [map[0], map[0]] }), /Duplicate/);
  // A spelling never replaces a pair the map already has.
  const both = portalMapRows({ subcategories: [map[0], { ...map[1]!, supabase: { category: 'restaurants_food', subcategory: 'cafe' } }] });
  assert.deepEqual(both.filter(row => row.supabase.subcategory === 'cafe').map(row => row.demoSubcategoryId), [map[1]!.demoSubcategoryId]);
});

test('list parameters keep the demo API defaults and reject malformed paging', () => {
  assert.deepEqual(merchantQuery({}), { limit: 24, offset: 0 });
  assert.deepEqual(merchantQuery({ subcategory: 'x', search: '  ', area: 'Karen', sort: 'rating', limit: '200', offset: '48' }), { subcategory: 'x', area: 'Karen', limit: 200, offset: 48 });
  for (const bad of [{ limit: '0' }, { limit: '201' }, { offset: '-1' }, { limit: 'ten' }, { subcategory: ['a', 'b'] }]) {
    assert.throws(() => merchantQuery(bad), (error: unknown) => error instanceof BridgeError && error.status === 400);
  }
});

test('the Supabase reader pages both public views with GET and the public key only', async () => {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const pages: Record<string, unknown[][]> = {
    merchant_public: [[rows.merchants[0], rows.merchants[1]], [rows.merchants[2]]],
    catalogue_public: [[]],
  };
  const fetcher: BridgeFetch = async (href, init) => {
    const url = new URL(href); calls.push({ url, headers: init.headers });
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    const view = url.pathname.split('/').at(-1)!;
    const page = pages[view]![Number(url.searchParams.get('offset')) / 2] ?? [];
    return new Response(JSON.stringify(page), { headers: { 'content-type': 'application/json' } });
  };
  const result = await new SupabaseCatalogReader('http://127.0.0.1:54321', 'public-control-key', fetcher, 2).load();
  assert.equal(result.merchants.length, 3);
  assert.deepEqual(calls.map(call => `${call.url.pathname}?offset=${call.url.searchParams.get('offset')}&limit=${call.url.searchParams.get('limit')}`),
    ['/rest/v1/merchant_public?offset=0&limit=2', '/rest/v1/merchant_public?offset=2&limit=2', '/rest/v1/catalogue_public?offset=0&limit=2']);
  assert.ok(calls.every(call => Object.keys(call.headers).sort().join() === 'Accept,apikey' && call.headers.apikey === 'public-control-key'));
  const failing = (status: number, body: string): BridgeFetch => async () => new Response(body, { status, headers: { 'content-type': 'application/json' } });
  await assert.rejects(new SupabaseCatalogReader('http://127.0.0.1:54321', 'k', failing(401, '{}')).load(), (error: unknown) => error instanceof BridgeError && error.status === 503);
  await assert.rejects(new SupabaseCatalogReader('http://127.0.0.1:54321', 'k', failing(200, '[{"id":7}]')).load(), (error: unknown) => error instanceof BridgeError && error.status === 503);
  assert.throws(() => new SupabaseCatalogReader('http://user:pass@127.0.0.1:54321', 'k'));
  assert.throws(() => new SupabaseCatalogReader('http://127.0.0.1:54321', ''));
});

test('the server answers 503 until loaded, keeps the last good catalog on a failed refresh, and turns stale data into 503', async () => {
  let clock = Date.parse('2026-11-09T07:00:00Z');
  let fail = false;
  const { app, refresh } = buildBridgeServer({ bridge: new CatalogBridge(map, media), now: () => clock, staleAfterMs: 60_000, refreshMs: 3_600_000,
    load: async () => { if (fail) throw new BridgeError(503, 'Supabase is unreachable (merchant_public)'); return rows; } });
  try {
    assert.equal((await app.inject('/api/merchants?subcategory=restaurants-food_caf%C3%A9')).statusCode, 503);
    await refresh();
    const list = await app.inject('/api/merchants?subcategory=restaurants-food_caf%C3%A9&limit=1');
    assert.equal(list.statusCode, 200);
    const body = list.json<{ total: number; offset: number; limit: number; merchants: { name: string }[] }>();
    assert.deepEqual({ ...body, merchants: body.merchants.map(row => row.name) }, { total: 2, offset: 0, limit: 1, merchants: ['Amani Café'] });
    assert.equal(list.headers['cache-control'], 'no-store');
    assert.equal((await app.inject(`/api/merchants/${id('c1', 3)}`)).json().subcategoryId, 'travel-tours_safaris');
    assert.equal((await app.inject('/api/merchants/unknown')).statusCode, 404);
    assert.deepEqual((await app.inject('/api/areas')).json(), { areas: ['Karen', 'Kilimani', 'Westlands'] });
    assert.equal((await app.inject('/api/merchants?limit=999')).statusCode, 400);
    fail = true; clock += 30_000; await refresh();
    const health = await app.inject('/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().lastError, 'Supabase is unreachable (merchant_public)');
    assert.equal((await app.inject('/api/areas')).statusCode, 200);
    clock += 60_000;
    assert.equal((await app.inject('/api/areas')).statusCode, 503);
    assert.equal((await app.inject('/health')).json().status, 'stale');
  } finally { await app.close(); }
});
