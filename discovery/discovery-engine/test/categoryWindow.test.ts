import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { portalMapRows, type CatalogRows, type MerchantRow } from '../src/adapters/supabase/catalogBridge.js';
import { SupabaseConnector } from '../src/adapters/supabase/connector.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { ReadServiceError } from '../src/contracts/readErrors.js';
import { parseSchema } from '../src/contracts/validate.js';
import type { ObservedMerchant } from '../src/providers/DiscoveryProvider.js';
import { interleaveBySubcategory } from '../src/orchestrator/merchantRanking.js';
import { MAX_WINDOW_REFS, ResultSessions } from '../src/orchestrator/resultSessions.js';
import { taxonomyPathIndex } from '../src/releases/taxonomyPaths.js';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { readServerConfig } from '../src/server/config.js';
import { release } from './helpers.js';
import { jsonResponse, sourceControl, withBudget } from './readControls.js';

// Isolated window controls (9 Nov 2026). Stand-in Supabase rows only; never served as catalog data.
const category = 'restaurants-food';
const chosen = release.nodes.filter(node => node.kind === 'subcategory' && node.parentId === category).sort((a, b) => a.order - b.order).slice(0, 3);
const groupOf = (subcategoryId: string) => release.mappings.find(mapping => mapping.nodeId === subcategoryId)!.sourceSubcategoryIds[0]!;
const map = portalMapRows({ subcategories: chosen.map((node, index) => ({ demoSubcategoryId: groupOf(node.id), demoLabel: node.label, demoCategoryId: category,
  demoCategoryLabel: 'Restaurants', supabase: { category: 'restaurants_food', subcategory: `control_${index}` }, discovery: { categoryId: category, subcategoryId: node.id }, status: 'mapped' })) });
const uuid = (n: number) => `c1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const merchant = (n: number, index: number): MerchantRow => ({ id: uuid(n), trading_name: `Control ${String(n).padStart(3, '0')}`, category_key: 'restaurants_food',
  subcategory: `control_${index}`, branch_address: 'Kilimani, Nairobi', branch_latitude: -1.29, branch_longitude: 36.78, accepting_orders: true,
  busy_mode_until: null, closed_today: null, opens_today: null, closes_today: null });
// 40, 30 and 20 stores in the category's first three subcategories: 90 in all, beyond the old 48-store window.
const sizes = [40, 30, 20];
const starts = sizes.map((_, index) => 1 + sizes.slice(0, index).reduce((total, size) => total + size, 0));
const rows: CatalogRows = { merchants: sizes.flatMap((size, index) => Array.from({ length: size }, (_, offset) => merchant(starts[index]! + offset, index))), items: [] };
const request = (selection: object, limit = 24, extra: object = {}) =>
  ({ contractVersion: '1', requestId: 'window-control', discoveryReleaseId: release.releaseId, mode: 'merchant', selection, filters: [], sort: 'recommended', limit, ...extra });

async function setup(t: TestContext) {
  const connector = new SupabaseConnector({ load: async () => rows, map, taxonomyPaths: taxonomyPathIndex(release) });
  await connector.start();
  const server = await buildReadOnlyServer({ config: readServerConfig({}), release, provider: connector });
  t.after(async () => { await server.app.close(); await connector.close(); });
  let cookie = '';
  const send = async (payload: object) => {
    const response = await server.app.inject({ method: 'POST', url: '/api/discovery/results', headers: { cookie }, payload });
    const set = response.headers['set-cookie']; if (set) cookie = String(set).split(';')[0]!;
    assert.equal(response.statusCode, 200, response.body);
    return parseSchema('EnginePage', response.json());
  };
  return { connector, send };
}

test('a category window holds every store beyond the old 48 and pages through each one exactly once', async t => {
  const { send } = await setup(t);
  let page = await send(request({ categoryId: category }));
  assert.deepEqual(page.count, { kind: 'lower_bound', value: 90 });
  assert.equal(page.retrieval.candidateCount, 90);
  const seen = page.refs.map(ref => ref.id);
  while (page.nextCursor) { page = await send(request({ categoryId: category }, 24, { cursor: page.nextCursor })); seen.push(...page.refs.map(ref => ref.id)); }
  assert.equal(seen.length, 90); assert.equal(new Set(seen).size, 90);
  assert.equal(page.retrieval.completion, 'window_exhausted'); assert.equal(page.status, 'underfilled');
});

test('category browsing takes turns across subcategories in taxonomy order and keeps ID order within each', async t => {
  const { send } = await setup(t);
  const first = await send(request({ categoryId: category }, 6));
  assert.deepEqual(first.presentations.merchants.map(row => row.taxonomyPaths![0]!.subcategoryId), [...chosen, ...chosen].map(node => node.id));
  assert.deepEqual(first.refs.map(ref => ref.id), [uuid(starts[0]!), uuid(starts[1]!), uuid(starts[2]!), uuid(starts[0]! + 1), uuid(starts[1]! + 1), uuid(starts[2]! + 1)]);
  // A single subcategory keeps the neutral original-ID order.
  const subcategory = await send(request({ categoryId: category, subcategoryId: chosen[1]!.id }, 3));
  assert.deepEqual(subcategory.refs.map(ref => ref.id), [uuid(starts[1]!), uuid(starts[1]! + 1), uuid(starts[1]! + 2)]);
});

test('turn-taking follows release order, keeps each subcategory\'s order and puts unplaced stores last', () => {
  const row = (id: string, subcategoryId?: string): ObservedMerchant => ({ presentation: { ref: { kind: 'merchant', ownerId: 'owner-control', id, merchantId: id }, name: id,
    ...(subcategoryId ? { taxonomyPaths: [{ categoryId: category, subcategoryId }] } : {}), items: [], itemsCount: { kind: 'lower_bound', value: 0 }, itemsCompletion: 'bounded_window' },
    evidence: { source: { ownerId: 'owner-control', id }, observedAt: '2026-11-09T10:00:00Z' } });
  const [a, b, c] = chosen.map(node => node.id);
  const ordered = interleaveBySubcategory([row('c1', c), row('x'), row('a1', a), row('a2', a), row('b1', b), row('c2', c)], release, category);
  assert.deepEqual(ordered.map(item => item.presentation.ref.id), ['a1', 'b1', 'c1', 'a2', 'c2', 'x']);
  assert.deepEqual(interleaveBySubcategory([], release, category), []);
});

test('windows stop at 200 stores, and the HTTP source still reads at most 48 stores per group', async () => {
  assert.equal(MAX_WINDOW_REFS, 200);
  const sessions = new ResultSessions();
  const versions = { discoveryRelease: release.releaseId, taxonomy: 't', layout: 'l', mapping: 'm', policy: 'p', ranker: 'r', sourceSnapshots: [] };
  const binding = sessions.binding(request({ categoryId: category }) as never);
  const refs = (count: number) => Array.from({ length: count }, (_, index) => `ref-${index}`);
  assert.equal(sessions.create('caller', binding, refs(200), versions, 200, false).refs.length, 200);
  assert.throws(() => sessions.create('caller', binding, refs(201), versions, 201, false), (error: unknown) => error instanceof ReadServiceError && error.code === 'CURSOR_RESTART_REQUIRED');
  const limits: string[] = [];
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async url => {
    limits.push(url.searchParams.get('limit')!);
    const group = url.searchParams.get('subcategory')!;
    return jsonResponse({ merchants: Array.from({ length: 48 }, (_, index) => sourceControl(`${group}-${index}`)), total: 9000 });
  } });
  const found = await withBudget(budget => provider.getMerchants({ sourceSubcategoryIds: ['group-a', 'group-b'], limit: 200 }, budget));
  assert.deepEqual(limits, ['48', '48']); assert.equal(found.length, 96);
  await assert.rejects(withBudget(budget => provider.getMerchants({ sourceSubcategoryIds: ['group-a'], limit: 201 }, budget)),
    (error: unknown) => error instanceof ReadServiceError && error.code === 'CATALOG_UNAVAILABLE');
});
