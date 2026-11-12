import test from 'node:test';
import assert from 'node:assert/strict';
import subcategoryMap from '../demo-seed/subcategory-map.json';
import { areaFromAddress, demoMediaFromSnapshot, type BridgeMapRow } from '../src/providers/catalogBridge';
import { SUBCATEGORY_KEY_ALIASES, SupabaseDiscoveryProvider, supabaseMapRows, type SupabaseFetch, type SupabaseProviderOptions } from '../src/providers/supabaseProvider';
import { SUPABASE_PROVIDER_VERSION, supabaseCapabilities, supabaseKeyRole, supabaseSettings } from '../src/providers/supabaseSettings';
import { packDemoMedia, unpackDemoMedia } from '../src/providers/demoMedia';
import { lazySupabaseProvider } from '../src/providers/lazySupabaseProvider';
import { createDiscoveryProvider } from '../src/providers/providerFactory';
import { platformMerchantProvider } from '../src/providers/platformMerchantProvider';
import { failureFrom } from '../src/providers/readState';
import { HIDDEN_CATEGORY_IDS, categories, findCategory, findSubcategory } from '../src/data/taxonomy';
import type { DiscoveryProvider } from '../src/providers/DiscoveryProvider';

// Isolated Supabase controls (plan step E2). These rows stand in for PostgREST replies and are never served as catalog data.
const KEY = 'sb_publishable_control-key-7f3a91';
const LOCAL = 'http://127.0.0.1:54321';
const id = (prefix: 'c1' | 'f1' | 'f2', value: number) => `${prefix}000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const REAL = '7d3f0b6e-1c2a-4f5e-9a8b-0c1d2e3f4a5b';
const REAL_ITEM = '7d3f0b6e-1c2a-4f5e-9a8b-0c1d2e3f9999';
const mapRows = (subcategoryMap as unknown as { subcategories: BridgeMapRow[] }).subcategories;

type Row = Record<string, unknown>;
const merchant = (merchantId: string, name: string, category: string, subcategory: string | null, address: string | null, extra: Row = {}): Row => ({
  id: merchantId, trading_name: name, category_key: category, subcategory, branch_address: address, branch_latitude: -1.2921, branch_longitude: 36.7856,
  accepting_orders: true, busy_mode_until: null, closed_today: null, opens_today: null, closes_today: null, cover_photo_path: 'private/never-selected.jpg', ...extra });
const item = (itemId: string, merchantId: string, name: string, price: number | null, sort: number | null, description: string | null = null, section: string | null = null): Row => ({
  id: itemId, merchant_id: merchantId, section_id: section, name, description, price_kes: price, sort, available: true });

const merchants: Row[] = [
  merchant(id('c1', 1), 'Jua Café', 'restaurants_food', 'caf', 'Kilimani, Nairobi'),
  merchant(id('c1', 2), 'Amani Café', 'restaurants_food', 'caf', 'Westlands, Nairobi', { opens_today: '08:00:00', closes_today: '17:00:00' }),
  // A merchant onboarded through the console carries category_config's spelling, "cafe".
  merchant(REAL, 'Kahawa House', 'restaurants_food', 'cafe', 'Kilimani, Nairobi'),
  merchant(id('c1', 10), 'Hodari 50%_Off Café', 'restaurants_food', 'caf', 'Westlands, Nairobi', { accepting_orders: false }),
  merchant(id('c1', 3), 'Mara Safaris', 'travel_tours', 'safaris', 'Karen, Nairobi'),
  merchant(id('c1', 4), 'Benki Banking', 'financial_services', 'banking', 'CBD, Nairobi'),
  merchant(id('c1', 5), 'Street Kitchen', 'restaurants_food', null, 'Kilimani, Nairobi'),
  merchant(id('c1', 6), 'Utulivu Spa', 'wellness', 'spa', ' Kilimani ,  NAIROBI '),
  merchant(id('c1', 7), 'Mwangaza Massage', 'wellness', 'massage', 'Kilimani, Mombasa'),
  merchant(id('c1', 8), 'Tamasha Concerts', 'experiences', 'concerts', "St. Austin's (Upper), Nairobi"),
  merchant(id('c1', 9), 'Picha Studio', 'experiences', 'photography', 'Lavington Mall, Lavington, Nairobi'),
];
const items: Row[] = [
  // Jua's 35 items sit in one catch-all section, as every demo store's do.
  ...Array.from({ length: 35 }, (_, index) => item(id('f1', index + 1), id('c1', 1), ['Espresso', 'Flat white'][index] ?? `Jua item ${index + 1}`,
    index === 1 ? null : 450, index, index === 0 ? 'Double shot' : null, id('f2', 1))),
  item(id('f1', 101), id('c1', 2), 'Chai', 150, 0),
  item(REAL_ITEM, REAL, 'Kahawa', 200, 0),
  item(id('f1', 102), id('c1', 10), 'Half-price latte', 125, 0),
  // Mara splits its catalogue into two named sections; one trip has none.
  item(id('f1', 201), id('c1', 3), 'Mara day trip', 15000, 0, null, id('f2', 3)),
  item(id('f1', 202), id('c1', 3), 'Amboseli in two days', 42000, 1, null, id('f2', 30)),
  item(id('f1', 203), id('c1', 3), 'Nairobi National Park', 6000, 2),
  item(id('f1', 301), id('c1', 8), 'Sauti Live', 2500, 0),
  item(id('f1', 302), id('c1', 8), 'Jazz night', 1800, 1),
  item(id('f1', 401), id('c1', 9), 'Portrait session', 5000, 0),
];
const sections: Row[] = [
  { id: id('f2', 1), merchant_id: id('c1', 1), name: 'Menu', blurb: null, sort: 0 },
  { id: id('f2', 3), merchant_id: id('c1', 3), name: 'Day trips', blurb: null, sort: 1 },
  { id: id('f2', 30), merchant_id: id('c1', 3), name: ' Safaris ', blurb: null, sort: 0 },
];
const media = demoMediaFromSnapshot({ merchants: [
  { id: 'M0001', heroImage: 'https://images.example/hero.jpg', logoUrl: 'http://insecure.example/logo.png', items: [{ id: 'I00001', image: 'https://images.example/espresso.jpg' }] },
  { id: 'M0003', heroImage: 'https://images.example/mara.jpg', items: [] },
  { id: 'not-a-demo-code', heroImage: 'https://images.example/ignored.jpg', items: [] },
] });

// A small stand-in for PostgREST: only the filters, orders and headers the provider sends; anything else fails the test.
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
function likeExpression(pattern: string): RegExp {
  let source = '';
  const characters = [...pattern.replace(/\*/g, '%')];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    if (character === '\\') source += escapeRegExp(characters[++index] ?? '');
    else source += character === '%' ? '.*' : character === '_' ? '.' : escapeRegExp(character);
  }
  return new RegExp(`^${source}$`, 'is');
}
function condition(value: unknown, filter: string): boolean {
  const [operator, ...rest] = filter.split('.');
  const operand = rest.join('.');
  if (operator === 'eq') return value !== null && String(value) === operand;
  if (operator === 'in') { assert.match(operand, /^\(.+\)$/); return value !== null && operand.slice(1, -1).split(',').includes(String(value)); }
  if (operator === 'ilike') return typeof value === 'string' && likeExpression(operand).test(value);
  // PostgreSQL's [[:space:]] is \s; a backslash before punctuation means the character itself in both dialects.
  if (operator === 'match') return typeof value === 'string' && new RegExp(operand.replace(/\[\[:space:\]\]/g, '\\s')).test(value);
  return assert.fail(`unexpected filter ${filter}`);
}
/** Splits a PostgREST logic list at top-level commas, respecting parentheses and double-quoted values. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0; let inQuote = false; let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuote) { if (character === '\\') index += 1; else if (character === '"') inQuote = false; continue; }
    if (character === '"') inQuote = true;
    else if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}
/** Evaluates and(...)/or(...) trees and their column.operator.value leaves, unquoting "..." values. */
function logic(row: Row, expression: string): boolean {
  const tree = /^(and|or)\((.*)\)$/s.exec(expression);
  if (tree) { const results = splitTop(tree[2]!).map((part) => logic(row, part)); return tree[1] === 'and' ? results.every(Boolean) : results.some(Boolean); }
  const [column, ...rest] = expression.split('.');
  let filter = rest.join('.');
  const quotedValue = /^(\w+)\."((?:[^"\\]|\\.)*)"$/.exec(filter);
  if (quotedValue) filter = `${quotedValue[1]}.${quotedValue[2]!.replace(/\\(.)/g, '$1')}`;
  return condition(row[column!], filter);
}
function ordering(order: string | null) {
  const keys = (order ?? '').split(',').filter(Boolean).map((part) => {
    const [column, direction, nulls] = part.split('.');
    assert.ok(column && ['asc', 'desc'].includes(direction ?? ''), part);
    return { column, descending: direction === 'desc', nullsFirst: nulls === 'nullsfirst' };
  });
  return (left: Row, right: Row) => {
    for (const key of keys) {
      const a = left[key.column];
      const b = right[key.column];
      if (a === b) continue;
      if (a === null || a === undefined) return key.nullsFirst ? -1 : 1;
      if (b === null || b === undefined) return key.nullsFirst ? 1 : -1;
      // Code-unit order, like a C collation; Supabase's own collation may differ, and the provider never re-sorts merchants.
      const result = (a as string | number) < (b as string | number) ? -1 : 1;
      return key.descending ? -result : result;
    }
    return 0;
  };
}
interface Stub { merchants?: Row[]; items?: Row[]; maxRows?: number; exposeCount?: boolean; status?: number; failView?: string; fail?: () => Promise<Response> }
function postgrest(stub: Stub = {}) {
  const tables: Record<string, Row[]> = { merchant_public: stub.merchants ?? merchants, catalogue_public: stub.items ?? items, catalogue_section: sections };
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetch: SupabaseFetch = async (href, init) => {
    const url = new URL(href);
    calls.push({ url, init });
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    if (init.signal?.aborted) throw init.signal.reason;
    if (stub.fail) return stub.fail();
    if (stub.status) return new Response('{"message":"control failure"}', { status: stub.status, headers: { 'Content-Type': 'application/json' } });
    const view = url.pathname.replace(/^\/rest\/v1\//, '');
    if (stub.failView === view) return new Response('{"message":"control failure"}', { status: 500, headers: { 'Content-Type': 'application/json' } });
    let rows = tables[view] ?? assert.fail(`unexpected view ${url.pathname}`);
    for (const [key, value] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      rows = rows.filter((row) => key === 'or' || key === 'and' ? logic(row, `${key}${value}`) : condition(row[key], value));
    }
    rows = [...rows].sort(ordering(url.searchParams.get('order')));
    const total = rows.length;
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 'Infinity'), stub.maxRows ?? 1000);
    const counted = new Headers(init.headers).get('Prefer') === 'count=exact';
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (counted && offset > 0 && offset >= total) {
      if (stub.exposeCount !== false) headers.set('Content-Range', `*/${total}`);
      return new Response('{"code":"PGRST103"}', { status: 416, headers });
    }
    const columns = (url.searchParams.get('select') ?? '').split(',');
    const page = rows.slice(offset, offset + limit).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
    if (counted && stub.exposeCount !== false) headers.set('Content-Range', page.length ? `${offset}-${offset + page.length - 1}/${total}` : `*/${total}`);
    return new Response(JSON.stringify(page), { status: 200, headers });
  };
  return { fetch, calls };
}
const clock = Date.parse('2026-11-09T07:00:00Z'); // 10:00 in Nairobi
function setup(stub: Stub = {}, options: Partial<SupabaseProviderOptions> = {}) {
  const server = postgrest(stub);
  const provider = new SupabaseDiscoveryProvider({ url: LOCAL, anonKey: KEY, fetch: server.fetch, now: () => clock, media: async () => media, ...options });
  return { provider, calls: server.calls };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown> & { items: Record<string, unknown>[] };
const names = (result: { merchants: { name: string }[] }) => result.merchants.map((row) => row.name);
const kind = (expected: string) => (error: unknown) => failureFrom(error).kind === expected;
const reads = (calls: { url: URL }[], view: string) => calls.filter((call) => call.url.pathname.endsWith(`/${view}`));

test('settings accept the project URL and a public key only, and errors never repeat the key', () => {
  assert.deepEqual(supabaseSettings(LOCAL, KEY), { origin: LOCAL, anonKey: KEY });
  assert.equal(supabaseSettings('https://abcdefgh.supabase.co/', 'sb_publishable_control').origin, 'https://abcdefgh.supabase.co');
  const jwt = (role: string) => `header.${btoa(JSON.stringify({ role, iss: 'supabase' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
  assert.equal(supabaseKeyRole(jwt('anon')), 'anon');
  assert.equal(supabaseKeyRole(jwt('service_role')), 'service_role');
  assert.equal(supabaseKeyRole('sb_secret_control'), 'secret');
  assert.equal(supabaseKeyRole('opaque-control'), undefined);
  // Fail closed: anything not recognisably public is refused, including a JWT without a role.
  assert.throws(() => supabaseSettings(LOCAL, 'opaque-control-value'), /anon or publishable/);
  assert.throws(() => supabaseSettings(LOCAL, `header.${btoa('{"iss":"supabase"}')}.signature`), /anon or publishable/);
  assert.equal(supabaseSettings(LOCAL, jwt('anon')).anonKey, jwt('anon'));
  const refused: [unknown, string][] = [
    ['http://example.com', KEY], ['https://abcdefgh.supabase.co/rest/v1', KEY], ['https://user:pass@abcdefgh.supabase.co', KEY], ['https://abcdefgh.supabase.co?x=1', KEY],
    ['ftp://abcdefgh.supabase.co', KEY], [undefined, KEY], ['', KEY], [LOCAL, ''], [LOCAL, 'two words-control-key'], [LOCAL, jwt('service_role')], [LOCAL, 'sb_secret_control-key-123'],
  ];
  for (const [url, key] of refused) {
    assert.throws(() => supabaseSettings(url, key), (error: unknown) => error instanceof Error && (!key || !error.message.includes(key)), String(url));
  }
});

test('the reviewed map loads with every console spelling, each selecting the same row as the seed spelling', () => {
  const rows = supabaseMapRows(subcategoryMap);
  assert.equal(rows.length, mapRows.length + Object.keys(SUBCATEGORY_KEY_ALIASES).length, 'no alias is stale or collides');
  for (const [pair, subcategory] of Object.entries(SUBCATEGORY_KEY_ALIASES)) {
    const seed = rows.find((row) => `${row.supabase.category}/${row.supabase.subcategory}` === pair);
    const alias = rows.find((row) => row.supabase.category === seed?.supabase.category && row.supabase.subcategory === subcategory);
    assert.ok(seed && alias, pair);
    assert.deepEqual({ ...alias, supabase: seed.supabase }, seed);
  }
  const [first] = mapRows;
  assert.throws(() => supabaseMapRows({ subcategories: [{ ...first, status: 'maybe' }] }), /Invalid subcategory map row/);
  assert.throws(() => supabaseMapRows({ subcategories: [first, first] }), /Duplicate/);
  assert.throws(() => supabaseMapRows({}), /Invalid subcategory map/);
});

test('a subcategory page reads only its merchants and their items, with the public key, in the platform shape', async () => {
  const { provider, calls } = setup();
  const first = await provider.getMerchants({ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf', limit: 2 });
  assert.deepEqual(names(first), ['Amani Café', 'Hodari 50%_Off Café']);
  assert.deepEqual({ total: first.total, offset: first.offset, hasMore: first.hasMore, mapping: first.mapping }, { total: 4, offset: 0, hasMore: true, mapping: 'mapped' });
  const [page, itemsRead] = calls;
  assert.equal(page!.url.pathname, '/rest/v1/merchant_public');
  assert.deepEqual(Object.fromEntries(page!.url.searchParams), {
    select: 'id,trading_name,category_key,subcategory,branch_address,branch_latitude,branch_longitude,accepting_orders,busy_mode_until,closed_today,opens_today,closes_today,featured,closed_early_at',
    category_key: 'eq.restaurants_food', subcategory: 'in.(caf,cafe)', order: 'featured.desc.nullslast,trading_name.asc,id.asc', limit: '2', offset: '0' });
  assert.equal(itemsRead!.url.pathname, '/rest/v1/catalogue_public');
  assert.equal(itemsRead!.url.searchParams.get('merchant_id'), `in.(${id('c1', 2)},${id('c1', 10)})`);
  assert.equal(itemsRead!.url.searchParams.get('order'), 'merchant_id.asc,sort.asc.nullsfirst,id.asc');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.deepEqual(Object.keys(call.init.headers as Record<string, string>).sort(), ['Accept', 'Prefer', 'apikey']);
    assert.equal((call.init.headers as Record<string, string>).apikey, KEY);
    assert.equal(call.url.href.includes(KEY), false);
  }
  const second = await provider.getMerchants({ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf', limit: 2, offset: 2 });
  assert.deepEqual(names(second), ['Jua Café', 'Kahawa House']);
  assert.equal(second.hasMore, false);
  const [amani, hodari] = first.merchants;
  assert.deepEqual(plain(amani), {
    id: id('c1', 2), name: 'Amani Café', categoryId: 'restaurants-food', subcategoryId: 'restaurants-food_café', category: 'Restaurants And Food', subcategory: 'Café',
    isFeatured: false, isOpen: true, latitude: -1.2921, longitude: 36.7856, area: 'Westlands', address: 'Westlands, Nairobi',
    items: [{ id: id('f1', 101), merchantId: id('c1', 2), merchantName: 'Amani Café', name: 'Chai', price: 150, currency: 'KES' }],
  });
  assert.equal(hodari!.isOpen, false);
  // The console spelling lands in the same Discovery subcategory, with the same demo source ID the storefronts select on.
  const kahawa = plain(second.merchants[1]);
  assert.deepEqual([kahawa.id, kahawa.subcategoryId, kahawa.subcategory, kahawa.heroImage], [REAL, 'restaurants-food_café', 'Café', undefined]);
});

test('category browse reads whole platform categories; "all" never shows categories kept off customer screens', async () => {
  const { provider, calls } = setup();
  const beauty = await provider.getMerchants({ categoryId: 'beauty-wellness' });
  assert.deepEqual(names(beauty), ['Mwangaza Massage', 'Utulivu Spa']);
  assert.equal(calls[0]!.url.searchParams.get('category_key'), 'in.(beauty,wellness)');
  assert.equal(calls[0]!.url.searchParams.get('subcategory'), null);
  const all = await provider.getMerchants({ limit: 48 });
  // Street Kitchen has no subcategory and is listed; Benki Banking's category (Financial Services) has no Discovery category.
  assert.deepEqual(names(all), ['Amani Café', 'Hodari 50%_Off Café', 'Jua Café', 'Kahawa House', 'Mara Safaris', 'Mwangaza Massage', 'Picha Studio', 'Street Kitchen', 'Tamasha Concerts', 'Utulivu Spa']);
  const massage = await provider.getMerchants({ categoryId: 'beauty-wellness', subcategoryId: 'beauty-wellness:massage' });
  assert.deepEqual(plain(massage.merchants[0]).subcategoryId, 'wellness_massage');
});

test('a store with no subcategory, or one the map does not know, is listed under its category but never under a type', async () => {
  const pizza = merchant(id('c1', 11), 'Pizza Mtaani', 'restaurants_food', 'pizzeria', 'Westlands, Nairobi');
  const { provider } = setup({ merchants: [...merchants, pizza] });
  const food = await provider.getMerchants({ categoryId: 'restaurants-food' });
  assert.deepEqual(names(food), ['Amani Café', 'Hodari 50%_Off Café', 'Jua Café', 'Kahawa House', 'Pizza Mtaani', 'Street Kitchen']);
  assert.deepEqual(names(await provider.getMerchants({ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' })),
    ['Amani Café', 'Hodari 50%_Off Café', 'Jua Café', 'Kahawa House']);
  // The card keeps the store's category and invents no subcategory.
  const street = plain(food.merchants.find((row) => row.name === 'Street Kitchen'));
  assert.deepEqual([street.categoryId, street.category, street.subcategoryId, street.subcategory], ['restaurants-food', 'Restaurants And Food', undefined, undefined]);
  const all = plain((await provider.getMerchants({ limit: 48 })).merchants.find((row) => row.name === 'Pizza Mtaani'));
  assert.deepEqual([all.categoryId, all.category, all.subcategory], ['restaurants-food', 'Restaurants And Food', undefined]);
  // Search finds them by name, and by their category's name.
  assert.deepEqual(names(await provider.getMerchants({ search: 'street' })), ['Street Kitchen']);
  assert.deepEqual(names(await provider.getMerchants({ categoryId: 'restaurants-food', search: 'pizza' })), ['Pizza Mtaani']);
  assert.deepEqual(names(await provider.getMerchants({ search: 'restaurants' })), names(food));
  // A subcategory's name still matches only that subcategory's stores.
  assert.deepEqual(names(await provider.getMerchants({ search: 'cafe' })), ['Amani Café', 'Hodari 50%_Off Café', 'Jua Café', 'Kahawa House']);
});

test('with no subcategories at all, as in production today, every store is listed by its category', async () => {
  const stores = [
    merchant(REAL, 'Soko Grill', 'restaurants_food', null, 'Westlands, Nairobi'),
    merchant(id('c1', 21), 'Maua Flowers', 'flowers_gifts', null, 'Karen, Nairobi'),
    merchant(id('c1', 22), 'Afya Pharmacy', 'pharmacy', null, 'Kilimani, Nairobi'),
    merchant(id('c1', 23), 'Benki Banking', 'financial_services', null, 'CBD, Nairobi'),
  ];
  const { provider } = setup({ merchants: stores, items: [item(REAL_ITEM, REAL, 'Nyama choma', 1450, 0)] });
  assert.deepEqual(names(await provider.getMerchants({})), ['Afya Pharmacy', 'Maua Flowers', 'Soko Grill']);
  const food = await provider.getCollections('restaurants-food');
  assert.deepEqual(food.collections.map((collection) => [collection.title, collection.subcategoryId, collection.viewAllQuery, names(collection)]),
    [['All stores', undefined, { categoryId: 'restaurants-food' }, ['Soko Grill']]]);
  assert.deepEqual(food.collections[0]!.merchants[0]!.items.map((entry) => [entry.name, entry.price]), [['Nyama choma', 1450]]);
  assert.deepEqual(names(await provider.getMerchants({ categoryId: 'health-pharmacy' })), ['Afya Pharmacy']);
  assert.deepEqual(names(await provider.getMerchants({ categoryId: 'health-pharmacy', subcategoryId: 'health-pharmacy:pharmacy' })), []);
  assert.deepEqual(await provider.getAreas(), ['Karen', 'Kilimani', 'Westlands']);
});

test('Play and Flights are on screen: a Play store lists under Play, and Flights reads nothing until it has a platform category', async () => {
  assert.equal(HIDDEN_CATEGORY_IDS.size, 0);
  assert.ok(categories.some((category) => category.id === 'play') && categories.some((category) => category.id === 'flights'));
  assert.ok(findCategory('play') && findCategory('flights'));
  const bowling = merchant(id('c1', 31), 'Strike Bowling', 'activities_games_sports', 'bowling', 'Westlands, Nairobi');
  const { provider } = setup({ merchants: [...merchants, bowling] });
  assert.ok(names(await provider.getMerchants({ categoryId: 'play' })).includes('Strike Bowling'));
  const flights = await provider.getMerchants({ categoryId: 'flights' });
  assert.deepEqual(flights.merchants, []);
  assert.equal(flights.mapping, 'unmapped');
});

test('search escapes LIKE wildcards, and the area filter matches exactly what areaFromAddress names', async () => {
  const { provider, calls } = setup();
  const wild = await provider.getMerchants({ search: ' %_ ' });
  assert.deepEqual(names(wild), ['Hodari 50%_Off Café']);
  assert.equal(reads(calls, 'merchant_public')[0]!.url.searchParams.get('trading_name'), 'ilike.*\\%\\_*');
  // The item read escapes the same way, inside a quoted or() value.
  assert.equal(reads(calls, 'catalogue_public')[0]!.url.searchParams.get('or'), '(name.ilike."*\\\\%\\\\_*",description.ilike."*\\\\%\\\\_*")');
  // As on the demo API, a search also matches category and subcategory names: "cafe" finds every Café merchant.
  assert.deepEqual(names(await provider.getMerchants({ search: 'CAFE' })), ['Amani Café', 'Hodari 50%_Off Café', 'Jua Café', 'Kahawa House']);
  assert.deepEqual(names(await provider.getMerchants({ search: 'kahawa' })), ['Kahawa House']);
  assert.deepEqual(names(await provider.getMerchants({ categoryId: 'travel-tours', search: 'safari' })), ['Mara Safaris']);
  // "safari" is in the category's own name (Safaris And Tours), so it matches the whole platform category.
  assert.equal(calls.at(-2)!.url.searchParams.get('and'), '(or(category_key.in.(travel_tours)),or(trading_name.ilike."*safari*",category_key.eq.travel_tours))');
  const kilimani = await provider.getMerchants({ area: 'Kilimani', limit: 8, sort: 'recommended' });
  assert.deepEqual(names(kilimani), ['Jua Café', 'Kahawa House', 'Street Kitchen', 'Utulivu Spa']);
  assert.ok(kilimani.merchants.every((row) => row.area === 'Kilimani'));
  // The server-side pattern agrees with areaFromAddress on every listed fixture address (Financial Services is never listed).
  for (const area of ['Kilimani', 'Westlands', 'Karen', 'Lavington', "St. Austin's (Upper)", 'Mombasa']) {
    const expected = merchants.filter((row) => row.category_key !== 'financial_services' && areaFromAddress(row.branch_address as string | null) === area).map((row) => row.trading_name).sort();
    assert.deepEqual(names(await provider.getMerchants({ area, limit: 48 })).sort(), expected, area);
  }
  const before = calls.length;
  assert.deepEqual(names(await provider.getMerchants({ area: 'Kilimani, Nairobi' })), []);
  assert.deepEqual(names(await provider.getMerchants({ area: ' Kilimani' })), []);
  assert.equal(calls.length, before, 'an area no address can name needs no request');
  assert.deepEqual(names(await provider.getMerchants({ area: "St. Austin's (Upper" })), []);
  assert.deepEqual(names(await provider.getMerchants({ area: 'all', categoryId: 'travel-tours' })), ['Mara Safaris']);
});

test('search finds a store by an item it lists, inside the selected category and area, with the matching items first', async () => {
  // Owner, 12 Nov 2026: "when i search ugali or a merchant offering, nothing appears".
  const grill = id('c1', 11);
  const extra = [merchant(grill, 'Sokoni Grill House', 'restaurants_food', 'caf', 'Westlands, Nairobi')];
  const menu = [
    ...Array.from({ length: 31 }, (_, index) => item(id('f1', 501 + index), grill, `Grill item ${index + 1}`, 300, index)),
    // Past the 30-item list cap, and matched only by its description.
    item(id('f1', 600), grill, 'Sukuma plate', 350, 40, 'Served with ugali'),
    item(id('f1', 601), grill, 'Ugali', 100, 41),
    // The same dish at a spa: outside the Restaurants scope, so it never adds the spa there.
    item(id('f1', 602), id('c1', 6), 'Ugali bowl', 200, 0),
  ];
  const { provider, calls } = setup({ merchants: [...merchants, ...extra], items: [...items, ...menu] });
  const found = await provider.getMerchants({ search: 'ugali' });
  assert.deepEqual(names(found), ['Sokoni Grill House', 'Utulivu Spa']);
  const card = plain(found.merchants[0]);
  assert.deepEqual(card.items.slice(0, 2).map((entry) => entry.name), ['Sukuma plate', 'Ugali']);
  assert.equal(card.items.length, 30);
  const scoped = await provider.getMerchants({ categoryId: 'restaurants-food', search: 'ugali' });
  assert.deepEqual(names(scoped), ['Sokoni Grill House']);
  // Both item matches ride in the name group; the category group is what keeps the spa out.
  assert.match(reads(calls, 'merchant_public').at(-1)!.url.searchParams.get('and') ?? '', new RegExp(`^\\(or\\(category_key\\.in\\.\\(restaurants_food\\)\\),or\\(trading_name\\.ilike\\."\\*ugali\\*",id\\.in\\.\\(${id('c1', 6)},${grill}\\)\\)\\)$`));
  assert.deepEqual(names(await provider.getMerchants({ categoryId: 'restaurants-food', search: 'ugali', area: 'Kilimani' })), []);
  // Category rows use the same match.
  const rows = await provider.getCollections('restaurants-food', { search: 'ugali' });
  assert.ok(rows.collections.every((collection) => collection.merchants.every((entry) => entry.name === 'Sokoni Grill House')));
});

test('suggestions list stores and items with the letters in order, best and promoted first, only from shown stores', async () => {
  const extra = [
    merchant(id('c1', 11), 'Sokoni Grill House', 'restaurants_food', 'caf', 'Westlands, Nairobi'),
    merchant(id('c1', 12), 'Ugali Corner', 'restaurants_food', 'caf', 'Kilimani, Nairobi'),
    merchant(id('c1', 13), 'Mama Ugali Grill', 'restaurants_food', 'caf', 'Karen, Nairobi', { featured: true }),
  ];
  const menu = [item(id('f1', 601), id('c1', 11), 'Ugali', 100, 0), item(id('f1', 602), id('c1', 11), 'Ugali & sukuma', 250, 1),
    item(id('f1', 603), id('c1', 11), 'Ugali & beef', 400, 2), item(id('f1', 604), id('c1', 4), 'Ugali voucher', 50, 0)];
  const { provider, calls } = setup({ merchants: [...merchants, ...extra], items: [...items, ...menu] });
  const result = await provider.getSuggestions('ugli');
  assert.deepEqual(result.merchants.map((entry) => entry.name), ['Mama Ugali Grill', 'Ugali Corner']);
  assert.equal(result.merchants[1]?.context, 'Café · Kilimani');
  // Two items per store at most; the banking store is not shown in Discovery, so its item is never suggested.
  assert.deepEqual(result.items.map((entry) => [entry.name, entry.merchantName, entry.price]), [['Ugali', 'Sokoni Grill House', 100], ['Ugali & beef', 'Sokoni Grill House', 400]]);
  assert.equal(reads(calls, 'catalogue_public')[0]!.url.searchParams.get('name'), 'ilike.*u*g*l*i*');
  assert.deepEqual(await provider.getSuggestions('u'), { merchants: [], items: [] });
});

test('an item read that finds nothing, or fails, leaves search exactly as it was', async () => {
  const quiet = setup();
  const before = await quiet.provider.getMerchants({ search: 'kahawa house' });
  assert.deepEqual(names(before), ['Kahawa House']);
  assert.equal(reads(quiet.calls, 'merchant_public')[0]!.url.searchParams.get('trading_name'), 'ilike.*kahawa house*');
  const failing = setup({ failView: 'catalogue_public' });
  // Item reads fail here too, so only the store page itself is checked: the name match still answers.
  await assert.rejects(failing.provider.getMerchants({ search: 'kahawa' }), kind('unavailable'));
  assert.equal(reads(failing.calls, 'merchant_public').length, 1, 'a failed item match does not stop the store read');
});

test('unsupported sorts, Open now and unknown selections fail with typed reasons before any request', async () => {
  const { provider, calls } = setup();
  await assert.rejects(provider.getMerchants({ openNow: true }), kind('unsupported'));
  await assert.rejects(provider.getMerchants({ sort: 'rating' }), kind('unsupported'));
  await assert.rejects(provider.getCollections('restaurants-food', { openNow: true }), kind('unsupported'));
  await assert.rejects(provider.getMerchants({ categoryId: 'retired-category' }), kind('invalid'));
  await assert.rejects(provider.getMerchants({ categoryId: 'restaurants-food', subcategoryId: 'travel-tours:safaris' }), kind('invalid'));
  await assert.rejects(provider.getMerchants({ categoryId: 'travel-tours', subcategoryId: 'travel-tours:safaris', optionId: 'unknown-option' }), kind('invalid'));
  await assert.rejects(provider.getMerchants({ search: 'x'.repeat(257) }), kind('invalid'));
  await assert.rejects(provider.getTourOfferings({ categoryId: 'experiences' }), kind('invalid'));
  assert.equal(calls.length, 0);
  assert.deepEqual(provider.capabilities, supabaseCapabilities);
});

test('a subcategory whose groups are all unmapped reports unmapped without a request', async () => {
  const sources = findSubcategory('travel-tours', 'travel-tours:safaris')!.sourceIds;
  assert.ok(sources.length > 1, 'Safaris draws on several demo groups');
  const unmapped = mapRows.map((row) => sources.includes(row.demoSubcategoryId) ? { ...row, discovery: null, status: 'unmapped' as const } : row);
  const { provider, calls } = setup({}, { map: { subcategories: unmapped } });
  const result = await provider.getMerchants({ categoryId: 'travel-tours', subcategoryId: 'travel-tours:safaris' });
  assert.deepEqual({ merchants: result.merchants, mapping: result.mapping, total: result.total }, { merchants: [], mapping: 'unmapped', total: 0 });
  assert.equal(calls.length, 0);
});

test('lists keep 30 items per merchant and storefronts 200; a cut-short reply is completed one merchant at a time', async () => {
  const { provider } = setup();
  const list = await provider.getMerchants({ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' });
  assert.deepEqual(list.merchants.map((row) => row.items.length), [1, 1, 30, 1]);
  const detail = await provider.getMerchant(id('c1', 1));
  assert.equal(detail.items.length, 35);
  assert.deepEqual(detail.items.slice(0, 3).map((row) => row.name), ['Espresso', 'Flat white', 'Jua item 3']);
  // A server that caps replies at 5 rows: Kahawa (first by UUID) is complete; Jua, Amani and Hodari are re-read alone.
  const capped = setup({ maxRows: 5 });
  const page = await capped.provider.getMerchants({ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' });
  assert.deepEqual(page.merchants.map((row) => [row.name, row.items.length]), [['Amani Café', 1], ['Hodari 50%_Off Café', 1], ['Jua Café', 5], ['Kahawa House', 1]]);
  const singles = reads(capped.calls, 'catalogue_public').slice(1).map((call) => call.url.searchParams.get('merchant_id')).sort();
  assert.deepEqual(singles, [`eq.${id('c1', 1)}`, `eq.${id('c1', 10)}`, `eq.${id('c1', 2)}`].sort());
});

test('storefronts open by UUID or by demo code; anything else is missing without a request', async () => {
  const { provider, calls } = setup();
  const jua = plain(await provider.getMerchant(id('c1', 1).toUpperCase()));
  const { items: juaItems, ...juaFacts } = jua;
  assert.deepEqual(juaFacts, {
    id: id('c1', 1), name: 'Jua Café', categoryId: 'restaurants-food', subcategoryId: 'restaurants-food_café', category: 'Restaurants And Food', subcategory: 'Café',
    isFeatured: false, latitude: -1.2921, longitude: 36.7856, area: 'Kilimani', address: 'Kilimani, Nairobi', heroImage: 'https://images.example/hero.jpg' });
  assert.deepEqual(juaItems.slice(0, 2), [
    { id: id('f1', 1), merchantId: id('c1', 1), merchantName: 'Jua Café', name: 'Espresso', description: 'Double shot', price: 450, currency: 'KES', image: 'https://images.example/espresso.jpg' },
    { id: id('f1', 2), merchantId: id('c1', 1), merchantName: 'Jua Café', name: 'Flat white' },
  ]);
  assert.equal((await provider.getMerchant('M0001')).id, id('c1', 1));
  // A merchant outside the reviewed map still opens by link, without invented Discovery labels.
  const bank = plain(await provider.getMerchant(id('c1', 4)));
  assert.deepEqual([bank.categoryId, bank.subcategoryId, bank.category, bank.subcategory], ['financial-services', 'financial-services_banking', undefined, undefined]);
  await assert.rejects(provider.getMerchant('M0999'), kind('missing'));
  const before = calls.length;
  for (const bad of ['', '../merchant_public', 'I00001', 'c1000000-0000-4000-8000-00000000000x']) await assert.rejects(provider.getMerchant(bad), kind('missing'));
  assert.equal(calls.length, before);
  assert.equal(reads(calls, 'merchant_public').find((call) => call.url.searchParams.get('id'))!.url.searchParams.get('id'), `eq.${id('c1', 1)}`);
});

test("storefronts carry the merchant's own sections only when it has two or more; a catch-all section is left to the keyword rules", async () => {
  const { provider, calls } = setup();
  const mara = await provider.getMerchant(id('c1', 3));
  assert.deepEqual(mara.items.map((entry) => [entry.name, entry.section]), [['Amboseli in two days', 'Safaris'], ['Mara day trip', 'Day trips'], ['Nairobi National Park', undefined]]);
  assert.ok(mara.items.every((entry) => entry.orders === undefined && entry.isNew === undefined), 'no invented order history or newness');
  const sectionReads = reads(calls, 'catalogue_section');
  assert.equal(sectionReads.length, 1);
  assert.equal(sectionReads[0]!.url.searchParams.get('id'), `in.(${id('f2', 3)},${id('f2', 30)})`);
  const jua = await provider.getMerchant(id('c1', 1));
  assert.ok(jua.items.every((entry) => entry.section === undefined));
  assert.equal(reads(calls, 'catalogue_section').length, 1, 'one catch-all section needs no read');
  const list = await provider.getMerchants({ categoryId: 'travel-tours' });
  assert.deepEqual(list.merchants[0]!.items.map((entry) => [entry.name, entry.section]), [['Mara day trip', undefined], ['Amboseli in two days', undefined], ['Nairobi National Park', undefined]], 'lists keep catalogue order');
  const failing = setup({ failView: 'catalogue_section' });
  assert.deepEqual((await failing.provider.getMerchant(id('c1', 3))).items.map((entry) => entry.section), [undefined, undefined, undefined], 'a failed section read still opens the storefront');
});

test('recommended puts featured merchants first, and a merchant that closed early today is closed', async () => {
  const changed = merchants.map((row) => row.trading_name === 'Mara Safaris' ? { ...row, featured: true }
    : row.trading_name === 'Amani Café' ? { ...row, closed_early_at: '2026-11-09T06:30:00Z' }
    : row.trading_name === 'Jua Café' ? { ...row, opens_today: '08:00:00', closes_today: '17:00:00', closed_early_at: '2026-11-08T15:00:00Z' } : row);
  const { provider } = setup({ merchants: changed });
  const home = await provider.getMerchants({ limit: 3, sort: 'recommended' });
  assert.deepEqual(home.merchants.map((row) => [row.name, row.isFeatured]), [['Mara Safaris', true], ['Amani Café', false], ['Hodari 50%_Off Café', false]]);
  assert.equal(home.merchants[1]!.isOpen, false, 'closed early this morning (Nairobi), although its hours say open');
  assert.equal((await provider.getMerchant(id('c1', 1))).isOpen, true, "yesterday's early close no longer applies");
});

test('areas come from listed merchants with two-part Nairobi addresses, sorted, and two screens share one read', async () => {
  let now = clock;
  const { provider, calls } = setup({ maxRows: 4 }, { now: () => now });
  const [header, filter] = await Promise.all([provider.getAreas(), provider.getAreas()]);
  assert.deepEqual(header, ['Karen', 'Kilimani', "St. Austin's (Upper)", 'Westlands']);
  assert.deepEqual(filter, header);
  assert.notEqual(filter, header, 'each caller gets its own copy');
  // The server caps replies at 4 rows, so the count drives paging: 10 listed merchants (Street Kitchen too), 3 reads.
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.url.searchParams.get('offset')), ['0', '4', '8']);
  await provider.getAreas();
  assert.equal(calls.length, 3);
  now += 6 * 60_000;
  await provider.getAreas();
  assert.equal(calls.length, 6);
  const controller = new AbortController();
  now += 6 * 60_000;
  const aborted = provider.getAreas(controller.signal);
  controller.abort(new Error('screen closed'));
  await assert.rejects(aborted, /screen closed/);
  assert.deepEqual(await provider.getAreas(), header);
});

test('experience and tour offerings page over the complete scoped inventory, searching item and host names', async () => {
  const { provider, calls } = setup();
  const tours = await provider.getTourOfferings({ categoryId: 'travel-tours', limit: 2 });
  assert.deepEqual(tours.offerings.map((entry) => entry.item.name), ['Mara day trip', 'Amboseli in two days']);
  assert.deepEqual({ total: 'total' in tours ? tours.total : undefined, hasMore: 'hasMore' in tours ? tours.hasMore : undefined }, { total: 3, hasMore: true });
  const jazz = await provider.getExperienceOfferings({ search: 'JAZZ' });
  assert.deepEqual(jazz.offerings.map((entry) => [entry.merchant.name, entry.item.name]), [['Tamasha Concerts', 'Jazz night']]);
  const host = await provider.getExperienceOfferings({ search: 'picha' });
  assert.deepEqual(host.offerings.map((entry) => entry.item.name), ['Portrait session']);
  const events = await provider.getExperienceOfferings({ categoryId: 'experiences', subcategoryId: 'experiences:events' });
  assert.deepEqual(events.offerings.map((entry) => entry.item.name), ['Sauti Live', 'Jazz night']);
  assert.ok(reads(calls, 'merchant_public').every((call) => !call.url.searchParams.has('trading_name')), 'offering search is applied to items and hosts, not sent as a merchant search');
});

test('collections keep the platform rules (types with at least two merchants), then one last rail for everyone else', async () => {
  const { provider, calls } = setup();
  const food = await provider.getCollections('restaurants-food');
  assert.deepEqual(food.collections.map((collection) => [collection.title, collection.subcategoryId, collection.merchants.length]),
    [['Café', 'restaurants-food:caf', 4], ['More stores', undefined, 1]]);
  assert.equal(food.partial, false);
  // One read for the whole category and one for the shown stores' items, not two per subcategory.
  assert.deepEqual([reads(calls, 'merchant_public').length, reads(calls, 'catalogue_public').length], [1, 1]);
  assert.deepEqual(food.collections[0]!.merchants.map((merchant) => [merchant.name, merchant.items.length, merchant.subcategory]),
    [['Amani Café', 1, 'Café'], ['Hodari 50%_Off Café', 1, 'Café'], ['Jua Café', 12, 'Café'], ['Kahawa House', 1, 'Café']]);
  // Street Kitchen has no subcategory: no type rail holds it, so it is on the last rail, whose View all is the category.
  assert.deepEqual([food.collections[1]!.viewAllQuery, names(food.collections[1]!)], [{ categoryId: 'restaurants-food' }, ['Street Kitchen']]);
  const kilimani = await provider.getCollections('restaurants-food', { area: 'Kilimani' });
  assert.deepEqual(kilimani.collections.map((collection) => names(collection)), [['Jua Café', 'Kahawa House'], ['Street Kitchen']]);
  assert.deepEqual(kilimani.collections[1]!.viewAllQuery, { categoryId: 'restaurants-food', area: 'Kilimani' });
  // A type with one store gets no rail of its own; the store is still on the page, under "All trips".
  assert.deepEqual((await provider.getCollections('travel-tours')).collections.map((collection) => [collection.title, names(collection)]), [['All trips', ['Mara Safaris']]]);
  assert.deepEqual(await provider.getCollections('retired-category'), { collections: [], partial: false });
});

test('failures are typed: HTTP errors, malformed rows, an unreadable count, timeouts and aborts; an offset past the end is an empty page', async () => {
  const query = { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' };
  for (const status of [401, 404, 500, 503]) await assert.rejects(setup({ status }).provider.getMerchants(query), kind('unavailable'));
  await assert.rejects(setup({ merchants: [{ ...merchants[0], trading_name: '' }] }).provider.getMerchants(query), kind('unavailable'));
  await assert.rejects(setup({ merchants: [{ ...merchants[0], id: 'M0001' }] }).provider.getMerchants(query), kind('unavailable'));
  await assert.rejects(setup({ items: [{ ...items[0], price_kes: '450' }] }).provider.getMerchant(id('c1', 1)), kind('unavailable'));
  // A browser that cannot read Content-Range (a CORS gap) must not show wrong totals.
  await assert.rejects(setup({ exposeCount: false }).provider.getMerchants(query), kind('unavailable'));
  await assert.rejects(setup({ fail: async () => { throw new TypeError('Failed to fetch'); } }).provider.getMerchants(query), kind('unavailable'));
  await assert.rejects(setup({ fail: async () => new Response('<h1>gateway</h1>', { status: 200, headers: { 'Content-Range': '*/0' } }) }).provider.getMerchants(query), kind('unavailable'));
  const slow = new SupabaseDiscoveryProvider({ url: LOCAL, anonKey: KEY, timeoutMs: 20,
    fetch: (_href, init) => new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) });
  await assert.rejects(slow.getMerchants(query), kind('unavailable'));
  const controller = new AbortController();
  controller.abort(new Error('navigated away'));
  await assert.rejects(setup().provider.getMerchants(query, controller.signal), /navigated away/);
  const past = await setup().provider.getMerchants({ ...query, offset: 40 });
  assert.deepEqual({ merchants: past.merchants, total: past.total, hasMore: past.hasMore }, { merchants: [], total: 4, hasMore: false });
  // A reply shorter than the count allows means the server capped the page; paging on would skip merchants.
  await assert.rejects(setup({ maxRows: 1 }).provider.getMerchants({ ...query, limit: 2 }), kind('unavailable'));
});

test('demo photos are packed small, unpacked exactly, https only, and loaded only when a reply holds demo rows', async () => {
  const packed = JSON.parse(JSON.stringify(packDemoMedia(media)));
  assert.deepEqual(packed, { version: 1, urls: ['https://images.example/hero.jpg', 'https://images.example/mara.jpg', 'https://images.example/espresso.jpg'], hero: [-1, 0, -1, 1], logo: [-1, -1, -1, -1], item: [-1, 2] });
  const unpacked = unpackDemoMedia(packed);
  assert.deepEqual([...unpacked.merchants], [[id('c1', 1), { heroImage: 'https://images.example/hero.jpg' }], [id('c1', 3), { heroImage: 'https://images.example/mara.jpg' }]]);
  assert.deepEqual([...unpacked.items], [[id('f1', 1), 'https://images.example/espresso.jpg']]);
  for (const bad of [{ ...packed, version: 2 }, { ...packed, hero: [7] }, { ...packed, urls: ['http://images.example/x.jpg'] }, { ...packed, item: [0.5] }, null]) assert.throws(() => unpackDemoMedia(bad), /Invalid demo media/);
  let loads = 0;
  let fail = true;
  const { provider } = setup({}, { media: async () => { loads += 1; if (fail) throw new Error('chunk failed'); return media; } });
  assert.equal((await provider.getMerchant(REAL)).heroImage, undefined);
  assert.equal(loads, 0, 'real merchants never load the demo photos');
  assert.equal((await provider.getMerchant(id('c1', 3))).heroImage, undefined, 'a failed load shows placeholders');
  fail = false;
  assert.equal((await provider.getMerchant(id('c1', 3))).heroImage, 'https://images.example/mara.jpg');
  await provider.getMerchant(id('c1', 1));
  assert.equal(loads, 2, 'loaded once after the retry');
});

test('the factory selects the Supabase provider explicitly, and the lazy wrapper matches it without loading it', async () => {
  const engine = (): DiscoveryProvider => assert.fail('engine not selected');
  const injected = setup().provider;
  assert.equal(createDiscoveryProvider('supabase', { platform: platformMerchantProvider, engine, supabase: () => injected }), injected);
  assert.equal(createDiscoveryProvider(undefined, { platform: platformMerchantProvider, engine, supabase: () => injected }), platformMerchantProvider);
  assert.throws(() => createDiscoveryProvider('Supabase', { platform: platformMerchantProvider, engine }), /must be platform or engine or supabase/);
  const lazy = lazySupabaseProvider({});
  assert.equal(lazy.version, SUPABASE_PROVIDER_VERSION);
  assert.equal(injected.version, SUPABASE_PROVIDER_VERSION);
  assert.deepEqual(lazy.capabilities, injected.capabilities);
  // Missing settings fail each read as "unavailable", never the page.
  await assert.rejects(lazy.getAreas(), (error: unknown) => failureFrom(error).kind === 'unavailable' && !String(error).includes(KEY));
});
