import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControlFileStore } from '../src/operations/controlFileStore.js';
import { controlRecord, RuntimeController } from '../src/operations/runtimeControl.js';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { release } from './helpers.js';
import { controlFetch, jsonResponse, merchantRequest, sourceControl } from './readControls.js';
import { eventControl } from './observabilityControls.js';

const baseline = { serving: true, search: false, events: false, tracing: true, profile: 'low_cost' } as const;

test('transient Windows replacement locks preserve the prior control pointer and safely retry the same record', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nexg-f11-windows-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const original = new ControlFileStore(directory); await original.init(baseline);
  let locked = true;
  const retry = new ControlFileStore(directory, async (source, destination) => {
    if (locked) { locked = false; assert.equal((await original.read()).revision, 0); throw Object.assign(new Error('locked'), { code: 'EPERM' }); }
    return rename(source, destination);
  });
  const disabled = await retry.set(0, { ...baseline, serving: false }, 'manual');
  assert.equal(disabled.revision, 1); assert.equal((await original.read()).flags.serving, false);
  const failing = new ControlFileStore(directory, async () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); });
  await assert.rejects(failing.set(1, baseline, 'manual'), /locked/);
  assert.equal((await original.read()).revision, 1); assert.equal((await original.read()).flags.serving, false);
});

test('real control files use compare-and-swap, verified immutable history and new revisions for rollback', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nexg-f11-control-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ControlFileStore(directory);
  assert.equal((await store.init(baseline)).revision, 0);
  await assert.rejects(store.init(baseline), /CONTROL_ALREADY_EXISTS/);
  const writes = await Promise.allSettled([store.set(0, { ...baseline, serving: false }, 'source_incident'), store.set(0, { ...baseline, serving: false }, 'manual')]);
  assert.equal(writes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal((await store.read()).flags.serving, false);
  await assert.rejects(store.set(0, baseline, 'manual'), /CONTROL_REVISION_CONFLICT/);
  const restored = await store.rollback(1, 0, 'manual');
  assert.deepEqual({ revision: restored.revision, rollbackOf: restored.rollbackOf, flags: restored.flags }, { revision: 2, rollbackOf: 0, flags: baseline });
  assert.equal(JSON.parse(await readFile(join(directory, 'revision-1.json'), 'utf8')).flags.serving, false);
  const original = await store.read();
  await writeFile(join(directory, 'controls.json'), JSON.stringify({ ...original, flags: { ...baseline, events: true } }));
  await assert.rejects(store.read(), /INVALID_CONTROL/);
  await writeFile(join(directory, 'controls.json'), 'RAW_OPERATOR_SECRET');
  await assert.rejects(store.read(), error => error instanceof Error && error.message === 'INVALID_CONTROL');
  await writeFile(join(directory, 'controls.json'), JSON.stringify(original)); assert.equal((await store.read()).revision, 2);
});

test('runtime rejects unavailable quality profiles and malformed controls, then fails closed on a bad refresh', () => {
  const controls = new RuntimeController({ search: false, events: false, quality: false });
  controls.apply(controlRecord(1, { ...baseline, serving: false }, 'manual'));
  assert.throws(() => controls.assertServing(), error => !!error && typeof error === 'object' && 'code' in error && error.code === 'OWNER_UNAVAILABLE');
  assert.throws(() => controls.apply(controlRecord(2, { ...baseline, profile: 'quality' }, 'manual')), /CAPABILITY_NOT_CONFIGURED/);
  assert.throws(() => controls.apply(controlRecord(0, baseline, 'manual')), /STALE_CONTROL/);
  assert.throws(() => new RuntimeController({ search: false, events: false, quality: false }, { ...controlRecord(0, baseline, 'initial'), checksum: 'wrong' }), /INVALID_CONTROL/);
  controls.trip(); assert.equal(controls.snapshot.reason, 'control_invalid'); assert.equal(controls.snapshot.flags.serving, false);
  controls.apply(controlRecord(2, baseline, 'manual')); controls.assertServing(); assert.equal(controls.snapshot.revision, 2);
});

test('actual operator-file changes invalidate old paging and delivery tokens, preserve request scope and recover through rollback', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nexg-f11-serving-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ControlFileStore(directory); await store.init({ ...baseline, events: true });
  const observation = eventControl();
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, release, controlStore: store, events: observation.config, interactionContext: observation.context,
    provider: new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: controlFetch() }) });
  t.after(() => server.app.close());
  const request = merchantRequest(); const first = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
  assert.equal(first.statusCode, 200); const page = first.json(); const cookie = String(first.headers['set-cookie']).split(';')[0]!;
  assert.equal(typeof page.exposureToken, 'string'); assert.equal(server.sessionStats().sessions, 1);
  await store.set(0, baseline, 'privacy_incident'); await server.refreshOperatorControls();
  assert.equal(server.sessionStats().sessions, 0); assert.equal(server.eventStats()!.deliveries, 0);
  const restart = await server.app.inject({ method: 'POST', url: '/api/discovery/results', headers: { cookie }, payload: { ...request, cursor: page.pageCursor } });
  assert.equal(restart.statusCode, 409); assert.equal(restart.json().recovery, 'restart_preserving_constraints');
  const fresh = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
  assert.equal(fresh.statusCode, 200); assert.deepEqual(fresh.json().applied.selection, request.selection); assert.equal(fresh.json().exposureToken, undefined);
  await store.set(1, { ...baseline, serving: false }, 'source_incident'); await server.refreshOperatorControls();
  const offline = await server.app.inject('/api/discovery/health'); assert.deepEqual(offline.json(), { contractVersion: '1', status: 'degraded', readiness: 'R0' });
  const disabled = await server.app.inject('/api/discovery/merchants/protocol-control'); assert.equal(disabled.statusCode, 503);
  const rollback = await store.rollback(2, 0, 'manual'); assert.equal(rollback.revision, 3); await server.refreshOperatorControls();
  const recovered = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
  assert.equal(recovered.statusCode, 200); assert.equal(typeof recovered.json().exposureToken, 'string');
  assert.notEqual(recovered.json().versions.profileRevision, page.versions.profileRevision);
  await writeFile(join(directory, 'controls.json'), '{}'); await server.refreshOperatorControls();
  assert.deepEqual((await server.app.inject('/api/discovery/health')).json(), { contractVersion: '1', status: 'degraded', readiness: 'R0' });
});

test('rollback cancels an in-flight source read with a typed restart and releases all request resources', async t => {
  let start!: () => void; const started = new Promise<void>(resolve => { start = resolve; });
  let unblock!: () => void; const blocked = new Promise<void>(resolve => { unblock = resolve; });
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, release,
    provider: new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: async () => { start(); await blocked; return jsonResponse({ merchants: [sourceControl()], total: 1 }); } }) });
  t.after(() => server.app.close());
  const pending = Promise.resolve(server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: merchantRequest() }));
  await started; server.controls.apply(controlRecord(1, baseline, 'manual'));
  const response = await pending; unblock();
  assert.equal(response.statusCode, 409); assert.equal(response.json().code, 'CURSOR_RESTART_REQUIRED');
  assert.deepEqual(server.stats(), { active: 0, completed: 1, overloads: 0 }); assert.equal(server.sessionStats().sessions, 0);
});
