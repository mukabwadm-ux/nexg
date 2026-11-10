import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineDiscoveryProvider } from '../src/providers/engineProvider';
import { EngineTransport, type BrowserFetch } from '../src/providers/engineTransport';
import type { EngineSchemas } from '../src/providers/DiscoveryProvider';
import { findCategory } from '../src/data/taxonomy';

// Isolated protocol controls (9 Nov 2026): category rows in engine mode when the release publishes no collection.
const versions = { discoveryRelease: 'release-control', taxonomy: 't', layout: 'l', mapping: 'm', policy: 'p', ranker: 'rank-control', sourceSnapshots: [] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const store = (id: string): EngineSchemas['PublicMerchant'] =>
  ({ ref: { kind: 'merchant', ownerId: 'source-control', id, merchantId: id }, name: `Protocol ${id}`, items: [], itemsCount: { kind: 'unknown' }, itemsCompletion: 'unknown' });
const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
const subcategories = (categoryId: string) => findCategory(categoryId)!.subcategories.map(entry => entry.id);

function provider(stock: Record<string, string[]>, options: { definitions?: boolean; failing?: string[] } = {}) {
  const requested: { subcategoryId?: string; limit: number }[] = [];
  const context: EngineSchemas['ReleaseContext'] = { contractVersion: '1', discoveryReleaseId: 'release-control', versions,
    collections: options.definitions === false ? [] : [{ id: 'collection-control', categoryId: 'restaurants-food', title: 'Browse restaurants' },
      { id: 'collection-control-2', categoryId: 'beauty-wellness', title: 'Browse beauty' }] };
  const fetcher: BrowserFetch = async (input, init) => {
    const path = String(input);
    if (path.endsWith('/release')) return json(context);
    if (path.endsWith('/collections')) return json({ sections: [], partial: true, reasonCodes: ['COLLECTION_DISABLED'] });
    const request = JSON.parse(String(init?.body)) as EngineSchemas['EngineRequest'];
    const subcategoryId = request.selection.subcategoryId;
    requested.push({ ...(subcategoryId ? { subcategoryId } : {}), limit: request.limit });
    if (subcategoryId && options.failing?.includes(subcategoryId)) return json({ contractVersion: '1', requestId: request.requestId, code: 'CATALOG_UNAVAILABLE', retryable: true, recovery: 'retry_read', fieldPaths: [] }, 503);
    const merchants = (stock[subcategoryId ?? ''] ?? []).slice(0, request.limit).map(store);
    return json({ contractVersion: '1', requestId: request.requestId, refs: merchants.map(row => row.ref), presentations: { merchants, offerings: [] },
      count: { kind: 'lower_bound', value: merchants.length },
      retrieval: { scope: 'bounded_candidates', windowId: 'window-control', candidateCount: merchants.length, completion: 'window_exhausted' },
      versions, applied: { selection: request.selection, filterHash: 'hash-control', sort: request.sort, constraints: [] }, status: 'underfilled' });
  };
  let id = 0;
  return { engine: new EngineDiscoveryProvider(new EngineTransport(fetcher), () => 0, () => `request-${++id}`), requested };
}

test('engine category pages show one row per subcategory when the release publishes no collection', async () => {
  const [restaurant, fastFood, cafe, bakery] = subcategories('restaurants-food');
  const { engine, requested } = provider({ [restaurant!]: ids('restaurant', 12), [fastFood!]: ids('fast-food', 1), [cafe!]: ids('cafe', 5), [bakery!]: ids('cafe', 5) });
  const result = await engine.getCollections('restaurants-food');
  assert.deepEqual(result.collections.map(row => [row.subcategoryId, row.title, row.merchants.length]), [
    [restaurant, findCategory('restaurants-food')!.subcategories[0]!.label, 10],
    [cafe, findCategory('restaurants-food')!.subcategories[2]!.label, 5],
  ]);
  // One store is too few for a row, and a row repeating another row's stores is dropped.
  assert.equal(result.partial, false); assert.deepEqual(result.reasonCodes, []);
  // "View all" opens the subcategory itself.
  assert.ok(result.collections.every(row => row.viewAllQuery === undefined));
  assert.deepEqual(requested.map(read => read.subcategoryId), subcategories('restaurants-food'));
  assert.equal(requested[0]!.limit, 10); assert.ok(requested.slice(1).every(read => read.limit === 6));
});

test('other categories keep to four rows, and a release with no definitions still gets rows', async () => {
  const stock = Object.fromEntries(subcategories('beauty-wellness').map((id, index) => [id, ids(`beauty-${index}`, 3)]));
  const result = await provider(stock).engine.getCollections('beauty-wellness');
  assert.deepEqual(result.collections.map(row => row.subcategoryId), subcategories('beauty-wellness').slice(0, 4));
  const bare = await provider(stock, { definitions: false }).engine.getCollections('beauty-wellness');
  assert.equal(bare.collections.length, 4);
});

test('a row that cannot load is left out and marked partial; when every row fails the page shows the error', async () => {
  const all = subcategories('beauty-wellness');
  const stock = Object.fromEntries(all.map((id, index) => [id, ids(`beauty-${index}`, 3)]));
  const partial = await provider(stock, { failing: [all[0]!] }).engine.getCollections('beauty-wellness');
  assert.deepEqual(partial.collections.map(row => row.subcategoryId), all.slice(1, 5));
  assert.equal(partial.partial, true); assert.deepEqual(partial.reasonCodes, ['SUBCATEGORY_ROW_UNAVAILABLE']);
  await assert.rejects(provider(stock, { failing: all }).engine.getCollections('beauty-wellness'));
});
