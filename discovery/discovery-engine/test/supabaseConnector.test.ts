import test from 'node:test';
import assert from 'node:assert/strict';
import { BridgeError, portalMapRows, type CatalogRows, type MerchantRow } from '../src/adapters/supabase/catalogBridge.js';
import { SupabaseConnector, supabaseConnectorSettings, supabaseKeyRole } from '../src/adapters/supabase/connector.js';
import { ReadServiceError } from '../src/contracts/readErrors.js';
import { parseSchema } from '../src/contracts/validate.js';
import { taxonomyPathIndex, taxonomyPathsFor } from '../src/releases/taxonomyPaths.js';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { readServerConfig } from '../src/server/config.js';
import { release, releaseWithUnmappedSubcategory, workspace } from './helpers.js';
import { withBudget } from './readControls.js';

// Isolated connector controls (plan steps E3–E4). These rows stand in for Supabase replies and are never served as catalog data.
const id = (prefix: string, value: number) => `${prefix}000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const owner = 'nexg-supabase-catalog';
const map = portalMapRows({ subcategories: [
  { demoSubcategoryId: 'restaurants-food_café', demoLabel: 'Café', demoCategoryId: 'restaurants-food', demoCategoryLabel: 'Restaurants & Food',
    supabase: { category: 'restaurants_food', subcategory: 'caf' }, discovery: { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' }, status: 'mapped' },
  { demoSubcategoryId: 'beauty_makeup', demoLabel: 'Makeup', demoCategoryId: 'beauty', demoCategoryLabel: 'Beauty',
    supabase: { category: 'beauty', subcategory: 'makeup' }, discovery: { categoryId: 'beauty-wellness', subcategoryId: 'beauty-wellness:beauty-products' }, status: 'mapped' },
  { demoSubcategoryId: 'financial-services_banking', demoLabel: 'Banking', demoCategoryId: 'financial-services', demoCategoryLabel: 'Financial Services',
    supabase: { category: 'financial_services', subcategory: 'banking' }, discovery: null, status: 'unmapped' },
] });
const merchant = (number: number, name: string, category: string, subcategory: string, address: string, extra: Partial<MerchantRow> = {}): MerchantRow => ({
  id: id('c1', number), trading_name: name, category_key: category, subcategory, branch_address: address, branch_latitude: -1.2921, branch_longitude: 36.7856,
  accepting_orders: true, busy_mode_until: null, closed_today: null, opens_today: null, closes_today: null, ...extra });
const rows: CatalogRows = {
  merchants: [
    merchant(1, 'Jua Café', 'restaurants_food', 'caf', 'Kilimani, Nairobi'),
    merchant(2, 'Amani Café', 'restaurants_food', 'caf', 'Westlands, Nairobi', { branch_latitude: null, branch_longitude: null }),
    // Onboarded through the merchant portal, which spells the key the way category_config does.
    merchant(3, 'Portal Café', 'restaurants_food', 'cafe', 'Kilimani, Nairobi'),
    merchant(4, 'Rangi Makeup', 'beauty', 'makeup', 'Karen, Nairobi'),
    merchant(5, 'Benki Banking', 'financial_services', 'banking', 'CBD, Nairobi'),
  ],
  items: [
    { id: id('f1', 1), merchant_id: id('c1', 1), name: 'Espresso', description: 'Double shot', price_kes: 450, sort: 0 },
    { id: id('f1', 2), merchant_id: id('c1', 1), name: 'Flat white', description: null, price_kes: null, sort: 1 },
    { id: id('f1', 3), merchant_id: id('c1', 1), name: 'Tap water', description: null, price_kes: 0, sort: 2 },
    { id: id('f1', 4), merchant_id: id('c1', 4), name: 'Lipstick', description: null, price_kes: 1200, sort: 0 },
  ],
};
const loadedAt = '2026-11-09T07:00:00.000Z';
const paths = taxonomyPathIndex(release);
const unavailable = (retryable: boolean) => (error: unknown) => error instanceof ReadServiceError && error.code === 'CATALOG_UNAVAILABLE' && error.status === 503 && error.retryable === retryable;
const jwt = (role: string) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ iss: 'control', role })).toString('base64url'), 'control-signature'].join('.');
const cafes = ['restaurants-food_café'];

function connector(options: { load?: () => Promise<CatalogRows>; now?: () => number; refreshMs?: number; staleAfterMs?: number } = {}) {
  return new SupabaseConnector({ load: options.load ?? (async () => rows), map, taxonomyPaths: paths, now: options.now ?? (() => Date.parse(loadedAt)),
    refreshMs: options.refreshMs ?? 3_600_000, staleAfterMs: options.staleAfterMs ?? 3_600_000 });
}

test('taxonomy paths come only from the release mappings, with the option when exactly one maps the group', () => {
  assert.deepEqual(taxonomyPathsFor(paths, 'restaurants-food_café'), [{ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' }]);
  assert.deepEqual(taxonomyPathsFor(paths, 'beauty_makeup'),
    [{ categoryId: 'beauty-wellness', subcategoryId: 'beauty-wellness:beauty-products', optionId: 'beauty-wellness:beauty-products:makeup' }]);
  assert.equal(taxonomyPathsFor(paths, 'not-a-source-group'), undefined);
  assert.equal(taxonomyPathsFor(paths, undefined), undefined);
  assert.equal(taxonomyPathsFor(undefined, 'beauty_makeup'), undefined);
  const nodes = new Map(release.nodes.map(node => [node.id, node]));
  for (const mapping of release.mappings.filter(entry => nodes.get(entry.nodeId)?.kind === 'subcategory')) {
    for (const source of mapping.sourceSubcategoryIds) {
      const found = taxonomyPathsFor(paths, source)!;
      assert.ok(found.some(path => path.subcategoryId === mapping.nodeId && path.categoryId === nodes.get(mapping.nodeId)!.parentId), source);
      for (const path of found) if (path.optionId) assert.equal(nodes.get(path.optionId)!.parentId, path.subcategoryId, source);
    }
  }
  // An unmapped subcategory gives its old source group no path.
  assert.equal(taxonomyPathsFor(taxonomyPathIndex(releaseWithUnmappedSubcategory('beauty-wellness:salon-barber')), 'beauty_salon-barber'), undefined);
  // Responses get copies; the index never changes.
  const copy = taxonomyPathsFor(paths, 'beauty_makeup')!; copy[0]!.subcategoryId = 'changed';
  assert.equal(taxonomyPathsFor(paths, 'beauty_makeup')![0]!.subcategoryId, 'beauty-wellness:beauty-products');
});

test('settings accept only a plain project URL and a public key, and errors never repeat the key', () => {
  assert.equal(supabaseKeyRole(jwt('anon')), 'anon');
  assert.equal(supabaseKeyRole(jwt('service_role')), 'service_role');
  assert.equal(supabaseKeyRole('sb_publishable_control'), 'publishable');
  assert.equal(supabaseKeyRole('sb_secret_control'), 'secret');
  assert.equal(supabaseKeyRole('not.a-json.key'), undefined);
  assert.deepEqual(supabaseConnectorSettings('http://127.0.0.1:54321', jwt('anon')), { origin: 'http://127.0.0.1:54321', key: jwt('anon') });
  assert.deepEqual(supabaseConnectorSettings('https://project.supabase.co/', 'sb_publishable_control'), { origin: 'https://project.supabase.co', key: 'sb_publishable_control' });
  for (const url of ['http://project.supabase.co', 'https://user:pass@project.supabase.co', 'https://project.supabase.co/rest/v1', 'https://project.supabase.co/?a=1', 'not a url', undefined]) {
    assert.throws(() => supabaseConnectorSettings(url, jwt('anon')), /SUPABASE_URL/);
  }
  for (const key of [undefined, '', 'has space', jwt('service_role'), 'sb_secret_control', 'unrecognised-key']) {
    assert.throws(() => supabaseConnectorSettings('http://127.0.0.1:54321', key), (error: unknown) => error instanceof Error && /SUPABASE_ANON_KEY/.test(error.message) && !(key && error.message.includes(key)));
  }
  assert.deepEqual(readServerConfig({ DISCOVERY_SOURCE: 'supabase', SUPABASE_ANON_KEY: jwt('anon') }),
    { host: '127.0.0.1', port: 5190, supabase: { origin: 'http://127.0.0.1:54321', key: jwt('anon') } });
  assert.deepEqual(readServerConfig({ DISCOVERY_SOURCE: 'platform', DISCOVERY_SOURCE_API_ORIGIN: 'http://127.0.0.1:3002' }), { host: '127.0.0.1', port: 5190, sourceOrigin: 'http://127.0.0.1:3002' });
  assert.throws(() => readServerConfig({ DISCOVERY_SOURCE: 'supabase', SUPABASE_ANON_KEY: jwt('anon'), DISCOVERY_SOURCE_API_ORIGIN: 'http://127.0.0.1:3002' }), /platform/);
  assert.throws(() => readServerConfig({ DISCOVERY_SOURCE: 'typesense' }), /DISCOVERY_SOURCE/);
  assert.throws(() => readServerConfig({ DISCOVERY_SOURCE: 'supabase' }), /SUPABASE_ANON_KEY/);
  assert.throws(() => readServerConfig({ DISCOVERY_SOURCE: 'supabase', SUPABASE_ANON_KEY: jwt('service_role') }), /SUPABASE_ANON_KEY/);
});

test('stores keep Supabase IDs and gain taxonomy paths, listed KES prices, coordinates and the portal spellings', async t => {
  const source = connector(); await source.start(); t.after(() => source.close());
  const found = await withBudget(budget => source.getMerchants({ sourceSubcategoryIds: cafes, limit: 24 }, budget));
  assert.deepEqual(found.map(row => row.presentation.name), ['Amani Café', 'Jua Café', 'Portal Café']);
  const jua = found.find(row => row.presentation.ref.id === id('c1', 1))!;
  const offering = (number: number, name: string, listedPrice: unknown, extra: object = {}) =>
    ({ ref: { kind: 'offering', ownerId: owner, id: id('f1', number), merchantId: id('c1', 1) }, name, ...extra, listedPrice });
  assert.deepEqual(jua.presentation, {
    ref: { kind: 'merchant', ownerId: owner, id: id('c1', 1), merchantId: id('c1', 1) }, name: 'Jua Café', area: 'Kilimani',
    taxonomyPaths: [{ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' }], location: { latitude: -1.2921, longitude: 36.7856 },
    items: [
      offering(1, 'Espresso', { state: 'known', value: { minor: 45_000, currency: 'KES' }, evidence: { source: { ownerId: owner, id: id('f1', 1) }, observedAt: loadedAt } },
        { description: 'Double shot' }),
      // No price, and a zero price, are never shown as free.
      offering(2, 'Flat white', { state: 'unknown', reason: 'not_exposed' }),
      offering(3, 'Tap water', { state: 'unknown', reason: 'not_exposed' }),
    ],
    itemsCount: { kind: 'lower_bound', value: 3 }, itemsCompletion: 'bounded_window' });
  assert.deepEqual(jua.evidence, { source: { ownerId: owner, id: id('c1', 1) }, observedAt: loadedAt });
  for (const row of found) parseSchema('PublicMerchant', row.presentation);
  // Missing coordinates stay missing, never a default point.
  assert.equal('location' in found.find(row => row.presentation.name === 'Amani Café')!.presentation, false);
  assert.deepEqual((await withBudget(budget => source.getMerchants({ sourceSubcategoryIds: cafes, area: 'Westlands', limit: 24 }, budget))).map(row => row.presentation.name), ['Amani Café']);
  const makeup = await withBudget(budget => source.getMerchants({ sourceSubcategoryIds: ['beauty_makeup', 'beauty_makeup'], limit: 24 }, budget));
  assert.deepEqual(makeup.map(row => row.presentation.taxonomyPaths),
    [[{ categoryId: 'beauty-wellness', subcategoryId: 'beauty-wellness:beauty-products', optionId: 'beauty-wellness:beauty-products:makeup' }]]);
  // Unmapped groups never browse, and the limit holds across groups.
  assert.deepEqual(await withBudget(budget => source.getMerchants({ sourceSubcategoryIds: ['financial-services_banking'], limit: 24 }, budget)), []);
  assert.equal((await withBudget(budget => source.getMerchants({ sourceSubcategoryIds: [...cafes, 'beauty_makeup'], limit: 2 }, budget))).length, 2);
  assert.deepEqual(await withBudget(budget => source.getMerchants({ sourceSubcategoryIds: [], limit: 24 }, budget)), []);
  // A window holds up to 200 stores (9 Nov 2026); more is refused.
  assert.equal((await withBudget(budget => source.getMerchants({ sourceSubcategoryIds: [...cafes, 'beauty_makeup'], limit: 200 }, budget))).length, 4);
  await assert.rejects(withBudget(budget => source.getMerchants({ sourceSubcategoryIds: cafes, limit: 201 }, budget)), unavailable(false));
  await assert.rejects(withBudget(budget => source.getMerchants({ sourceSubcategoryIds: cafes, area: 'all', limit: 24 }, budget)), unavailable(false));
});

test('detail opens any public store by Supabase ID; unknown IDs are not found and malformed IDs are refused', async t => {
  const source = connector(); await source.start(); t.after(() => source.close());
  const detail = await withBudget(budget => source.getMerchant(id('c1', 4), budget));
  assert.deepEqual(detail.items.map(item => item.listedPrice), [{ state: 'known', value: { minor: 120_000, currency: 'KES' }, evidence: { source: { ownerId: owner, id: id('f1', 4) }, observedAt: loadedAt } }]);
  assert.deepEqual(detail.location, { latitude: -1.2921, longitude: 36.7856 });
  // A store outside the reviewed map opens by direct link, without invented categories.
  const banking = await withBudget(budget => source.getMerchant(id('c1', 5), budget));
  assert.equal(banking.name, 'Benki Banking'); assert.equal('taxonomyPaths' in banking, false);
  await assert.rejects(withBudget(budget => source.getMerchant(id('c1', 99), budget)), (error: unknown) => error instanceof ReadServiceError && error.code === 'NOT_FOUND' && error.status === 404);
  await assert.rejects(withBudget(budget => source.getMerchant('../escape', budget)), (error: unknown) => error instanceof ReadServiceError && error.code === 'INVALID_REQUEST');
  assert.deepEqual(await withBudget(budget => source.getAreas(budget)), { areas: ['Karen', 'Kilimani', 'Westlands'] });
});

test('the connector refuses reads until its first good load, keeps the last good snapshot, and refuses stale data', async () => {
  let clock = Date.parse(loadedAt); let fail = true; let reads = 0;
  const source = connector({ now: () => clock, refreshMs: 60_000, staleAfterMs: 120_000,
    load: async () => { reads++; if (fail) throw new BridgeError(503, 'Supabase is unreachable (merchant_public)'); return rows; } });
  try {
    await source.start();
    assert.equal(await withBudget(budget => source.probe(budget)), false);
    assert.deepEqual(source.status, { merchants: 0, items: 0, lastError: 'Supabase is unreachable (merchant_public)' });
    await assert.rejects(withBudget(budget => source.getMerchants({ sourceSubcategoryIds: cafes, limit: 24 }, budget)), unavailable(true));
    await assert.rejects(withBudget(budget => source.getMerchant(id('c1', 1), budget)), unavailable(true));
    fail = false;
    const before = reads; await Promise.all([source.refresh(), source.refresh()]);
    assert.equal(reads, before + 1, 'overlapping refreshes share one read');
    assert.equal(await withBudget(budget => source.probe(budget)), true);
    assert.deepEqual(source.status, { loadedAt, merchants: 5, items: 4 });
    fail = true; clock += 90_000; await source.refresh();
    assert.equal((await withBudget(budget => source.getMerchants({ sourceSubcategoryIds: cafes, limit: 24 }, budget))).length, 3);
    assert.equal(source.status.lastError, 'Supabase is unreachable (merchant_public)');
    clock += 60_000;
    await assert.rejects(withBudget(budget => source.getAreas(budget)), unavailable(true));
    assert.equal(await withBudget(budget => source.probe(budget)), false);
    fail = false; await source.refresh();
    assert.equal(await withBudget(budget => source.probe(budget)), true);
  } finally { await source.close(); }
  assert.throws(() => connector({ refreshMs: 60_000, staleAfterMs: 30_000 }), /refresh settings/);
});

test('the engine serves connector stores through its public routes with prices, coordinates and taxonomy paths', async t => {
  const source = connector({ now: Date.now }); await source.start();
  const server = await buildReadOnlyServer({ config: readServerConfig({}), release, provider: source });
  t.after(async () => { await server.app.close(); await source.close(); });
  assert.deepEqual((await server.app.inject('/api/discovery/health')).json(), { contractVersion: '1', status: 'ok', readiness: 'R1' });
  const request = { contractVersion: '1', requestId: 'connector-control', discoveryReleaseId: release.releaseId, mode: 'merchant',
    selection: { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' }, filters: [], sort: 'recommended', limit: 24 };
  const response = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
  assert.equal(response.statusCode, 200);
  const page = parseSchema('EnginePage', response.json());
  assert.deepEqual(page.presentations.merchants.map(row => row.name).sort(), ['Amani Café', 'Jua Café', 'Portal Café']);
  assert.ok(page.presentations.merchants.every(row => row.ref.ownerId === owner && row.taxonomyPaths?.[0]?.subcategoryId === 'restaurants-food:caf'));
  const espresso = page.presentations.merchants.flatMap(row => row.items).find(item => item.name === 'Espresso')!;
  assert.deepEqual(espresso.listedPrice.state === 'known' ? espresso.listedPrice.value : undefined, { minor: 45_000, currency: 'KES' });
  const detail = await server.app.inject(`/api/discovery/merchants/${id('c1', 4)}`);
  assert.equal(detail.statusCode, 200);
  assert.deepEqual(parseSchema('PublicMerchant', detail.json()).taxonomyPaths?.[0]?.optionId, 'beauty-wellness:beauty-products:makeup');
  assert.equal((await server.app.inject(`/api/discovery/merchants/${id('c1', 99)}`)).statusCode, 404);
  assert.deepEqual((await server.app.inject('/api/discovery/areas')).json(), { areas: ['Karen', 'Kilimani', 'Westlands'] });
});

test('the workspace connector reads the reviewed map and demo photos without touching Supabase until started', async () => {
  const source = await SupabaseConnector.fromWorkspace(workspace, supabaseConnectorSettings('http://127.0.0.1:54321', jwt('anon')), paths);
  assert.deepEqual(source.status, { merchants: 0, items: 0 });
  assert.equal(await withBudget(budget => source.probe(budget)), false);
  await source.close();
});
