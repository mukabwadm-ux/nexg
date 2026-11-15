import assert from 'node:assert/strict';
import test from 'node:test';
import { portalMapRows, type MerchantRow } from '../src/adapters/supabase/catalogBridge.js';
import { SupabaseConnector } from '../src/adapters/supabase/connector.js';
import { ContractError, type EngineRequest } from '../src/contracts/index.js';
import { ReadServiceError } from '../src/contracts/readErrors.js';
import { parseEngineRequest } from '../src/contracts/validate.js';
import { DiscoveryReadService } from '../src/orchestrator/readService.js';
import { ResultSessions } from '../src/orchestrator/resultSessions.js';
import type { ServerDiscoveryProvider } from '../src/providers/DiscoveryProvider.js';
import { taxonomyPathIndex } from '../src/releases/taxonomyPaths.js';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { readServerConfig } from '../src/server/config.js';
import { canonicalJson, sha256 } from '../src/shared/immutable.js';
import { requestFingerprint } from '../src/shared/requestFingerprint.js';
import { release } from './helpers.js';
import { withBudget } from './readControls.js';

const viewport = { south: -1, west: 178, north: 1, east: -178 };
const category = { categoryId: 'restaurants-food' };
const subcategory = { ...category, subcategoryId: 'restaurants-food:caf' };
const defaultRequest: EngineRequest = {
  contractVersion: '1', discoveryReleaseId: release.releaseId, requestId: 'viewport-read',
  mode: 'merchant', selection: category, filters: [], sort: 'recommended', limit: 24,
};
const map = portalMapRows({ subcategories: [{
  demoSubcategoryId: 'restaurants-food_café', demoLabel: 'Café', demoCategoryId: 'restaurants-food',
  demoCategoryLabel: 'Restaurants & Food', supabase: { category: 'restaurants_food', subcategory: 'caf' },
  discovery: subcategory, status: 'mapped',
}] });
const merchantId = (number: number) => `cec00000-0000-4000-8000-${String(number).padStart(12, '0')}`;

// Injected catalogue observations only. These rows are never served as real merchant data.
function merchant(number: number, name: string, latitude: number | null, longitude: number | null): MerchantRow {
  return {
    id: merchantId(number), trading_name: name, category_key: 'restaurants_food', subcategory: 'caf',
    branch_address: null, branch_latitude: latitude, branch_longitude: longitude, accepting_orders: true,
    busy_mode_until: null, closed_today: null, opens_today: null, closes_today: null,
  };
}

async function providerFor(merchants: MerchantRow[]) {
  const provider = new SupabaseConnector({
    map, taxonomyPaths: taxonomyPathIndex(release), load: async () => ({ merchants, items: [] }),
  });
  await provider.refresh();
  return provider;
}

async function serviceFor(merchants: MerchantRow[], options?: ConstructorParameters<typeof DiscoveryReadService>[2]) {
  return new DiscoveryReadService(release, await providerFor(merchants), options);
}

const scopeError = (code: ContractError['code']) => (error: unknown) => error instanceof ContractError && error.code === code;
const unsupported = (path: string) => (error: unknown) => error instanceof ReadServiceError &&
  error.code === 'UNSUPPORTED_CAPABILITY' && error.fieldPaths.includes(path);

test('viewport validates independent visible bounds and requires a category without GPS', () => {
  const input = { ...defaultRequest, viewport };
  assert.deepEqual(parseEngineRequest(input, release), input);
  const world = { ...input, viewport: { south: -90, west: -180, north: 90, east: 180 } };
  assert.deepEqual(parseEngineRequest(world, release), world);
  for (const bounds of [
    { ...viewport, south: 91 },
    { ...viewport, west: Number.POSITIVE_INFINITY },
    { ...viewport, east: Number.NaN },
    { ...viewport, south: 1 },
    { ...viewport, south: 2 },
    { ...viewport, east: viewport.west },
    { ...viewport, west: 180, east: -180 },
    { ...viewport, ignored: 0 },
  ]) {
    assert.throws(() => parseEngineRequest({ ...input, viewport: bounds }, release), scopeError('INVALID_REQUEST'));
  }
  for (const change of [
    { selection: {} }, { mode: 'offering' }, { sort: 'nearest' },
    { near: { latitude: 0, longitude: 0 } },
    { zoneId: 'cec00000-0000-4000-8000-000000000001' },
  ]) {
    assert.throws(() => parseEngineRequest({ ...input, ...change }, release), scopeError('INVALID_REQUEST'));
  }
  assert.throws(() => parseEngineRequest({
    ...input, filters: [{ kind: 'catalog_area', areaId: 'Westlands' }],
  }, release), scopeError('CONSTRAINT_CONFLICT'));
});

test('filters both source browse paths before the 200-row window and bypasses the unscoped index', async () => {
  const service = await serviceFor([
    ...Array.from({ length: 210 }, (_, i) => merchant(i, `Control outside ${i}`, 0, 36)),
    merchant(211, 'Other missing', null, null),
    merchant(212, 'Zeta control east', 0, 179),
    merchant(213, 'Zeta control west', -1, -178),
    merchant(214, 'Zeta control beyond north', 2, 179),
  ], { retrieval: { search: async () => { assert.fail('The unscoped index must not truncate viewport results'); } } });

  for (const selection of [category, subcategory]) {
    const page = await withBudget(budget => service.results({ ...defaultRequest, selection, viewport, query: 'Zeta' }, budget));
    assert.deepEqual(page.applied.viewport, viewport);
    assert.equal(page.retrieval.candidateCount, 2);
    assert.deepEqual(new Set(page.refs.map(ref => ref.id)), new Set([merchantId(212), merchantId(213)]));
    assert.equal(page.presentations.merchants.every(row => 'location' in row && !('distanceMeters' in row)), true);
  }
});

test('keeps zero latitude, excludes the absent-source sentinel and binds cursors to bounds', async () => {
  const bounds = { south: -1, west: -1, north: 1, east: 1 };
  const service = await serviceFor([
    merchant(1, 'Control zero latitude', 0, 0.5), merchant(2, 'Control edge', 1, 1),
    merchant(3, 'Control outside', 1.01, 1), merchant(4, 'Control unknown', null, null),
    merchant(5, 'Control unmapped point', 0, 0),
  ]);
  const scoped = { ...defaultRequest, viewport: bounds, limit: 1 };
  const first = await withBudget(budget => service.results(scoped, budget));
  assert.ok(first.nextCursor);
  const second = await withBudget(budget => service.results({ ...scoped, cursor: first.nextCursor }, budget));
  const locations = [...first.presentations.merchants, ...second.presentations.merchants].map(row => row.location);
  assert.deepEqual(new Set(locations), new Set([{ latitude: 0, longitude: 0.5 }, { latitude: 1, longitude: 1 }]));
  const changed = { ...scoped, viewport: { ...bounds, east: 0.5 } };
  await assert.rejects(withBudget(budget => service.results({ ...changed, cursor: first.nextCursor }, budget)),
    (error: unknown) => error instanceof ReadServiceError && error.code === 'CURSOR_RESTART_REQUIRED');
  assert.notEqual(requestFingerprint(scoped), requestFingerprint(changed));
  assert.equal(requestFingerprint(defaultRequest), sha256(canonicalJson(defaultRequest.filters)));
});

test('accepts a cursor past the first hundred eligible merchants in a viewport', async () => {
  const service = await serviceFor([]);
  const sessions = new ResultSessions();
  const scoped = { ...defaultRequest, viewport, limit: 48 };
  const refs = Array.from({ length: 150 }, (_, index) => merchantId(index));
  const binding = sessions.binding(scoped);
  const session = sessions.create('caller', binding, refs, service.versions(), refs.length, false);
  const result = sessions.resolve({ ...scoped, cursor: sessions.cursor(session, 144) }, 'caller', binding);
  assert.equal(result?.offset, 144);
  assert.deepEqual(result?.session.refs.slice(result.offset), refs.slice(144));
});

test('advertises viewport capability only with the Maps v1 feature header', async t => {
  const built = await buildReadOnlyServer({ config: readServerConfig({}), release, provider: await providerFor([]) });
  t.after(() => built.app.close());
  const url = `/api/discovery/capabilities?releaseId=${release.releaseId}`;
  const defaultResponse = await built.app.inject(url);
  const optedIn = await built.app.inject({ url, headers: { 'x-nexg-features': 'maps-v1' } });
  const unsupported = await built.app.inject({ url, headers: { 'x-nexg-features': 'maps-v2' } });
  assert.equal(defaultResponse.statusCode, 200);
  assert.equal(optedIn.statusCode, 200);
  assert.deepEqual(unsupported.json(), defaultResponse.json());
  const { viewportSearch, source, ...existing } = optedIn.json();
  assert.equal(viewportSearch, true);
  assert.equal(source, 'nexg');
  assert.deepEqual(existing, defaultResponse.json());
});

test('rejects viewport collections and providers without a scope filter', async () => {
  const provider: ServerDiscoveryProvider = {
    ownerId: 'unbounded-control', configured: true, async probe() { return true; },
    async getMerchants() { assert.fail('The unsupported scope must fail before a source read'); },
    async getMerchant() { assert.fail('Unexpected detail read'); },
    async getAreas() { assert.fail('Viewport search does not use named areas'); },
  };
  const service = new DiscoveryReadService(release, provider);
  const capability = await withBudget(budget => service.capabilities(release.releaseId, budget, true));
  assert.notEqual(capability.viewportSearch, true);
  assert.equal(capability.source, undefined);
  await assert.rejects(withBudget(budget => service.results({ ...defaultRequest, viewport }, budget)), unsupported('/viewport'));
  await assert.rejects(withBudget(budget => service.collections({
    request: { ...defaultRequest, viewport }, definitionIds: [release.collections[0]!.id],
  }, budget)), unsupported('/request/viewport'));
});
