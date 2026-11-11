import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { DiscoveryReadService } from '../src/orchestrator/readService.js';
import { CollectionCompositionService } from '../src/orchestrator/collectionService.js';
import { ReadBudget } from '../src/orchestrator/readBudget.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { ReadServiceError } from '../src/contracts/readErrors.js';
import { parseSchema } from '../src/contracts/validate.js';
import type { ReleaseArtifact } from '../src/releases/artifact.js';
import { release } from './helpers.js';
import { sourceControl, jsonResponse, merchantRequest } from './readControls.js';
import { definition, collectionRelease, collectionRequest } from './collectionControls.js';

async function setup(t: TestContext, artifact: Readonly<ReleaseArtifact>, options: { failed?: boolean; stalled?: boolean; readTimeoutMs?: number; rows?: number } = {}) {
  const reads: URL[] = [];
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async url => {
    reads.push(url);
    if (options.failed) throw new Error('private source failure');
    if (options.stalled) return new Promise<Response>(() => {});
    return jsonResponse({ merchants: Array.from({ length: options.rows ?? 4 }, (_, index) => ({ ...sourceControl(`protocol-${index}`), name: 'Protocol merchant',
      nairobiArea: url.searchParams.get('area') ?? 'east' })), total: 999 });
  } });
  const server = await buildReadOnlyServer({ release: artifact, provider, config: { host: '127.0.0.1', port: 5190 },
    ...(options.readTimeoutMs ? { readTimeoutMs: options.readTimeoutMs } : {}) });
  t.after(() => server.app.close());
  return { ...server, provider, reads, send: (request: unknown) => server.app.inject({ method: 'POST', url: '/api/discovery/collections',
    headers: { 'content-type': 'application/json' }, payload: JSON.stringify(request) }) };
}

test('approved baseline flags stay disabled: mounted collection route returns honest partial with no source call', async t => {
  const server = await setup(t, release); const request = merchantRequest();
  const id = release.collections.find(value => value.categoryId === request.selection.categoryId)!.id;
  const response = await server.send({ request, definitionIds: [id] });
  assert.equal(response.statusCode, 200); assert.deepEqual(parseSchema('CollectionPage', response.json()), { sections: [], partial: true, reasonCodes: ['COLLECTION_DISABLED'] });
  assert.equal(server.reads.length, 0); assert.equal(response.headers['cache-control'], 'no-store');
});

test('executable source-backed sections replay identical query/area predicate through View all and retain source identities', async t => {
  const artifact = collectionRelease([definition('query', { predicate: { kind: 'query-matches' }, maxItems: 2 })]); const server = await setup(t, artifact);
  const request = collectionRequest(artifact, { query: '"Protocol merchant"', filters: [{ kind: 'catalog_area', areaId: 'east' }] });
  const response = await server.send({ request, definitionIds: ['query'] }); assert.equal(response.statusCode, 200, response.body);
  const composed = parseSchema('CollectionPage', response.json()); assert.equal(composed.partial, false); const section = composed.sections[0]!;
  assert.deepEqual(section.page.refs.map(ref => ref.id), ['protocol-0', 'protocol-1']); assert.deepEqual(section.viewAllRequest, request);
  const destination = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: section.viewAllRequest }); assert.equal(destination.statusCode, 200);
  const page = parseSchema('EnginePage', destination.json()); assert.deepEqual(page.refs.slice(0, 2), section.page.refs);
  assert.equal(page.applied.filterHash, section.page.applied.filterHash); assert.equal(page.versions.discoveryRelease, artifact.releaseId);
  assert.ok(server.reads.every(url => url.searchParams.get('area') === 'east' && url.searchParams.get('limit') === '48'));
});

test('same exact reads share work; release order and overlap suppress redundant sections without quotas', async t => {
  const artifact = collectionRelease([definition('first', { maxItems: 2 }), definition('second', { maxItems: 2 })]); const server = await setup(t, artifact);
  const result = parseSchema('CollectionPage', (await server.send({ request: collectionRequest(artifact), definitionIds: ['second', 'first'] })).json());
  assert.deepEqual(result.sections.map(section => section.definitionId), ['first']);
  assert.deepEqual(result.reasonCodes, ['COLLECTION_OVERLAP_SUPPRESSED']); assert.equal(result.partial, true);
  assert.equal(server.reads.length, 1);
});

test('unsupported definition facts are hidden while explicit unsupported guest filters still fail', async t => {
  const artifact = collectionRelease([definition('explore'), definition('task', { predicate: { kind: 'requested-task-fit' }, filters: [{ kind: 'merchant_open', value: true }] })]); const server = await setup(t, artifact);
  const result = parseSchema('CollectionPage', (await server.send({ request: collectionRequest(artifact), definitionIds: ['explore', 'task'] })).json());
  assert.deepEqual(result.sections.map(section => section.definitionId), ['explore']); assert.deepEqual(result.reasonCodes, ['COLLECTION_SOURCE_CAPABILITY_UNSUPPORTED']);
  const explicit = await server.send({ request: collectionRequest(artifact, { filters: [{ kind: 'merchant_open', value: true }] }), definitionIds: ['explore'] });
  assert.equal(explicit.statusCode, 422); assert.equal(parseSchema('EngineError', explicit.json()).code, 'UNSUPPORTED_CAPABILITY');
});

test('source outage and shared deadline stay typed failures rather than successful empty collections', async t => {
  const artifact = collectionRelease([definition()]); const request = { request: collectionRequest(artifact), definitionIds: ['protocol-explore'] };
  const dead = await setup(t, artifact, { failed: true }); const unavailable = await dead.send(request);
  assert.equal(unavailable.statusCode, 503); assert.equal(parseSchema('EngineError', unavailable.json()).code, 'CATALOG_UNAVAILABLE');
  const slow = await setup(t, artifact, { stalled: true, readTimeoutMs: 80 }); const timeout = await slow.send(request);
  assert.equal(timeout.statusCode, 503); assert.equal(parseSchema('EngineError', timeout.json()).code, 'CATALOG_UNAVAILABLE'); assert.equal(slow.stats().active, 0);
});

test('one global source budget covers every section and cannot be multiplied to fill rails', async t => {
  const artifact = collectionRelease([definition('east', { filters: [{ kind: 'catalog_area', areaId: 'east' }] }), definition('west', { filters: [{ kind: 'catalog_area', areaId: 'west' }] })]);
  const server = await setup(t, artifact); const reader = new DiscoveryReadService(artifact, server.provider);
  const composer = new CollectionCompositionService(artifact, reader); const budget = new ReadBudget({ maxCalls: 1 });
  try {
    await assert.rejects(composer.compose({ request: collectionRequest(artifact), definitionIds: ['east', 'west'] }, budget), error => error instanceof ReadServiceError && error.code === 'LIMIT_EXCEEDED');
    assert.equal(budget.snapshot.calls, 1); assert.equal(server.reads[0]!.searchParams.get('area'), 'east');
  } finally { budget.dispose(); }
});

test('application port waits use the same deadline without spending a source-call slot', async () => {
  const artifact = collectionRelease([definition()]); const budget = new ReadBudget({ timeoutMs: 40 });
  const composer = new CollectionCompositionService(artifact, { results: async () => new Promise(() => {}) });
  try {
    await assert.rejects(composer.compose({ request: collectionRequest(artifact), definitionIds: ['protocol-explore'] }, budget), error => error instanceof ReadServiceError && error.code === 'CATALOG_UNAVAILABLE');
    assert.equal(budget.snapshot.calls, 0); assert.equal(budget.signal.aborted, true);
  } finally { budget.dispose(); }
  const expired = new ReadBudget(); expired.dispose();
  await assert.rejects(expired.waitFor(Promise.reject(new Error('isolated late rejection'))), error => error instanceof ReadServiceError && error.code === 'CATALOG_UNAVAILABLE');
});

test('empty/underfilled is distinct from disabled, malformed and unknown definitions', async t => {
  const artifact = collectionRelease([definition()]); const server = await setup(t, artifact, { rows: 1 });
  const request = collectionRequest(artifact); const sparse = parseSchema('CollectionPage', (await server.send({ request, definitionIds: ['protocol-explore'] })).json());
  assert.deepEqual(sparse.reasonCodes, ['COLLECTION_INSUFFICIENT_SUPPLY']); assert.deepEqual(sparse.sections, []);
  for (const body of [{ request, definitionIds: ['unknown'] }, { request, definitionIds: ['protocol-explore', 'protocol-explore'] }, { request, definitionIds: ['protocol-explore'], predicate: {} }, {}]) {
    const response = await server.send(body); assert.equal(response.statusCode, 400); assert.equal(parseSchema('EngineError', response.json()).code, 'INVALID_REQUEST');
  }
});

test('collection requests retain mapped/unmapped outcomes for every released category/subcategory/context option', async t => {
  const definitions = release.nodes.filter(node => node.kind === 'category').map(node => definition(`protocol-${node.id}`, { categoryId: node.id, maxItems: 2 }));
  const artifact = collectionRelease(definitions); const server = await setup(t, artifact);
  for (const node of artifact.nodes) {
    const sub = node.kind === 'option' ? artifact.nodes.find(parent => parent.id === node.parentId)! : node;
    const categoryId = node.kind === 'category' ? node.id : sub.parentId!;
    const selection = { categoryId, ...(node.kind !== 'category' ? { subcategoryId: sub.id } : {}), ...(node.kind === 'option' ? { optionId: node.id } : {}) };
    const response = await server.send({ request: collectionRequest(artifact, { selection }), definitionIds: [`protocol-${categoryId}`] });
    assert.equal(response.statusCode, 200, node.id); const page = parseSchema('CollectionPage', response.json());
    const mapped = node.kind === 'category' ? artifact.nodes.some(child => child.parentId === node.id && artifact.mappings.find(mapping => mapping.nodeId === child.id)!.sourceSubcategoryIds.length)
      : artifact.mappings.find(mapping => mapping.nodeId === node.id)!.sourceSubcategoryIds.length > 0;
    if (mapped) assert.deepEqual(page.sections[0]!.page.refs.map(ref => ref.id), ['protocol-0', 'protocol-1'], node.id);
    else assert.deepEqual(page.reasonCodes, ['COLLECTION_UNMAPPED'], node.id);
  }
});
