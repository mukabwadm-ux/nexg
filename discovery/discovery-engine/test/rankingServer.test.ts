import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { parseSchema } from '../src/contracts/validate.js';
import { release } from './helpers.js';
import { merchantRequest, sourceControl, jsonResponse } from './readControls.js';

async function setup(t: TestContext) {
  const limits: string[] = [];
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async url => {
    limits.push(url.searchParams.get('limit')!);
    return jsonResponse({ merchants: Array.from({ length: 36 }, (_, index) => ({
      ...sourceControl(`source-${String(35 - index).padStart(2, '0')}`), name: 'Protocol merchant',
      rating: 5 - index / 10, isFeatured: index === 0, featuredRank: index, deliveryFee: index, isOpen: true,
    })), total: 9999 });
  } });
  const server = await buildReadOnlyServer({ release, provider, config: { host: '127.0.0.1', port: 5190 } });
  t.after(() => server.app.close());
  return { ...server, limits, send: (changes: Record<string, unknown> = {}) => server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: { ...merchantRequest(), ...changes } }) };
}

test('public Recommended is neutral/stable for cold start and ignores legacy featured, rating, fee and open defaults', async t => {
  const server = await setup(t);
  const response = await server.send({ limit: 3 }); assert.equal(response.statusCode, 200);
  const browse = parseSchema('EnginePage', response.json());
  assert.deepEqual(browse.refs.map(ref => ref.id), ['source-00', 'source-01', 'source-02']);
  assert.equal(browse.versions.ranker, 'deterministic-recommendation/v1');
  const query = parseSchema('EnginePage', (await server.send({ query: '"Protocol merchant"', limit: 3 })).json());
  assert.deepEqual(query.refs, browse.refs); assert.deepEqual(query.count, { kind: 'lower_bound', value: 36 });
  assert.ok(query.presentations.merchants.every(row => row.items.every(item => item.listedPrice.state === 'unknown')));
});

test('page size cannot change the bounded ranking pool; paging stays within its session', async t => {
  const server = await setup(t);
  const one = parseSchema('EnginePage', (await server.send({ limit: 1 })).json());
  const three = parseSchema('EnginePage', (await server.send({ limit: 3 })).json());
  assert.deepEqual(one.refs, three.refs.slice(0, 1)); assert.deepEqual(server.limits, ['48', '48']);
  assert.deepEqual(one.count, { kind: 'lower_bound', value: 36 }); assert.equal(one.retrieval.completion, 'more_in_window'); assert.equal(typeof one.nextCursor, 'string');
  assert.deepEqual(three.presentations.merchants.map(row => row.ref), three.refs);
});

test('public callers cannot supply preferences, rank features or unlock an unverified global sort', async t => {
  const server = await setup(t);
  for (const changes of [{ preferenceContext: { origin: 'explicit_request', preferences: [] } }, { ranking: { adSpend: 100 } }]) {
    const response = await server.send(changes); assert.equal(response.statusCode, 400); assert.equal(parseSchema('EngineError', response.json()).code, 'INVALID_REQUEST');
  }
  const explicit = await server.send({ sort: 'rating' }); assert.equal(explicit.statusCode, 422); assert.equal(explicit.json().code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(server.limits.length, 0);
  const success = parseSchema('EnginePage', (await server.send({ limit: 1 })).json()); assert.equal(success.refs[0]!.id, 'source-00');
});
