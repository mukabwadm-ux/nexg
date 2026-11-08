import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogHttpTransport, sourcePathId, validateSourceOrigin } from '../src/adapters/platform/httpTransport.js';
import { normalizeMerchant, normalizeMerchantPage } from '../src/adapters/platform/normalize.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { ReadServiceError } from '../src/contracts/readErrors.js';
import { controlFetch, jsonResponse, sourceControl, withBudget } from './readControls.js';

const unavailable = (error: unknown) => error instanceof ReadServiceError && error.code === 'CATALOG_UNAVAILABLE';
const observedAt = new Date().toISOString();

test('normalization preserves source IDs and rejects legacy operational and money defaults', () => {
  for (const price of [0, 50, null, -1]) {
    const control = sourceControl(); control.items[0]!.price = price as number;
    const { presentation, evidence } = normalizeMerchant(control, 'platform-catalog', observedAt);
    assert.equal(presentation.ref.id, control.id); assert.equal(presentation.items[0]!.ref.merchantId, control.id);
    assert.deepEqual(presentation.items[0]!.listedPrice, { state: 'unknown', reason: 'not_verified' });
    assert.equal('isOpen' in presentation, false); assert.equal('rating' in presentation, false);
    assert.equal('commerceMode' in presentation, false); assert.equal('isAvailable' in presentation.items[0]!, false);
    assert.deepEqual(presentation.itemsCount, { kind: 'lower_bound', value: 1 });
    assert.equal(presentation.itemsCompletion, 'bounded_window');
    assert.deepEqual(evidence, { source: { ownerId: 'platform-catalog', id: control.id }, observedAt });
  }
  const empty = sourceControl(); empty.items = [];
  assert.deepEqual(normalizeMerchant(empty, 'owner', observedAt).presentation.itemsCount, { kind: 'lower_bound', value: 0 });
});

test('bad ownership, duplicate IDs, inactive records and malformed pages fail closed', () => {
  const wrongOwner = sourceControl(); wrongOwner.items[0]!.merchantId = 'other-owner';
  const duplicate = sourceControl(); duplicate.items.push(duplicate.items[0]!);
  const inactive = sourceControl(); inactive.status = 'inactive';
  for (const value of [null, {}, wrongOwner, duplicate, inactive]) assert.throws(() => normalizeMerchant(value, 'owner', observedAt), unavailable);
  assert.throws(() => normalizeMerchant(sourceControl(), 'owner', observedAt, 'another-id'), unavailable);
  for (const page of [{ merchants: [sourceControl(), sourceControl()], total: 10 }, { merchants: [], total: -1 }, { merchants: [], total: 0, offset: 1 }]) {
    assert.throws(() => normalizeMerchantPage(page, 'owner', observedAt, 24), unavailable);
  }
  assert.throws(() => normalizeMerchantPage({ merchants: [sourceControl()], total: 999 }, 'owner', observedAt, 24, 'other-area'), unavailable);
});

test('unsafe image protocols are omitted and bounded item previews never imply completeness', () => {
  for (const url of ['javascript:alert(1)', '//external.test/image', 'https://user:password@external.test/image']) {
    const control = { ...sourceControl(), heroImage: url };
    assert.equal(normalizeMerchant(control, 'owner', observedAt).presentation.image, undefined);
  }
  const normalized = normalizeMerchant({ ...sourceControl(), heroImage: '/approved/image.png' }, 'owner', observedAt);
  assert.equal(normalized.presentation.image, '/approved/image.png');
});

test('provider uses only bounded GETs and exact source subcategories, deduplicating rows', async () => {
  const calls: URL[] = [];
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: controlFetch((url, init) => {
    calls.push(url); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.credentials, 'omit');
    assert.deepEqual(init.headers, { Accept: 'application/json' });
  }) });
  await withBudget(async budget => {
    const rows = await provider.getMerchants({ sourceSubcategoryIds: ['source one', 'source-two', 'source one'], limit: 24, area: 'protocol-area' }, budget);
    assert.equal(rows.length, 1); assert.equal(calls.length, 2); assert.equal(budget.snapshot.calls, 2);
    assert.deepEqual(calls.map(url => url.searchParams.get('subcategory')), ['source one', 'source-two']);
    for (const url of calls) {
      assert.equal(url.pathname, '/api/merchants'); assert.equal(url.searchParams.get('area'), 'protocol-area');
      assert.equal(url.searchParams.get('offset'), '0'); assert.equal(url.searchParams.get('limit'), '24');
      assert.equal(url.searchParams.has('category'), false); assert.equal(url.searchParams.has('search'), false);
    }
  });
});

test('detail reads are URL-encoded, memoized per request and validate returned identity', async () => {
  let count = 0;
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: controlFetch(() => { count++; }) });
  await withBudget(async budget => {
    const [first, second] = await Promise.all([provider.getMerchant('control ?#', budget), provider.getMerchant('control ?#', budget)]);
    assert.deepEqual(first, second); assert.equal(first.ref.id, 'control ?#'); assert.equal(count, 1);
    assert.equal(budget.snapshot.uniqueDetails, 1);
  });
  const wrong = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async () => jsonResponse(sourceControl('wrong')) });
  await withBudget(budget => assert.rejects(wrong.getMerchant('requested', budget), unavailable));
});

test('unconfigured or failing source remains unavailable and never produces fallback inventory', async () => {
  const provider = new PlatformDiscoveryProvider(); assert.equal(provider.configured, false);
  await withBudget(async budget => {
    assert.equal(await provider.probe(budget), false);
    await assert.rejects(provider.getMerchant('control', budget), unavailable);
    await assert.rejects(provider.getAreas(budget), unavailable);
  });
  const wrong = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async () => jsonResponse({ areas: [], secret: 'hidden' }) });
  await withBudget(budget => assert.rejects(wrong.getAreas(budget), unavailable));
});

test('only root HTTP origins and safe ID components are accepted', () => {
  assert.equal(validateSourceOrigin('http://127.0.0.1:3001').origin, 'http://127.0.0.1:3001');
  for (const origin of ['file:///catalog', 'https://user:pass@catalog.test', 'https://catalog.test/path', 'https://catalog.test?secret=x', 'https://catalog.test#x']) assert.throws(() => validateSourceOrigin(origin));
  for (const id of ['..', '.', '../x', 'x/y', 'x\\y', '\u0000', '']) assert.throws(() => sourcePathId(id));
  assert.equal(sourcePathId('original id'), 'original%20id');
});

test('source status and redirect failures are typed without following or leaking a response', async () => {
  for (const status of [301, 401, 404, 429, 500]) {
    const transport = new CatalogHttpTransport('http://catalog.test', async () => jsonResponse({ secret: 'private-source-detail' }, status,
      { location: 'http://other.test/private', 'retry-after': '7' }));
    await withBudget(async budget => {
      await assert.rejects(transport.get('/api/merchants', new URLSearchParams(), budget), error => {
        assert.ok(unavailable(error)); assert.equal(String(error).includes('private-source-detail'), false);
        if (status === 429) assert.equal((error as ReadServiceError).retryAfter, 7);
        return true;
      });
    });
  }
  const missing = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async () => jsonResponse({}, 404) });
  await withBudget(budget => assert.rejects(missing.getMerchant('missing', budget), error => error instanceof ReadServiceError && error.code === 'NOT_FOUND'));
});

test('invalid JSON, MIME type, declared size and streamed size fail within response limits', async () => {
  const responses = [new Response('{', { headers: { 'content-type': 'application/json' } }), new Response('<html>'),
    jsonResponse({}, 200, { 'content-length': '101' }), jsonResponse({ value: 'x'.repeat(100) })];
  for (const response of responses) {
    const transport = new CatalogHttpTransport('http://catalog.test', async () => response, 100);
    await withBudget(budget => assert.rejects(transport.get('/api/areas', new URLSearchParams(), budget), unavailable));
  }
});

test('shared deadline covers response bodies and cancels a stalled stream', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { canceled = true; } });
  const transport = new CatalogHttpTransport('http://catalog.test', async () => new Response(stream, { headers: { 'content-type': 'application/json' } }));
  await withBudget(budget => assert.rejects(transport.get('/api/areas', new URLSearchParams(), budget), unavailable), 20);
  assert.equal(canceled, true);
});
