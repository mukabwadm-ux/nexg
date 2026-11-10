import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { InteractionPipeline } from '../src/events/pipeline.js';
import { ReadBudget } from '../src/orchestrator/readBudget.js';
import { controlRecord } from '../src/operations/runtimeControl.js';
import type { Schemas } from '../src/contracts/index.js';
import { parseSchema } from '../src/contracts/validate.js';
import { controlFetch, merchantRequest, sourceControl, jsonResponse } from './readControls.js';
import { release } from './helpers.js';
import { eventControl, ObservationControlSink } from './observabilityControls.js';
import { collectionRelease, definition, collectionRequest } from './collectionControls.js';

test('collection tokens cover only final visible preview refs, not the larger retrieved candidate page', async t => {
  const artifact = collectionRelease([definition('preview', { maxItems: 2 })]);
  const events = eventControl();
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, release: artifact, events: events.config, interactionContext: events.context,
    provider: new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async () => jsonResponse({ merchants: [0, 1, 2, 3].map(id => sourceControl(`protocol-${id}`)), total: 4 }) }) });
  t.after(() => server.app.close());
  const response = await server.app.inject({ method: 'POST', url: '/api/discovery/collections', payload: { request: collectionRequest(artifact), definitionIds: ['preview'] } });
  assert.equal(response.statusCode, 200); const page = response.json().sections[0].page;
  assert.deepEqual(page.refs.map((ref: Schemas['EngineRef']) => ref.id), ['protocol-0', 'protocol-1']);
  const cookie = String(response.headers['set-cookie']).split(';')[0]!;
  const common = { type: 'detail_opened', exposureToken: page.exposureToken, occurredAt: new Date().toISOString() };
  const submitted = await server.app.inject({ method: 'POST', url: '/api/discovery/events', headers: { cookie }, payload: { contractVersion: '1', events: [
    { ...common, eventId: 'preview-good', position: 0, ref: page.refs[0] },
    { ...common, eventId: 'preview-unseen', position: 2, ref: { ...page.refs[0], id: 'protocol-2', merchantId: 'protocol-2' } },
  ] } });
  assert.deepEqual(submitted.json(), { accepted: 1, duplicates: 0, rejected: 1 }); assert.equal(events.sink.rows.size, 1);
});

async function setup(t: TestContext) {
  const control = eventControl();
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, provider: new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: controlFetch() }), release, events: control.config, interactionContext: control.context });
  t.after(() => server.app.close());
  const response = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: merchantRequest() });
  assert.equal(response.statusCode, 200);
  const page = parseSchema('EnginePage', response.json());
  const cookie = String(response.headers['set-cookie']).split(';')[0]!;
  const event = (type: 'result_exposed' | 'detail_opened' = 'detail_opened', id = 'event-control'): Schemas['ClientEvent'] => ({ eventId: id, type, ref: page.refs[0]!,
    exposureToken: page.exposureToken!, occurredAt: new Date().toISOString(), position: 0,
    ...(type === 'result_exposed' ? { exposure: { visibleRatio: 0.5, continuousVisibleMs: 1000, documentActive: true } } : {}) });
  const submit = (events: unknown[], caller = cookie) => server.app.inject({ method: 'POST', url: '/api/discovery/events', headers: { cookie: caller }, payload: { contractVersion: '1', events } });
  return { ...control, ...server, page, event, submit, cookie };
}

test('existing platform authentication context is resolved server-side; missing or withdrawn context cannot collect', async t => {
  const control = eventControl();
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: controlFetch() });
  const unconnected = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, release, provider, events: control.config });
  t.after(() => unconnected.app.close());
  const noContext = await unconnected.app.inject({ method: 'POST', url: '/api/discovery/results', payload: merchantRequest() });
  assert.equal(noContext.statusCode, 200); assert.equal(noContext.json().exposureToken, undefined); assert.equal(unconnected.controls.snapshot.flags.events, false);
  let verified = true;
  const connected = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, release, provider, events: control.config,
    interactionContext: { async resolve(request) { return verified && request.headers.authorization === 'Bearer protocol-session' ? 'verified:control' : undefined; } } });
  t.after(() => connected.app.close());
  const response = await connected.app.inject({ method: 'POST', url: '/api/discovery/results', headers: { authorization: 'Bearer protocol-session' }, payload: merchantRequest() });
  assert.equal(response.statusCode, 200); assert.equal(typeof response.json().exposureToken, 'string');
  const body = response.json(); const cookie = String(response.headers['set-cookie']).split(';')[0]!;
  const event = { eventId: 'authenticated-context', type: 'detail_opened', ref: body.refs[0], position: 0, exposureToken: body.exposureToken, occurredAt: new Date().toISOString() };
  const submit = () => connected.app.inject({ method: 'POST', url: '/api/discovery/events', headers: { cookie, authorization: 'Bearer protocol-session' }, payload: { contractVersion: '1', events: [event] } });
  assert.deepEqual((await submit()).json(), { accepted: 1, duplicates: 0, rejected: 0 });
  verified = false;
  assert.deepEqual((await submit()).json(), { accepted: 0, duplicates: 0, rejected: 1 });
  assert.equal(control.sink.rows.size, 1);
});

test('qualified exposure and weak clicks append first-party CloudEvents once, with stable retry receipts', async t => {
  const { submit, event, sink, page } = await setup(t);
  assert.match(page.exposureToken!, /^[a-f0-9-]{36}\.[a-f0-9]{64}$/);
  const exposed = event('result_exposed', 'exposure-1'); const clicked = event();
  assert.deepEqual((await submit([exposed, clicked])).json(), { accepted: 2, duplicates: 0, rejected: 0 });
  assert.deepEqual((await submit([exposed, clicked])).json(), { accepted: 0, duplicates: 2, rejected: 0 });
  assert.deepEqual((await submit([{ ...exposed, eventId: 'new-id-same-exposure' }])).json(), { accepted: 0, duplicates: 1, rejected: 0 });
  assert.deepEqual((await submit([{ ...exposed, eventId: 'new-id-same-exposure', occurredAt: new Date(Date.parse(exposed.occurredAt) + 1).toISOString() }])).json(), { accepted: 0, duplicates: 0, rejected: 1 });
  assert.deepEqual((await submit([{ ...clicked, occurredAt: new Date(Date.parse(clicked.occurredAt) + 1).toISOString() }])).json(), { accepted: 0, duplicates: 0, rejected: 1 });
  const rows = [...sink.rows.values()]; assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => [row.specversion, row.type, row.data.position, row.data.measurement]), [
    ['1.0', 'discovery.result.exposed.v1', 0, 'client_reported'], ['1.0', 'discovery.detail.opened.v1', 0, 'client_reported']]);
  assert.deepEqual(rows[0]!.data.ref, page.refs[0]); assert.match(rows[0]!.id, /^[a-f0-9-]{14}7/);
  assert.equal(JSON.stringify(rows).includes('owner:opaque-control'), false);
  assert.equal(JSON.stringify(rows).includes('cookie'), false);
});

test('caller/ref/position/time binding rejects forged or undelivered actions without adding outcomes', async t => {
  const { submit, event, sink } = await setup(t);
  const valid = event();
  assert.deepEqual((await submit([valid])).json(), { accepted: 1, duplicates: 0, rejected: 0 });
  const invalid = [
    { ...event('detail_opened', 'wrong-position'), position: 1 },
    { ...event('detail_opened', 'wrong-ref'), ref: { ...valid.ref, id: 'unseen', merchantId: 'unseen' } },
    { ...event('detail_opened', 'future'), occurredAt: new Date(Date.now() + 6000).toISOString() },
    { ...event('detail_opened', 'past'), occurredAt: '2020-01-01T00:00:00Z' },
    { ...event('detail_opened', 'bad-token'), exposureToken: valid.exposureToken.slice(0, -1) + 'x' },
    { ...event('detail_opened', 'handoff'), type: 'handoff_opened' },
  ];
  assert.deepEqual((await submit(invalid)).json(), { accepted: 0, duplicates: 0, rejected: 6 });
  assert.deepEqual((await submit([valid], '')).json(), { accepted: 0, duplicates: 0, rejected: 1 });
  assert.equal(sink.rows.size, 1);
});

test('strict wire rejects raw private payloads, weak visibility and spoofed owner success', async t => {
  const { submit, event, sink, app } = await setup(t);
  const exposed = event('result_exposed');
  for (const bad of [
    { ...event(), query: 'private diagnosis and address' }, { ...event(), type: 'booking_confirmed' },
    { ...exposed, exposure: { visibleRatio: 0.49, continuousVisibleMs: 1000, documentActive: true } },
    { ...exposed, exposure: { visibleRatio: 1, continuousVisibleMs: 999, documentActive: true } },
    { ...exposed, exposure: { visibleRatio: 1, continuousVisibleMs: 1000, documentActive: false } },
    { ...exposed, exposure: undefined }, { ...exposed, position: undefined },
  ]) { const response = await submit([bad]); assert.equal(response.statusCode, 400); assert.equal(response.json().code, 'INVALID_REQUEST'); assert.equal(response.body.includes('diagnosis'), false); }
  const owner = await app.inject({ method: 'POST', url: '/internal/owner-outcomes', payload: { outcomeKind: 'confirmed' } });
  assert.equal(owner.statusCode, 404);
  assert.deepEqual((await submit([exposed])).json(), { accepted: 1, duplicates: 0, rejected: 0 }); assert.equal(sink.rows.size, 1);
});

test('trusted consent withdrawal, internal/bot audiences and operator event disable revoke collection', async t => {
  const { submit, event, sink, decision, app, controls } = await setup(t);
  decision.allowed = false;
  assert.deepEqual((await submit([event()])).json(), { accepted: 0, duplicates: 0, rejected: 1 });
  const denied = await app.inject({ method: 'POST', url: '/api/discovery/results', payload: merchantRequest() });
  assert.equal(denied.statusCode, 200); assert.equal(denied.json().exposureToken, undefined);
  decision.allowed = true;
  for (const audience of ['internal', 'bot', 'unknown'] as const) {
    decision.audience = audience;
    const response = await app.inject({ method: 'POST', url: '/api/discovery/results', payload: merchantRequest() });
    assert.equal(response.statusCode, 200); assert.equal(response.json().exposureToken, undefined);
  }
  decision.audience = 'production'; assert.deepEqual((await submit([event()])).json(), { accepted: 1, duplicates: 0, rejected: 0 });
  controls.apply(controlRecord(1, { ...controls.snapshot.flags, events: false }, 'privacy_incident'));
  const disabled = await submit([event('detail_opened', 'after-disable')]); assert.equal(disabled.statusCode, 422); assert.equal(disabled.json().code, 'UNSUPPORTED_CAPABILITY');
  assert.equal(sink.rows.size, 1);
});

test('ambiguous sink timeout rejects this attempt; idempotent retry reuses the same observation and never duplicates storage', async t => {
  const { app, page, cookie, config, sink } = await setup(t); await app.close();
  let first = true;
  const original = config.sink;
  config.sink = { ...original, id: original.id, guarantees: original.guarantees, deleteScope: original.deleteScope.bind(original), async append(key, value, signal) {
    const state = await original.append(key, value, signal);
    if (first) { first = false; return new Promise<never>(() => {}); } return state;
  } };
  const pipeline = new InteractionPipeline(config);
  const budget = new ReadBudget(); t.after(() => budget.dispose());
  const issued = await pipeline.issue(page, cookie, budget, 'verified:control');
  const event = { eventId: 'timeout-control', type: 'detail_opened', ref: issued.refs[0]!, exposureToken: issued.exposureToken!, occurredAt: new Date().toISOString(), position: 0 };
  const batch = { contractVersion: '1', events: [event] };
  assert.deepEqual(await pipeline.ingest(batch, cookie, budget, () => true, 'verified:control'), { accepted: 0, duplicates: 0, rejected: 1 });
  assert.deepEqual(await pipeline.ingest(batch, cookie, budget, () => true, 'verified:control'), { accepted: 0, duplicates: 1, rejected: 0 });
  assert.equal(sink.rows.size, 1); assert.equal([...sink.rows.values()][0]!.data.ref.id, 'protocol-control');
});

test('delivery expiry/bounds and stable scope deletion survive engine replacement; retention is enforced by the sink', async t => {
  const { page, config } = await setup(t); let now = Date.now();
  const sink = new ObservationControlSink(() => now); const setupControl = eventControl(sink);
  const pipeline = new InteractionPipeline(setupControl.config, () => now);
  const budget = new ReadBudget(); t.after(() => budget.dispose());
  let issued = page;
  for (let index = 0; index < 16; index++) { issued = await pipeline.issue(page, 'caller', budget, 'verified:control'); assert.equal(typeof issued.exposureToken, 'string'); }
  assert.equal((await pipeline.issue(page, 'caller', budget, 'verified:control')).exposureToken, undefined);
  const batch = { contractVersion: '1', events: [{ eventId: 'delete-control', type: 'detail_opened', ref: issued.refs[0], position: 0, exposureToken: issued.exposureToken, occurredAt: new Date(now).toISOString() }] };
  assert.deepEqual(await pipeline.ingest(batch, 'caller', budget, () => true, 'verified:control'), { accepted: 1, duplicates: 0, rejected: 0 });
  const replacement = new InteractionPipeline(setupControl.config, () => now);
  await replacement.deleteScope('owner:opaque-control', budget); assert.equal(sink.rows.size, 0);
  now += 300_001;
  assert.deepEqual(await pipeline.ingest(batch, 'caller', budget, () => true, 'verified:control'), { accepted: 0, duplicates: 0, rejected: 1 });
  assert.equal(pipeline.stats().deliveries, 0);
  const next = await pipeline.issue(page, 'caller', budget, 'verified:control');
  const second = { contractVersion: '1', events: [{ ...batch.events[0], eventId: 'retention-control', exposureToken: next.exposureToken, occurredAt: new Date(now).toISOString() }] };
  assert.deepEqual(await pipeline.ingest(second, 'caller', budget, () => true, 'verified:control'), { accepted: 1, duplicates: 0, rejected: 0 });
  now += 60_001;
  // A sink read/delete operation enforces expiry even when the subject differs.
  await sink.deleteScope('other-scope', budget.signal); assert.equal(sink.rows.size, 0);
  assert.throws(() => new InteractionPipeline({ ...config, policy: { ...config.policy, sharing: 'external' } } as never), /Invalid event configuration/);
});
