import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { readServerConfig } from '../src/server/config.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import type { CatalogFetch } from '../src/adapters/platform/httpTransport.js';
import { parseSchema } from '../src/contracts/validate.js';
import type { Schemas } from '../src/contracts/index.js';
import { release, releaseWithUnmappedSubcategory } from './helpers.js';
import { controlFetch, jsonResponse, merchantRequest, sourceControl, sourceGroup } from './readControls.js';

async function setup(t: TestContext, fetcher?: CatalogFetch, limits: { maxActiveRequests?: number; readTimeoutMs?: number; release?: typeof release } = {}) {
  const provider = new PlatformDiscoveryProvider(fetcher ? { origin: 'http://catalog.test', fetcher } : {});
  const server = await buildReadOnlyServer({ config: readServerConfig({}), release, provider, ...limits });
  t.after(() => server.app.close()); return server;
}

test('configuration is loopback-only, explicit and rejects invalid ports and source origins', () => {
  assert.deepEqual(readServerConfig({}), { host: '127.0.0.1', port: 5190 });
  assert.deepEqual(readServerConfig({ DISCOVERY_ENGINE_PORT: '5191', DISCOVERY_SOURCE_API_ORIGIN: 'http://127.0.0.1:3001' }),
    { host: '127.0.0.1', port: 5191, sourceOrigin: 'http://127.0.0.1:3001' });
  for (const port of ['0', '65536', '-1', '5180x', '']) assert.throws(() => readServerConfig({ DISCOVERY_ENGINE_PORT: port }));
  assert.throws(() => readServerConfig({ DISCOVERY_SOURCE_API_ORIGIN: 'http://user:password@catalog.test' }));
});

test('offline service reports R0 and typed unavailability rather than empty successful results', async t => {
  const { app, stats } = await setup(t);
  const health = await app.inject('/api/discovery/health');
  assert.equal(health.statusCode, 200); assert.deepEqual(parseSchema('EngineHealth', health.json()), { contractVersion: '1', status: 'degraded', readiness: 'R0' });
  const capabilities = await app.inject(`/api/discovery/capabilities?releaseId=${release.releaseId}`);
  const caps = parseSchema('EngineCapabilities', capabilities.json()); assert.deepEqual(caps.resultModes, []); assert.deepEqual(caps.workflowKinds, []);
  const response = await app.inject({ method: 'POST', url: '/api/discovery/results', payload: merchantRequest() });
  assert.equal(response.statusCode, 503); assert.equal(parseSchema('EngineError', response.json()).code, 'CATALOG_UNAVAILABLE');
  assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(stats().active, 0);
});

test('capabilities require the exact release and only advertise implemented merchant context', async t => {
  let calls = 0; const { app } = await setup(t, controlFetch(() => { calls++; }));
  const missing = await app.inject('/api/discovery/capabilities'); assert.equal(missing.statusCode, 400);
  const stale = await app.inject('/api/discovery/capabilities?releaseId=stale'); assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'RELEASE_INCOMPATIBLE'); assert.equal(calls, 0);
  const response = await app.inject(`/api/discovery/capabilities?releaseId=${release.releaseId}`);
  const caps = parseSchema('EngineCapabilities', response.json()); assert.equal(caps.readiness, 'R1');
  assert.deepEqual(caps.resultModes, ['merchant']); assert.deepEqual(caps.filterKinds, ['catalog_area']);
  assert.deepEqual(caps.sorts, ['recommended']); assert.deepEqual(caps.workflowKinds, []);
  assert.equal(caps.policyCoverage.length, release.nodes.length);
  assert.ok(caps.policyCoverage.every(node => node.state === 'partial' || node.state === 'unmapped'));
  assert.equal(calls, 1);
});

test('results validate actual release selection and preserve bounded counts and source IDs', async t => {
  const urls: URL[] = []; const { app } = await setup(t, controlFetch(url => { urls.push(url); }));
  const request = merchantRequest(); request.filters = [{ kind: 'catalog_area', areaId: 'protocol-area' }];
  const response = await app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
  assert.equal(response.statusCode, 200);
  const page = parseSchema('EnginePage', response.json());
  assert.equal(page.refs[0]!.id, 'protocol-control'); assert.equal(page.requestId, request.requestId);
  assert.deepEqual(page.count, { kind: 'lower_bound', value: 1 }); assert.equal(page.status, 'underfilled');
  assert.equal(page.retrieval.scope, 'bounded_candidates'); assert.equal(page.retrieval.completion, 'window_exhausted');
  assert.equal(page.nextCursor, undefined); assert.deepEqual(page.presentations.offerings, []);
  assert.equal(page.versions.ranker, 'deterministic-recommendation/v1');
  assert.deepEqual(page.versions.sourceSnapshots![0]!.snapshot, { state: 'unknown', reason: 'not_exposed' });
  assert.equal(urls.length, 1); assert.equal(urls[0]!.searchParams.get('subcategory'), sourceGroup);
  assert.equal(urls[0]!.searchParams.get('area'), 'protocol-area');
  assert.equal(page.applied.constraints[0]!.state, 'supported');
});

test('category browsing unions approved child source mappings without legacy category expansion', async t => {
  const urls: URL[] = []; const { app } = await setup(t, controlFetch(url => { urls.push(url); }));
  const request = merchantRequest(); request.selection = { categoryId: 'beauty-wellness' };
  const response = await app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
  assert.equal(response.statusCode, 200); assert.equal(response.json().refs.length, 1);
  const expected = [...new Set(release.nodes.filter(node => node.kind === 'subcategory' && node.parentId === 'beauty-wellness')
    .flatMap(node => release.mappings.find(mapping => mapping.nodeId === node.id)!.sourceSubcategoryIds))];
  assert.deepEqual(urls.map(url => url.searchParams.get('subcategory')), expected);
  assert.ok(urls.every(url => !url.searchParams.has('category')));
});

test('every current category and subcategory resolves its own approved source groups', async t => {
  const urls: URL[] = []; const { app } = await setup(t, controlFetch(url => { urls.push(url); }));
  const nodes = release.nodes.filter(node => node.kind === 'category' || node.kind === 'subcategory');
  for (const node of nodes) {
    urls.length = 0; const request = merchantRequest();
    request.selection = node.kind === 'category' ? { categoryId: node.id } : { categoryId: node.parentId!, subcategoryId: node.id };
    const response = await app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
    assert.equal(response.statusCode, 200, node.id);
    const expected = node.kind === 'subcategory' ? release.mappings.find(mapping => mapping.nodeId === node.id)!.sourceSubcategoryIds
      : release.nodes.filter(child => child.kind === 'subcategory' && child.parentId === node.id)
        .flatMap(child => release.mappings.find(mapping => mapping.nodeId === child.id)!.sourceSubcategoryIds);
    assert.deepEqual(urls.map(url => url.searchParams.get('subcategory')), [...new Set(expected)], node.id);
    assert.ok(urls.length <= 16); parseSchema('EnginePage', response.json());
  }
  assert.equal(nodes.length, release.declaredCounts.categories + release.declaredCounts.subcategories);
});

test('unmapped nodes have explicit unknown counts and never trigger broad catalog fallbacks', async t => {
  // Every baseline subcategory is mapped since 8 Nov 2026, so this runs on an isolated copy with one unmapped.
  const variant = releaseWithUnmappedSubcategory();
  let calls = 0; const { app } = await setup(t, controlFetch(() => { calls++; }), { release: variant });
  const mapping = variant.mappings.find(mapping => mapping.status === 'unmapped' && variant.nodes.find(node => node.id === mapping.nodeId)?.kind === 'subcategory')!;
  const node = variant.nodes.find(node => node.id === mapping.nodeId)!;
  const request = merchantRequest(); request.discoveryReleaseId = variant.releaseId; request.selection = { categoryId: node.parentId!, subcategoryId: node.id };
  const response = await app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
  assert.equal(response.statusCode, 200); const page = parseSchema('EnginePage', response.json());
  assert.equal(page.status, 'unmapped'); assert.deepEqual(page.count, { kind: 'unknown' }); assert.deepEqual(page.refs, []); assert.equal(calls, 0);
});

test('unsupported query, modes, operational filters, sorts and paging fail before source reads', async t => {
  let calls = 0; const { app } = await setup(t, controlFetch(() => { calls++; }));
  const changes: [Partial<Schemas['EngineRequest']>, number, string][] = [
    [{ query: 'available tonight' }, 422, 'CLARIFICATION_REQUIRED'], [{ mode: 'offering' }, 422, 'UNSUPPORTED_CAPABILITY'],
    [{ sort: 'rating' }, 422, 'UNSUPPORTED_CAPABILITY'], [{ filters: [{ kind: 'merchant_open', value: true }] }, 422, 'UNSUPPORTED_CAPABILITY'],
    [{ filters: [{ kind: 'catalog_area', areaId: 'all' }] }, 422, 'UNSUPPORTED_CAPABILITY'],
    [{ filters: [{ kind: 'catalog_area', areaId: 'one' }, { kind: 'catalog_area', areaId: 'two' }] }, 422, 'CONSTRAINT_CONFLICT'],
    [{ offset: 1 }, 409, 'CURSOR_RESTART_REQUIRED'], [{ cursor: 'old-window' }, 409, 'CURSOR_RESTART_REQUIRED'],
    [{ contextToken: 'unverified' }, 422, 'UNSUPPORTED_CAPABILITY'], [{ sourceScope: { merchantId: 'control' } }, 422, 'UNSUPPORTED_CAPABILITY'],
    [{ discoveryReleaseId: 'old-release' }, 409, 'RELEASE_INCOMPATIBLE'],
    [{ selection: { categoryId: 'unknown-category' } }, 400, 'INVALID_REQUEST'],
  ];
  for (const [change, status, code] of changes) {
    const response = await app.inject({ method: 'POST', url: '/api/discovery/results', payload: { ...merchantRequest(), ...change } });
    assert.equal(response.statusCode, status, JSON.stringify(change)); assert.equal(parseSchema('EngineError', response.json()).code, code);
  }
  assert.equal(calls, 0);
});

test('areas and merchant detail are schema-validated public reads; write routes stay unavailable', async t => {
  const { app } = await setup(t, controlFetch());
  const areas = await app.inject('/api/discovery/areas'); assert.deepEqual(parseSchema('Areas', areas.json()), { areas: ['protocol-area'] });
  const detail = await app.inject('/api/discovery/merchants/original%20id');
  assert.equal(detail.statusCode, 200); assert.equal(parseSchema('PublicMerchant', detail.json()).ref.id, 'original id');
  const disabled = await app.inject({ method: 'POST', url: '/api/discovery/events', payload: { contractVersion: '1', events: [{ eventId: 'no-token', type: 'detail_opened', ref: { kind: 'merchant', ownerId: 'platform-catalog', id: 'original id', merchantId: 'original id' }, exposureToken: 'unissued', occurredAt: new Date().toISOString() }] } });
  assert.equal(disabled.statusCode, 422); assert.equal(disabled.json().code, 'UNSUPPORTED_CAPABILITY');
  for (const path of ['/api/discovery/tasks', '/api/discovery/bookings', '/internal/owner-outcomes', '/api/discovery/operator']) {
    const response = await app.inject({ method: 'POST', url: path, payload: {} });
    assert.equal(response.statusCode, 404); assert.equal(parseSchema('EngineError', response.json()).code, 'NOT_FOUND');
  }
});

test('malformed and oversized requests use the existing safe error contract', async t => {
  const { app, stats } = await setup(t, controlFetch());
  for (const [payload, contentType, status] of [['{', 'application/json', 400], ['{}', 'text/plain', 400],
    ['{"__proto__":{"secret":true}}', 'application/json', 400], ['x'.repeat(65537), 'application/json', 422]] as const) {
    const response = await app.inject({ method: 'POST', url: '/api/discovery/results', headers: { 'content-type': contentType }, payload });
    assert.equal(response.statusCode, status); parseSchema('EngineError', response.json());
    assert.equal(response.body.includes('secret'), false); assert.equal(response.body.includes('SyntaxError'), false);
  }
  for (const path of ['/api/discovery/health?extra=x', '/api/discovery/capabilities?releaseId=a&releaseId=b']) {
    const response = await app.inject(path); assert.equal(response.statusCode, 400); parseSchema('EngineError', response.json());
  }
  assert.equal(stats().active, 0);
});

test('overload has bounded recovery and releases request resources after success', async t => {
  let markStarted!: () => void; const started = new Promise<void>(resolve => { markStarted = resolve; });
  let releaseSource!: () => void; const gate = new Promise<void>(resolve => { releaseSource = resolve; });
  const { app, stats } = await setup(t, async () => { markStarted(); await gate; return jsonResponse({ merchants: [sourceControl()], total: 1 }); }, { maxActiveRequests: 1 });
  const first = app.inject({ method: 'POST', url: '/api/discovery/results', payload: merchantRequest() });
  const firstResponse = Promise.resolve(first); await started;
  const overloaded = await app.inject('/api/discovery/health');
  assert.equal(overloaded.statusCode, 429); assert.equal(overloaded.headers['retry-after'], '1');
  assert.equal(parseSchema('EngineError', overloaded.json()).code, 'RATE_LIMITED');
  releaseSource(); assert.equal((await firstResponse).statusCode, 200);
  assert.deepEqual(stats(), { active: 0, completed: 1, overloads: 1 });
});

test('real local HTTP source and engine sockets preserve the provider boundary', async t => {
  const upstream: { method?: string; url?: string; hasCredentials: boolean }[] = [];
  const source = createServer((request, response) => {
    upstream.push({ ...(request.method ? { method: request.method } : {}), ...(request.url ? { url: request.url } : {}),
      hasCredentials: !!(request.headers.cookie || request.headers.authorization) });
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.url?.startsWith('/api/areas') ? { areas: ['protocol-area'] } : { merchants: [sourceControl()], total: 12345 }));
  });
  await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => source.close(error => error ? reject(error) : resolve())));
  const address = source.address(); assert.ok(address && typeof address === 'object');
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190, sourceOrigin: `http://127.0.0.1:${address.port}` }, release });
  t.after(() => server.app.close()); const origin = await server.app.listen({ port: 0, host: '127.0.0.1' });
  const response = await fetch(`${origin}/api/discovery/results`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'private=control', authorization: 'Bearer control' }, body: JSON.stringify(merchantRequest()) });
  assert.equal(response.status, 200); const page = parseSchema('EnginePage', await response.json());
  assert.equal(page.refs[0]!.ownerId, 'platform-catalog'); assert.equal(page.count.kind, 'lower_bound');
  assert.equal(upstream.length, 1); assert.equal(upstream[0]!.method, 'GET'); assert.equal(upstream[0]!.hasCredentials, false);
  assert.equal(new URL(upstream[0]!.url!, 'http://control.test').searchParams.get('subcategory'), sourceGroup);
  assert.equal(server.stats().active, 0);
});

test('real HTTP slow source is canceled at the shared deadline and returns typed unavailable', async t => {
  let markClosed!: () => void; const closed = new Promise<void>(resolve => { markClosed = resolve; });
  const source = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' }); response.write('{'); response.once('close', markClosed);
  });
  await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve));
  t.after(() => { source.closeAllConnections(); return new Promise<void>(resolve => source.close(() => resolve())); });
  const address = source.address(); assert.ok(address && typeof address === 'object');
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190, sourceOrigin: `http://127.0.0.1:${address.port}` }, release, readTimeoutMs: 100 });
  t.after(() => server.app.close()); const origin = await server.app.listen({ port: 0, host: '127.0.0.1' });
  const response = await fetch(`${origin}/api/discovery/areas`);
  assert.equal(response.status, 503); assert.equal(parseSchema('EngineError', await response.json()).code, 'CATALOG_UNAVAILABLE');
  await Promise.race([closed, delay(1000).then(() => { throw new Error('Source connection was not canceled'); })]);
  assert.equal(server.stats().active, 0);
});

test('client disconnect cancels the upstream read and frees the service request slot', async t => {
  let markStarted!: () => void; const started = new Promise<void>(resolve => { markStarted = resolve; });
  let markClosed!: () => void; const closed = new Promise<void>(resolve => { markClosed = resolve; });
  const source = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' }); response.write('{');
    response.once('close', markClosed); markStarted();
  });
  await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve));
  t.after(() => { source.closeAllConnections(); return new Promise<void>(resolve => source.close(() => resolve())); });
  const address = source.address(); assert.ok(address && typeof address === 'object');
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190, sourceOrigin: `http://127.0.0.1:${address.port}` }, release });
  t.after(() => server.app.close()); const origin = await server.app.listen({ port: 0, host: '127.0.0.1' });
  const controller = new AbortController();
  const pending = fetch(`${origin}/api/discovery/areas`, { signal: controller.signal });
  await started; controller.abort(); await assert.rejects(pending);
  await Promise.race([closed, delay(1000).then(() => { throw new Error('Disconnected request retained its source read'); })]);
  assert.equal(server.stats().active, 0);
});
