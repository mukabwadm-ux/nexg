import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { EngineDiscoveryProvider, collectionQuery } from '../src/providers/engineProvider';
import { EngineTransport, type BrowserFetch } from '../src/providers/engineTransport';
import { ProviderReadError, countLabel, failureFrom, windowMessage } from '../src/providers/readState';
import { startProviderRead, type ReadSnapshot } from '../src/providers/providerReadTask';
import { createDiscoveryProvider } from '../src/providers/providerFactory';
import type { DiscoveryQuery, EngineSchemas } from '../src/providers/DiscoveryProvider';
import { platformMerchantProvider } from '../src/providers/platformMerchantProvider';
import { applyQueryChange, parseRoute, routeUrl } from '../src/routing/discoveryRoute';
import { CatalogState } from '../src/components/CatalogState';
import { VisibilityQualifier } from '../src/observations/visibility';
import { observationFor, sendObservation } from '../src/observations/client';

// Isolated protocol controls only. No fixture is served as platform inventory.
const versions = { discoveryRelease: 'release-control', taxonomy: 't', layout: 'l', mapping: 'm', policy: 'p', ranker: 'rank-control', sourceSnapshots: [] };
const context: EngineSchemas['ReleaseContext'] = { contractVersion: '1', discoveryReleaseId: 'release-control', versions,
  collections: [{ id: 'collection-control', categoryId: 'category-control', title: 'Protocol collection' }] };
const query: DiscoveryQuery = { categoryId: 'category-control', subcategoryId: 'subcategory-control', search: 'Protocol', area: 'area-control', sort: 'recommended', limit: 2 };
function presentation(id: string): EngineSchemas['PublicMerchant'] {
  return { ref: { kind: 'merchant', ownerId: 'source-control', id, merchantId: id }, name: `Protocol ${id}`, items: [], itemsCount: { kind: 'unknown' }, itemsCompletion: 'unknown' };
}
function page(request: EngineSchemas['EngineRequest'], ids = ['a', 'b']): EngineSchemas['EnginePage'] {
  const merchants = ids.map(presentation);
  return { contractVersion: '1', requestId: request.requestId, refs: merchants.map(item => item.ref), presentations: { merchants, offerings: [] },
    count: { kind: 'lower_bound', value: 5 }, retrieval: { scope: 'bounded_candidates', windowId: 'window-control', candidateCount: 5, completion: 'more_in_window' },
    versions, applied: { selection: request.selection, filterHash: 'hash-control', sort: request.sort, constraints: request.filters.map(value => ({ value, origin: 'explicit_control', strength: 'hard', state: 'supported', reasonCodes: [] })) },
    status: 'ok', pageCursor: request.cursor ? 'self-second' : 'self-first', nextCursor: 'next-control', ...(request.cursor ? { previousCursor: 'self-first' } : {}) };
}
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
test('exposure requires one continuous second at half visibility in an active document and only qualifies once', () => {
  const visibility = new VisibilityQualifier();
  assert.equal(visibility.sample(0, 1, true), undefined);
  assert.equal(visibility.sample(999, 1, true), undefined);
  assert.deepEqual(visibility.sample(1000, 0.5, true), { visibleRatio: 0.5, continuousVisibleMs: 1000, documentActive: true });
  assert.equal(visibility.qualified, true); assert.equal(visibility.sample(3000, 1, true), undefined);
  const reset = new VisibilityQualifier();
  reset.sample(0, 1, true); reset.sample(900, 0.49, true); reset.sample(1000, 1, true);
  assert.equal(reset.sample(1900, 1, true), undefined);
  reset.sample(1950, 1, false); reset.sample(2000, 1, true);
  assert.equal(reset.sample(2999, 1, true), undefined);
  assert.deepEqual(reset.sample(3000, 0.7, true), { visibleRatio: 0.7, continuousVisibleMs: 1000, documentActive: true });
});

test('shared observation binding never attributes an unseen merchant and measurement failure leaves navigation usable', async () => {
  const sent: EngineSchemas['ClientEvent'][] = [];
  const { provider } = protocol();
  provider.observe = async event => { sent.push(event); return { accepted: 1, duplicates: 0, rejected: 0 }; };
  const deliveries = [{ token: 'delivery-control', ref: presentation('a').ref, position: 0 }];
  const binding = observationFor(provider, deliveries, 'a'); sendObservation(binding, 'detail_opened');
  assert.equal(sent[0]!.ref.id, 'a'); assert.equal(sent[0]!.position, 0); assert.equal(sent[0]!.exposureToken, 'delivery-control'); assert.equal(sent[0]!.type, 'detail_opened');
  sendObservation(observationFor(provider, deliveries, 'unseen'), 'detail_opened'); assert.equal(sent.length, 1);
  let navigated = false;
  sendObservation({ delivery: deliveries[0]!, send() { throw new Error('disabled'); } }, 'detail_opened'); navigated = true;
  assert.equal(navigated, true);
});

test('browser provider preserves approved delivery positions and sends only the contracted observation to the same-origin endpoint', async () => {
  const sent: { path: string; body: unknown }[] = [];
  const http = new EngineTransport(async (input, init) => {
    const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ path, body });
    if (path.endsWith('/release')) return json(context);
    if (path.endsWith('/results')) return json({ ...page(body), exposureToken: 'approved-delivery' });
    return json({ accepted: 1, duplicates: 0, rejected: 0 });
  });
  const provider = new EngineDiscoveryProvider(http, () => 0, () => 'request-control');
  const result = await provider.getMerchants(query); if (result.semantics !== 'bounded/v2') assert.fail();
  assert.deepEqual(result.observations?.map(value => [value.token, value.ref.id, value.position]), [['approved-delivery', 'a', 0], ['approved-delivery', 'b', 1]]);
  const observation = { eventId: 'browser-control', type: 'result_exposed' as const, ref: presentation('a').ref, position: 0, exposureToken: 'approved-delivery', occurredAt: '2026-10-19T12:00:00Z', exposure: { visibleRatio: 0.5, continuousVisibleMs: 1000, documentActive: true as const } };
  assert.deepEqual(await provider.observe(observation), { accepted: 1, duplicates: 0, rejected: 0 });
  assert.deepEqual(sent.at(-1), { path: '/api/discovery/events', body: { contractVersion: '1', events: [observation] } });
  const denied = await protocol().provider.getMerchants(query); if (denied.semantics !== 'bounded/v2') assert.fail();
  assert.equal(denied.observations, undefined);
});

function protocol(rewrite?: (value: EngineSchemas['EnginePage']) => unknown) {
  const calls: { path: string; body?: unknown; init?: RequestInit }[] = [];
  const fetcher: BrowserFetch = async (input, init) => {
    const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ path, body, init });
    if (path.endsWith('/release')) return json(context);
    if (path.endsWith('/results')) { const result = page(body, body.cursor ? ['c', 'd'] : ['a', 'b']); return json(rewrite ? rewrite(result) : result); }
    if (path.endsWith('/areas')) return json({ areas: ['area-control'] });
    return json(presentation(decodeURIComponent(path.split('/').at(-1)!)));
  };
  let id = 0;
  return { provider: new EngineDiscoveryProvider(new EngineTransport(fetcher), () => 0, () => `request-${++id}`), calls };
}
test('bounded provider preserves count/completion/versions and source IDs without a numeric total or detail fan-out', async () => {
  const { provider, calls } = protocol(); const result = await provider.getMerchants(query);
  assert.deepEqual(result.merchants.map(row => row.id), ['a', 'b']); assert.equal(result.semantics, 'bounded/v2');
  assert.equal('total' in result, false); assert.equal('hasMore' in result, false);
  if (result.semantics !== 'bounded/v2') assert.fail();
  assert.deepEqual(result.count, { kind: 'lower_bound', value: 5 }); assert.equal(countLabel(result), 'At least 5 merchants');
  assert.equal(result.versions.ranker, 'rank-control'); assert.equal(result.nextCursor, 'next-control');
  assert.deepEqual(calls.map(call => call.path), ['/api/discovery/release', '/api/discovery/results']);
  assert.equal(calls[1]!.init!.credentials, 'same-origin'); assert.equal(calls[1]!.init!.redirect, 'error');
  assert.deepEqual(result.merchants[0]!.itemsCount, { kind: 'unknown' });
});

test('next, previous and Back reuse exact cursors; restart keeps query/area but refreshes the release context', async () => {
  const { provider, calls } = protocol(); await provider.getMerchants(query);
  const second = await provider.getMerchants({ ...query, offset: 2 }); assert.deepEqual(second.merchants.map(row => row.id), ['c', 'd']);
  await provider.getMerchants({ ...query, offset: 0 });
  const requests = calls.filter(call => call.path.endsWith('/results')).map(call => call.body as EngineSchemas['EngineRequest']);
  assert.equal(requests[1]!.cursor, 'next-control'); assert.equal(requests[2]!.cursor, 'self-first'); assert.equal('offset' in requests[1]!, false);
  provider.restart(query); await provider.getMerchants(query);
  const fresh = calls.at(-1)!.body as EngineSchemas['EngineRequest'];
  assert.equal(fresh.query, 'Protocol'); assert.deepEqual(fresh.filters, [{ kind: 'catalog_area', areaId: 'area-control' }]); assert.equal('cursor' in fresh, false);
  assert.equal(calls.filter(call => call.path.endsWith('/release')).length, 2);
});

test('unknown counts and exhausted bounded windows stay distinct from complete catalogs', async () => {
  const { provider } = protocol(value => ({ ...value, count: { kind: 'unknown' }, nextCursor: undefined, retrieval: { ...value.retrieval, completion: 'window_exhausted' } }));
  const result = await provider.getMerchants(query);
  assert.equal(countLabel(result), 'Count unavailable'); assert.equal(windowMessage(result), 'End of this discovery window. More results may exist in the catalog.');
  assert.equal('hasMore' in result, false);
  assert.equal(countLabel({ total: 1, hasMore: false, offset: 0, mapping: 'mapped' }), '1 merchant');
});

test('malformed identities, broadened constraints, missing required cursors and invalid knownness are rejected', async () => {
  const changes = [
    (value: EngineSchemas['EnginePage']) => ({ ...value, presentations: { ...value.presentations, merchants: [presentation('wrong'), presentation('b')] } }),
    (value: EngineSchemas['EnginePage']) => ({ ...value, applied: { ...value.applied, constraints: [] } }),
    (value: EngineSchemas['EnginePage']) => ({ ...value, nextCursor: undefined }),
    (value: EngineSchemas['EnginePage']) => ({ ...value, count: { kind: 'exact' } }),
    (value: EngineSchemas['EnginePage']) => ({ ...value, versions: { ...value.versions, policy: 'foreign-policy' } }),
  ];
  for (const change of changes) await assert.rejects(protocol(change).provider.getMerchants(query), (error: unknown) => failureFrom(error).kind === 'unavailable');
  assert.deepEqual((await protocol().provider.getMerchants(query)).merchants.map(row => row.id), ['a', 'b']);
});

test('typed clarification, unsupported, restart, missing and retry-after metadata survives transport', async () => {
  const cases: [EngineSchemas['EngineError']['code'], EngineSchemas['EngineError']['recovery'], string, number][] = [
    ['CLARIFICATION_REQUIRED', 'clarify', 'clarification', 422], ['UNSUPPORTED_CAPABILITY', 'correct_request', 'unsupported', 422],
    ['CURSOR_EXPIRED', 'restart_preserving_constraints', 'restart', 409], ['NOT_FOUND', 'none', 'missing', 404], ['RATE_LIMITED', 'wait', 'unavailable', 429],
  ];
  for (const [code, recovery, kind, status] of cases) {
    const detail: EngineSchemas['EngineError'] = { contractVersion: '1', requestId: 'request-control', code, recovery, retryable: code === 'RATE_LIMITED', fieldPaths: ['/query'],
      ...(code === 'CLARIFICATION_REQUIRED' ? { clarification: { clarificationKey: 'date_timezone_required', messageKey: 'discovery.query.date_timezone_required', affectedPaths: ['/query'], options: [{ optionId: 'refine_request', labelKey: 'discovery.query.refine_request' }] } } : {}) };
    const http = new EngineTransport(async () => json(detail, status, { 'Retry-After': '17' }));
    await assert.rejects(http.read('/api/discovery/results', 'EnginePage', {}), (error: unknown) => {
      const failure = failureFrom(error); assert.equal(failure.kind, kind); assert.deepEqual(failure.detail, detail); assert.equal(failure.retryAfterSeconds, 17); return true;
    });
  }
});

test('transport bounds stalled reads and rejects HTML/oversized bodies without leaking upstream errors', async () => {
  for (const fetcher of [
    async () => new Promise<Response>(() => {}),
    async () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json' } }),
    async () => new Response('<h1>private upstream text</h1>', { headers: { 'Content-Type': 'text/html' } }),
    async () => json('x'.repeat(2 * 1024 * 1024 + 1)),
  ]) await assert.rejects(new EngineTransport(fetcher, 30).read('/api/discovery/areas', 'Areas'), (error: unknown) => {
    assert.equal(failureFrom(error).kind, 'unavailable'); assert.equal(String(error).includes('private upstream'), false); return true;
  });
  assert.deepEqual(await new EngineTransport(async () => json({ areas: ['area-control'] })).read('/api/discovery/areas', 'Areas'), { areas: ['area-control'] });
});

test('provider factory preserves the explicit legacy choice and never switches after an engine failure', async () => {
  const engine = protocol().provider;
  assert.equal(createDiscoveryProvider(undefined, { platform: platformMerchantProvider, engine: () => engine }).version, 'discovery-provider/v1');
  const selected = createDiscoveryProvider('engine', { platform: platformMerchantProvider, engine: () => engine });
  await assert.rejects(selected.getExperienceOfferings(query), (error: unknown) => failureFrom(error).kind === 'unsupported');
  assert.equal(selected.version, 'discovery-provider/bounded-v2'); assert.equal(selected.capabilities.transactions, false);
  assert.throws(() => createDiscoveryProvider('typo', { platform: platformMerchantProvider, engine: () => engine }), /must be platform or engine/);
});

test('legacy platform provider retains exact numeric totals and existing offsets', async () => {
  const originalFetch = globalThis.fetch; const originalWindow = globalThis.window;
  Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  globalThis.fetch = async () => json({ merchants: ['legacy-a', 'legacy-b'].map(id => ({ id, name: id, items: [] })), total: 2 });
  try {
    const first = await platformMerchantProvider.getMerchants({ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:restaurant', limit: 1 });
    assert.deepEqual(first.merchants.map(row => row.id), ['legacy-a']); assert.equal(first.total, 2); assert.equal(first.hasMore, true);
    const next = await platformMerchantProvider.getMerchants({ categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:restaurant', limit: 1, offset: 1 });
    assert.deepEqual(next.merchants.map(row => row.id), ['legacy-b']); assert.equal(next.offset, 1); assert.equal(next.hasMore, false);
  } finally { globalThis.fetch = originalFetch; Object.assign(globalThis, { window: originalWindow }); }
});

test('shared read task preserves typed failure and ignores an aborted old response', async () => {
  const snapshots: ReadSnapshot<string>[] = []; let finish: (value: string) => void = () => {};
  const old = new Promise<string>(resolve => { finish = resolve; });
  const stop = startProviderRead('old', () => old, value => snapshots.push(value)); stop();
  startProviderRead('new', async () => 'Current selection', value => snapshots.push(value));
  await new Promise(resolve => setImmediate(resolve)); finish('Stale selection'); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(snapshots, [{ key: 'old', loading: true }, { key: 'new', loading: true }, { key: 'new', loading: false, value: 'Current selection' }]);
  startProviderRead('failed', async () => { throw new ProviderReadError({ kind: 'restart' }); }, value => snapshots.push(value));
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(snapshots.at(-1), { key: 'failed', loading: false, failure: { kind: 'restart' } });
});

test('route/Back parsing keeps source IDs and cursor, while changed filters invalidate paging and exact context', () => {
  const route = parseRoute('?category=retired-category&subcategory=retired-child&view=results&q=Protocol&area=area-control&offset=2&cursor=opaque');
  assert.equal(route.categoryId, 'retired-category'); assert.equal(route.subcategoryId, 'retired-child'); assert.equal(route.cursor, 'opaque');
  assert.equal(parseRoute(routeUrl(route)).offset, 2); assert.equal(parseRoute(routeUrl(route)).search, 'Protocol');
  const changed = applyQueryChange(route, { area: 'another-area' });
  assert.equal(changed.cursor, undefined); assert.equal(changed.offset, 0); assert.equal(changed.search, 'Protocol'); assert.equal(changed.subcategoryId, 'retired-child');
  const paged = applyQueryChange(route, { offset: 4, cursor: 'next-opaque' }); assert.equal(paged.cursor, 'next-opaque'); assert.equal(paged.area, 'area-control');
});

test('exact collection destinations survive adaptation/history; source context is never replaced by a category browse', async () => {
  const request: EngineSchemas['EngineRequest'] = { contractVersion: '1', requestId: 'request-control', discoveryReleaseId: 'release-control', mode: 'merchant',
    selection: { categoryId: 'category-control', subcategoryId: 'subcategory-control' }, query: 'Protocol', filters: [{ kind: 'catalog_area', areaId: 'area-control' }], sort: 'recommended', limit: 2 };
  const adapted = collectionQuery(request); assert.deepEqual(adapted.engineRequest, request);
  const restored = parseRoute(routeUrl({ ...adapted, view: 'results' }), { discoveryRequest: request });
  assert.deepEqual(restored.engineRequest, request); assert.equal(restored.limit, 2);
  const { provider, calls } = protocol(); await provider.getMerchants(adapted);
  const sent = calls.at(-1)!.body as EngineSchemas['EngineRequest']; assert.deepEqual(sent.filters, request.filters); assert.equal(sent.query, 'Protocol');
  await assert.rejects(provider.getMerchants({ ...adapted, area: 'broader-area' }), (error: unknown) => failureFrom(error).kind === 'invalid');
  const copied = parseRoute(routeUrl({ ...adapted, view: 'results' }));
  await assert.rejects(provider.getMerchants(copied), (error: unknown) => failureFrom(error).detail?.fieldPaths[0] === '/contextToken');
  const constrained = { ...request, filters: [...request.filters, { kind: 'workflow_kind' as const, value: 'APPOINTMENT' as const }] };
  const edited = applyQueryChange({ ...collectionQuery(constrained) }, { area: 'another-area', search: 'Edited protocol' });
  assert.deepEqual(edited.engineRequest!.filters, [{ kind: 'workflow_kind', value: 'APPOINTMENT' }, { kind: 'catalog_area', areaId: 'another-area' }]);
  assert.equal(edited.engineRequest!.query, 'Edited protocol'); assert.equal(edited.engineRequest!.selection.subcategoryId, 'subcategory-control');
});

test('collection adapter keeps guest constraints and exact View all while rejecting a broadened section', async () => {
  let broaden = false;
  const http = new EngineTransport(async (path, init) => {
    if (String(path).endsWith('/release')) return json(context);
    const body = JSON.parse(String(init?.body)) as EngineSchemas['CollectionRequest'];
    assert.deepEqual(body.definitionIds, ['collection-control']);
    const effective: EngineSchemas['EngineRequest'] = { ...body.request, selection: { categoryId: 'category-control', subcategoryId: 'subcategory-control' },
      filters: broaden ? [] : body.request.filters };
    const preview = { ...page(effective), exposureToken: 'approved-preview', nextCursor: undefined, pageCursor: undefined, retrieval: { ...page(effective).retrieval, completion: 'unknown' as const } };
    return json({ sections: [{ definitionId: 'collection-control', titleKey: 'discovery.collections.explore', page: preview, viewAllRequest: effective }], partial: false, reasonCodes: [] });
  });
  const provider = new EngineDiscoveryProvider(http);
  const result = await provider.getCollections('category-control', { search: 'Protocol', area: 'area-control' });
  assert.deepEqual(result.collections[0]!.merchants.map(row => row.id), ['a', 'b']);
  assert.deepEqual(result.collections[0]!.observations?.map(value => [value.token, value.ref.id, value.position]), [['approved-preview', 'a', 0], ['approved-preview', 'b', 1]]);
  assert.equal(result.collections[0]!.viewAllQuery!.search, 'Protocol');
  assert.deepEqual(result.collections[0]!.viewAllQuery!.engineRequest!.filters, [{ kind: 'catalog_area', areaId: 'area-control' }]);
  broaden = true;
  await assert.rejects(provider.getCollections('category-control', { search: 'Protocol', area: 'area-control' }), (error: unknown) => failureFrom(error).kind === 'unavailable');
});

test('shared recovery UI renders localized instructions and preserves explicit restart/retry actions', () => {
  const restart = renderToStaticMarkup(<CatalogState failure={{ kind: 'restart' }} restart={() => {}} />);
  assert.equal(restart.includes('Start again with these filters'), true); assert.equal(restart.includes('same search and filters'), true);
  const missing = renderToStaticMarkup(<CatalogState failure={{ kind: 'missing' }} />); assert.equal(missing.includes('This listing is no longer available'), true);
  const unsupported = renderToStaticMarkup(<CatalogState failure={{ kind: 'unsupported' }} />); assert.equal(unsupported.includes('This request is not supported yet'), true);
});
