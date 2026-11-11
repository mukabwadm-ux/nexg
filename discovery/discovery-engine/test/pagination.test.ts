import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { parseSchema } from '../src/contracts/validate.js';
import { ResultSessions } from '../src/orchestrator/resultSessions.js';
import type { EngineRequest } from '../src/contracts/index.js';
import type { RetrievalCandidatePort } from '../engines/search-retrieval/src/ports.js';
import { release } from './helpers.js';
import { jsonResponse, merchantRequest, sourceControl } from './readControls.js';

async function setup(t: TestContext, options: { clock?: () => number; maxSessions?: number; retrieval?: RetrievalCandidatePort } = {}) {
  const state = { rows: ['d', 'b', 'e', 'a', 'c'].map(id => ({ ...sourceControl(id), name: 'Protocol merchant' })), failed: false, calls: 0 };
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async url => {
    state.calls++;
    if (state.failed) return jsonResponse({ private: 'upstream secret' }, 503);
    if (url.pathname === '/api/areas') return jsonResponse({ areas: ['protocol-area'] });
    return jsonResponse({ merchants: state.rows, total: 9000 });
  } });
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, release, provider,
    sessionLimits: { ...(options.clock ? { now: options.clock } : {}), ...(options.maxSessions ? { maxSessions: options.maxSessions } : {}) },
    ...(options.retrieval ? { retrieval: options.retrieval } : {}) });
  t.after(() => server.app.close());
  let cookie = '';
  const send = async (changes: Partial<EngineRequest> = {}, caller?: string) => {
    const response = await server.app.inject({ method: 'POST', url: '/api/discovery/results', headers: { cookie: caller ?? cookie }, payload: { ...merchantRequest(), limit: 2, ...changes } });
    const setCookie = response.headers['set-cookie'];
    if (caller === undefined && setCookie) cookie = String(setCookie).split(';')[0]!;
    return response;
  };
  return { ...server, state, provider, send, cookie: () => cookie };
}

test('HTTP paging pins order, supports backwards and offset reads, and never claims catalog exhaustion', async t => {
  const server = await setup(t);
  const response = await server.send(); assert.equal(response.statusCode, 200);
  const first = parseSchema('EnginePage', response.json());
  assert.deepEqual(first.refs.map(ref => ref.id), ['a', 'b']);
  assert.deepEqual(first.count, { kind: 'lower_bound', value: 5 });
  assert.equal(first.retrieval.completion, 'more_in_window'); assert.equal(typeof first.nextCursor, 'string');
  assert.equal(String(response.headers['set-cookie']).includes('HttpOnly; SameSite=Strict'), true);
  const second = parseSchema('EnginePage', (await server.send({ cursor: first.nextCursor! })).json());
  assert.deepEqual(second.refs.map(ref => ref.id), ['c', 'd']); assert.equal(second.retrieval.windowId, first.retrieval.windowId);
  const last = parseSchema('EnginePage', (await server.send({ cursor: second.nextCursor! })).json());
  assert.deepEqual(last.refs.map(ref => ref.id), ['e']); assert.equal(last.retrieval.completion, 'window_exhausted'); assert.equal(last.status, 'underfilled');
  const previous = parseSchema('EnginePage', (await server.send({ cursor: last.previousCursor! })).json());
  assert.deepEqual(previous.refs.map(ref => ref.id), ['c', 'd']);
  const offset = parseSchema('EnginePage', (await server.send({ offset: 2 })).json());
  assert.deepEqual(offset.refs, previous.refs); assert.equal(offset.retrieval.windowId, first.retrieval.windowId);
  const back = parseSchema('EnginePage', (await server.send({ cursor: first.pageCursor! })).json());
  assert.deepEqual(back.refs, first.refs); assert.equal(server.state.calls, 6);
});

test('fresh eligibility removes deleted/moved rows from original slots and never inserts new candidates', async t => {
  const server = await setup(t);
  const first = parseSchema('EnginePage', (await server.send()).json());
  server.state.rows = server.state.rows.filter(row => row.id !== 'c');
  server.state.rows.reverse(); server.state.rows.push({ ...sourceControl('aa'), name: 'Protocol merchant' });
  const second = parseSchema('EnginePage', (await server.send({ cursor: first.nextCursor! })).json());
  assert.deepEqual(second.refs.map(ref => ref.id), ['d']); assert.deepEqual(second.count, { kind: 'lower_bound', value: 4 });
  assert.equal(second.status, 'underfilled'); assert.equal(second.retrieval.completion, 'more_in_window');
  server.state.rows = server.state.rows.map(row => row.id === 'a' ? { ...row, name: 'Changed current name' } : row);
  const back = parseSchema('EnginePage', (await server.send({ cursor: first.pageCursor! })).json());
  assert.deepEqual(back.refs.map(ref => ref.id), ['a', 'b']); assert.equal(back.presentations.merchants[0]!.name, 'Changed current name');
});

test('a changed current name must still match the pinned query before a page can show it', async t => {
  const server = await setup(t);
  const first = parseSchema('EnginePage', (await server.send({ query: 'Protocol' })).json());
  server.state.rows = server.state.rows.map(row => row.id === 'c' ? { ...row, name: 'Different current label' } : row);
  const page = parseSchema('EnginePage', (await server.send({ query: 'protocol', cursor: first.nextCursor! })).json());
  assert.deepEqual(page.refs.map(ref => ref.id), ['d']); assert.deepEqual(page.count, { kind: 'lower_bound', value: 4 });
});

test('a source failure never serves cached presentations from a valid session', async t => {
  const server = await setup(t);
  const first = parseSchema('EnginePage', (await server.send()).json()); server.state.failed = true;
  const response = await server.send({ cursor: first.nextCursor! });
  assert.equal(response.statusCode, 503); assert.equal(response.json().code, 'CATALOG_UNAVAILABLE');
  assert.equal(response.body.includes('upstream secret'), false); assert.equal(server.stats().active, 0);
});

test('cursors reject tampering, another caller, altered query/area/selection/page size and mixed offset', async t => {
  const server = await setup(t);
  const first = parseSchema('EnginePage', (await server.send()).json()); const cursor = first.nextCursor!;
  const cases: Partial<EngineRequest>[] = [
    { cursor: `${cursor.slice(0, -1)}!` }, { cursor, query: 'different' }, { cursor, limit: 3 },
    { cursor, filters: [{ kind: 'catalog_area', areaId: 'protocol-area' }] },
    { cursor, selection: { categoryId: 'beauty-wellness' } },
  ];
  for (const change of cases) {
    const response = await server.send(change); assert.equal(response.statusCode, 409);
    assert.equal(response.json().recovery, 'restart_preserving_constraints');
  }
  const foreign = await server.send({ cursor }, ''); assert.equal(foreign.statusCode, 409); assert.equal(foreign.json().code, 'CURSOR_RESTART_REQUIRED');
  const mixed = await server.send({ cursor, offset: 2 }); assert.equal(mixed.statusCode, 400); assert.equal(mixed.json().code, 'INVALID_REQUEST');
  assert.equal(server.state.calls, 1);
});

test('expiry is absolute, emits typed recovery and a fresh constrained request starts a new window', async t => {
  let clock = 0; const server = await setup(t, { clock: () => clock });
  const request = { filters: [{ kind: 'catalog_area' as const, areaId: 'protocol-area' }] };
  const first = parseSchema('EnginePage', (await server.send(request)).json());
  clock = 299_999;
  assert.deepEqual(parseSchema('EnginePage', (await server.send({ ...request, cursor: first.nextCursor! })).json()).refs.map(ref => ref.id), ['c', 'd']);
  clock = 300_000;
  const expired = await server.send({ ...request, cursor: first.nextCursor! });
  assert.equal(expired.statusCode, 409); assert.equal(expired.json().code, 'CURSOR_EXPIRED');
  const restarted = parseSchema('EnginePage', (await server.send(request)).json());
  assert.deepEqual(restarted.refs.map(ref => ref.id), ['a', 'b']); assert.deepEqual(restarted.applied.constraints[0]!.value, { kind: 'catalog_area', areaId: 'protocol-area' });
  assert.notEqual(restarted.retrieval.windowId, first.retrieval.windowId);
});

test('eviction, missing offset sessions and deep offsets require a restart, and shutdown clears memory', async t => {
  const server = await setup(t, { maxSessions: 1 });
  const missing = await server.send({ offset: 2 }); assert.equal(missing.statusCode, 409);
  const first = parseSchema('EnginePage', (await server.send()).json());
  await server.send(); // Explicit new window, not an independent rerank of a cursor page.
  const evicted = await server.send({ cursor: first.nextCursor! }); assert.equal(evicted.statusCode, 409);
  assert.equal((await server.send({ offset: 2000 })).json().code, 'CURSOR_RESTART_REQUIRED');
  assert.equal(server.sessionStats().sessions, 1); assert.equal(server.sessionStats().evictions, 1);
  await server.app.close(); assert.deepEqual(server.sessionStats(), { sessions: 0, bytes: 0, evictions: 1 });
});

test('memory and per-caller limits bound session retention', () => {
  const sessions = new ResultSessions({ maxBytes: 2500, maxPerCaller: 2 }); const request = merchantRequest();
  const versions = { discoveryRelease: 'release', taxonomy: 't', layout: 'l', mapping: 'm', policy: 'p', ranker: 'r', sourceSnapshots: [] };
  const first = sessions.create('one', sessions.binding(request), ['a', 'b'], versions, 2, false);
  sessions.create('one', sessions.binding(request), ['c'], versions, 1, false);
  const third = sessions.create('one', sessions.binding(request), ['d'], versions, 1, false);
  assert.throws(() => sessions.resolve({ ...request, cursor: sessions.cursor(first, 0) }, 'one', sessions.binding(request)), { code: 'CURSOR_RESTART_REQUIRED' });
  assert.equal(sessions.resolve({ ...request, cursor: sessions.cursor(third, 0) }, 'one', sessions.binding(request))!.session.refs[0], 'd');
  assert.equal(sessions.stats().sessions, 2); assert.equal(sessions.stats().bytes < 2500, true);
});

test('index generation changes require restart even when source candidates and query are unchanged', async t => {
  let generation = 'one';
  const retrieval: RetrievalCandidatePort = { search: async () => ({ refs: ['a', 'b', 'c', 'd', 'e'].map(id => ({ kind: 'merchant', ownerId: 'nexg-platform-catalog', id, merchantId: id })),
    indexGeneration: generation, sourceSnapshot: 'source-control', assertCurrent: async () => {} }) };
  const server = await setup(t, { retrieval });
  // Match the actual adapter identity; no fake source facts are enabled.
  retrieval.search = async () => ({ refs: ['a', 'b', 'c', 'd', 'e'].map(id => ({ kind: 'merchant', ownerId: server.provider.ownerId, id, merchantId: id })),
    indexGeneration: generation, sourceSnapshot: 'source-control', assertCurrent: async () => {} });
  const firstResponse = await server.send({ query: 'Protocol' }); assert.equal(firstResponse.statusCode, 200);
  const first = parseSchema('EnginePage', firstResponse.json()); generation = 'two';
  const changed = await server.send({ query: 'Protocol', cursor: first.nextCursor! });
  assert.equal(changed.statusCode, 409); assert.equal(changed.json().code, 'CURSOR_RESTART_REQUIRED');
});

test('release bootstrap exposes only verified configuration and keeps the approved collections disabled', async t => {
  const server = await setup(t);
  const response = await server.app.inject('/api/discovery/release'); assert.equal(response.statusCode, 200);
  const context = parseSchema('ReleaseContext', response.json());
  assert.equal(context.discoveryReleaseId, release.releaseId); assert.equal(context.versions.policy, release.policyRevision);
  assert.equal(context.collections[0]!.id, release.collections[0]!.id); assert.equal(server.state.calls, 0);
  const collection = await server.app.inject({ method: 'POST', url: '/api/discovery/collections', payload: {
    request: { ...merchantRequest(), selection: { categoryId: release.collections[0]!.categoryId } }, definitionIds: [release.collections[0]!.id],
  } });
  assert.equal(collection.statusCode, 200); assert.deepEqual(collection.json(), { sections: [], partial: true, reasonCodes: ['COLLECTION_DISABLED'] });
  assert.equal(server.state.calls, 0);
});
