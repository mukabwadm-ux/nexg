import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { ReadServiceError } from '../src/contracts/readErrors.js';
import { parseSchema } from '../src/contracts/validate.js';
import { readServerConfig } from '../src/server/config.js';
import type { RetrievalCandidatePort } from '../engines/search-retrieval/src/ports.js';
import { release } from './helpers.js';
import { merchantRequest, sourceControl, jsonResponse } from './readControls.js';

async function setup(t: TestContext, options: { retrieval?: RetrievalCandidatePort; failed?: boolean } = {}) {
  const urls: URL[] = [];
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async url => {
    urls.push(url); if (options.failed) throw new Error('private source message');
    const rows = [['z', 'Orchid annex'], ['b', 'Orchid'], ['a', 'Orchid']].map(([id, name]) => ({ ...sourceControl(id!), name }));
    return jsonResponse({ merchants: rows, total: 999 });
  } });
  const server = await buildReadOnlyServer({ config: readServerConfig({}), release, provider,
    ...(options.retrieval ? { retrieval: options.retrieval } : {}) });
  t.after(() => server.app.close());
  return { ...server, urls, run: (changes: Record<string, unknown> = {}) => server.app.inject({ method: 'POST', url: '/api/discovery/results',
    payload: { ...merchantRequest(), query: 'orchid', ...changes } }) };
}

test('DE-AC-004 public R1 merchant search prioritizes exact names and stable IDs; area/source scope stay exact', async t => {
  const server = await setup(t);
  const response = await server.run({ filters: [{ kind: 'catalog_area', areaId: 'protocol-area' }] });
  assert.equal(response.statusCode, 200); const page = parseSchema('EnginePage', response.json());
  assert.deepEqual(page.refs.map(ref => ref.id), ['a', 'b', 'z']);
  assert.equal(page.versions.ranker, 'deterministic-recommendation/v1'); assert.deepEqual(page.count, { kind: 'lower_bound', value: 3 });
  assert.equal(page.retrieval.completion, 'window_exhausted'); assert.equal(page.applied.constraints[0]!.state, 'supported');
  assert.equal(server.urls[0]!.searchParams.get('area'), 'protocol-area'); assert.equal(server.urls[0]!.searchParams.get('limit'), '48');
  assert.equal(server.urls[0]!.searchParams.has('search'), false);
  const excluded = parseSchema('EnginePage', (await server.run({ query: 'orchid -annex' })).json());
  assert.deepEqual(excluded.refs.map(ref => ref.id), ['a', 'b']);
  const missed = parseSchema('EnginePage', (await server.run({ query: 'nonexistent control' })).json());
  assert.deepEqual(missed.count, { kind: 'lower_bound', value: 0 }); assert.equal(missed.status, 'underfilled');
});

test('bounded query paging promises only another pinned window page, never complete catalog counts', async t => {
  const server = await setup(t);
  const page = parseSchema('EnginePage', (await server.run({ limit: 1 })).json());
  assert.deepEqual(page.refs.map(ref => ref.id), ['a']); assert.deepEqual(page.count, { kind: 'lower_bound', value: 3 });
  assert.equal(page.retrieval.completion, 'more_in_window'); assert.equal(typeof page.nextCursor, 'string');
  const restart = await server.run({ cursor: 'old' }); assert.equal(restart.statusCode, 409);
  assert.equal(parseSchema('EngineError', restart.json()).recovery, 'restart_preserving_constraints');
});

test('query binding changes with meaning/filters but normalization preserves equivalent spelling', async t => {
  const server = await setup(t);
  const page = parseSchema('EnginePage', (await server.run()).json());
  const same = parseSchema('EnginePage', (await server.run({ query: '  ORCHID  ' })).json());
  const different = parseSchema('EnginePage', (await server.run({ query: 'orchid annex' })).json());
  assert.equal(page.applied.filterHash, same.applied.filterHash); assert.notEqual(page.applied.filterHash, different.applied.filterHash);
  assert.deepEqual(different.refs.map(ref => ref.id), ['z']);
});

test('DE-AC-001/002/003 public clarification is safe, typed and stops before reads', async t => {
  const server = await setup(t);
  for (const [query, key] of [['Airport pickup for 4 from JKIA tonight', 'party_configuration_required'],
    ['Nyama choma near kilimni', 'location_correction_required'], ['Couples massage tomorrow under KSh 7,000', 'party_configuration_required']]) {
    const response = await server.run({ query }); assert.equal(response.statusCode, 422);
    const error = parseSchema('EngineError', response.json());
    assert.equal(error.code, 'CLARIFICATION_REQUIRED'); assert.equal(error.clarification!.clarificationKey, key);
    assert.equal(error.recovery, 'clarify'); assert.equal(error.clarification!.options[0]!.optionId, 'refine_request');
    assert.equal(response.body.includes(query!), false);
  }
  assert.equal(server.urls.length, 0);
  const conflict = await server.run({ query: 'Couples massage', filters: [{ kind: 'party', adults: 1 }] });
  assert.equal(conflict.json().clarification.clarificationKey, 'party_conflict');
});

test('hard filters, entity mode and merchant scope never relax into merchant-name matches', async t => {
  const server = await setup(t);
  for (const changes of [{ mode: 'offering' }, { filters: [{ kind: 'merchant_open', value: true }] },
    { sourceScope: { merchantId: 'a' } }, { query: 'orchid near me' }]) {
    const response = await server.run(changes); assert.equal(response.statusCode, 422);
    assert.equal(parseSchema('EngineError', response.json()).code, 'UNSUPPORTED_CAPABILITY');
  }
  assert.equal(server.urls.length, 0);
  const success = parseSchema('EnginePage', (await server.run()).json()); assert.equal(success.refs[0]!.id, 'a');
});

test('indexed hints require same owner, current scoped membership and current lexical text', async t => {
  const retrieval: RetrievalCandidatePort = { search: async () => ({ refs: ['z', 'deleted-or-outside'].map(id => ({ kind: 'merchant', ownerId: 'platform-catalog', id, merchantId: id })),
    indexGeneration: 'protocol-serving-generation', sourceSnapshot: 'protocol-owner-snapshot', assertCurrent: async () => {} }) };
  const server = await setup(t, { retrieval });
  const page = parseSchema('EnginePage', (await server.run()).json());
  assert.deepEqual(page.refs.map(ref => ref.id), ['z']); assert.equal(page.versions.indexGeneration, 'protocol-serving-generation');
  assert.deepEqual(page.versions.sourceSnapshots![0]!.snapshot, { state: 'unknown', reason: 'not_exposed' });
  const changedName = parseSchema('EnginePage', (await server.run({ query: 'old label' })).json());
  assert.deepEqual(changedName.count, { kind: 'lower_bound', value: 0 });
  const invalid = await setup(t, { retrieval: { search: async () => ({ refs: [{ kind: 'merchant', ownerId: 'wrong-owner', id: 'a', merchantId: 'a' }],
    indexGeneration: 'protocol', sourceSnapshot: 'protocol', assertCurrent: async () => {} }) } });
  const response = await invalid.run(); assert.equal(response.statusCode, 503); assert.equal(response.json().code, 'CATALOG_UNAVAILABLE');
});

test('alias change after hydration requires restart; source/index failures never return fabricated empty success', async t => {
  const retrieval: RetrievalCandidatePort = { search: async () => ({ refs: [{ kind: 'merchant', ownerId: 'platform-catalog', id: 'a', merchantId: 'a' }],
    indexGeneration: 'protocol', sourceSnapshot: 'protocol', assertCurrent: async () => { throw new ReadServiceError('CURSOR_RESTART_REQUIRED', 409, false, 'restart_preserving_constraints'); } }) };
  const changed = await setup(t, { retrieval }); const restarted = await changed.run();
  assert.equal(restarted.statusCode, 409); assert.equal(parseSchema('EngineError', restarted.json()).recovery, 'restart_preserving_constraints');
  const dead = await setup(t, { failed: true }); const unavailable = await dead.run();
  assert.equal(unavailable.statusCode, 503); assert.equal(unavailable.json().code, 'CATALOG_UNAVAILABLE');
  const failedIndex = await setup(t, { retrieval: { search: async () => { throw new ReadServiceError('CATALOG_UNAVAILABLE', 503, true, 'retry_read'); } } });
  assert.equal((await failedIndex.run()).json().code, 'CATALOG_UNAVAILABLE'); assert.equal(failedIndex.urls.length, 0);
});

test('search configuration is server-only and explicitly enabled; no key is needed for default R1', () => {
  assert.deepEqual(readServerConfig({ DISCOVERY_SEARCH_API_KEY: 'ignored' }), { host: '127.0.0.1', port: 5190 });
  const config = readServerConfig({ DISCOVERY_SEARCH_ENABLED: '1', DISCOVERY_SEARCH_API_KEY: 'x'.repeat(32) });
  assert.equal(config.search!.origin, 'http://127.0.0.1:8108'); assert.equal(config.search!.namespace, 'nexg_discovery');
  for (const extra of [{ DISCOVERY_SEARCH_ENABLED: 'yes' }, { DISCOVERY_SEARCH_ENABLED: '1' },
    { DISCOVERY_SEARCH_ENABLED: '1', DISCOVERY_SEARCH_API_KEY: 'x'.repeat(32), DISCOVERY_SEARCH_NAMESPACE: 'bad/filter' }]) assert.throws(() => readServerConfig(extra));
});

test('every released category/subcategory/option keeps its mapping outcome when querying', async t => {
  const server = await setup(t);
  for (const node of release.nodes) {
    const subcategory = node.kind === 'option' ? release.nodes.find(parent => parent.id === node.parentId)! : node;
    const categoryId = node.kind === 'category' ? node.id : subcategory.parentId!;
    const selection = { categoryId, ...(node.kind !== 'category' ? { subcategoryId: subcategory.id } : {}), ...(node.kind === 'option' ? { optionId: node.id } : {}) };
    const page = parseSchema('EnginePage', (await server.run({ selection })).json());
    const mapped = node.kind === 'category' ? release.nodes.some(child => child.parentId === node.id
      && release.mappings.find(mapping => mapping.nodeId === child.id)!.sourceSubcategoryIds.length > 0)
      : release.mappings.find(mapping => mapping.nodeId === node.id)!.sourceSubcategoryIds.length > 0;
    assert.equal(page.status, mapped ? 'underfilled' : 'unmapped', node.id);
    if (mapped) assert.deepEqual(page.refs.map(ref => ref.id), ['a', 'b', 'z'], node.id);
    else assert.deepEqual(page.count, { kind: 'unknown' }, node.id);
  }
});

test('configured index HTTP body uses the same request deadline and cancels before any source hydration', async t => {
  let requests = 0;
  let closed!: () => void; const disconnected = new Promise<void>(resolve => { closed = resolve; });
  const index = createServer((_request, response) => {
    requests++;
    response.writeHead(200, { 'content-type': 'application/json' }); response.write('{'); response.once('close', closed);
  });
  await new Promise<void>(resolve => index.listen(0, '127.0.0.1', resolve));
  t.after(() => { index.closeAllConnections(); return new Promise<void>(resolve => index.close(() => resolve())); });
  const address = index.address(); assert.ok(address && typeof address === 'object');
  const server = await buildReadOnlyServer({ release, readTimeoutMs: 500, config: { host: '127.0.0.1', port: 5190,
    search: { origin: `http://127.0.0.1:${address.port}`, apiKey: 'c'.repeat(32), namespace: 'protocol_query' } } });
  t.after(() => server.app.close());
  const response = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: { ...merchantRequest(), query: 'control' } });
  assert.equal(response.statusCode, 503); assert.equal(parseSchema('EngineError', response.json()).code, 'CATALOG_UNAVAILABLE');
  assert.equal(requests, 1, 'The control must reach its stalled response body before the request deadline');
  await Promise.race([disconnected, delay(1000).then(() => { throw new Error('Index body did not close after cancellation'); })]);
  assert.equal(server.stats().active, 0);
});
