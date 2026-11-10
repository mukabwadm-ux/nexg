import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TypesenseIndexAdapter } from '../src/adapters/typesense/indexAdapter.js';
import { TypesenseCandidateReader } from '../src/adapters/typesense/candidateReader.js';
import { CatalogIndexCoordinator } from '../src/indexing/coordinator.js';
import { FileWriterLock } from '../src/indexing/writerLock.js';
import { IndexingError, type CatalogDelta, type CatalogSnapshot, type GenerationManifest } from '../src/indexing/contracts.js';
import { release } from './helpers.js';
import { sealRelease } from '../src/releases/artifact.js';
import { indexNow, indexSelection, projectionControl, snapshotControl } from './indexControls.js';
import { TypesenseServingRetrieval } from '../src/adapters/typesense/servingRetrieval.js';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { normalizeMerchant } from '../src/adapters/platform/normalize.js';
import { sourceControl } from './readControls.js';
import { parseSchema } from '../src/contracts/validate.js';
import type { ServerDiscoveryProvider } from '../src/providers/DiscoveryProvider.js';
import { definition } from './collectionControls.js';

test('actual Typesense 30.2 indexing lifecycle', async t => {
  const key = process.env.DISCOVERY_SEARCH_API_KEY ?? (await readFile(new URL('../../artifacts/local/typesense.key', import.meta.url), 'utf8')).trim();
  const namespace = `nexg_protocol_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const collections: string[] = []; let injectBadImport = false;
  class TrackedIndex extends TypesenseIndexAdapter {
    override async create(manifest: GenerationManifest, signal: AbortSignal) {
      const name = await super.create(manifest, signal); collections.push(name); return name;
    }
  }
  const index = new TrackedIndex({ origin: process.env.DISCOVERY_SEARCH_ORIGIN ?? 'http://127.0.0.1:8108', apiKey: key, namespace,
    fetcher: async (url, init) => {
      if (injectBadImport && String(url).includes('/documents/import')) {
        const lines = String(init?.body).split('\n');
        const bad = JSON.parse(lines[0]!); bad.label = 7; lines[0] = JSON.stringify(bad);
        return fetch(url, { ...init, body: lines.join('\n') });
      }
      return fetch(url, init);
    } });
  assert.equal(await index.health(), true, 'Run npm run search:up; this integration command never skips an unavailable server');
  const directory = await mkdtemp(join(tmpdir(), 'discovery-typesense-protocol-'));
  t.after(async () => {
    const signal = AbortSignal.timeout(10000);
    for (const purpose of ['serving', 'evaluation'] as const) {
      if (await index.readAlias(purpose, signal)) await index.http.request('DELETE', `/aliases/${index.http.alias(purpose)}`, signal);
    }
    for (const collection of collections) await index.removeUnpublished(collection, signal);
    await unlink(join(directory, 'last-writer.json')).catch(error => { if (error.code !== 'ENOENT') throw error; }); await rmdir(directory);
  });
  const coordinator = new CatalogIndexCoordinator(index, new FileWriterLock(directory), release, () => indexNow);
  const reader = new TypesenseCandidateReader(index, release, () => indexNow);
  const base = snapshotControl([projectionControl('protocol-one', 1), projectionControl('protocol-two', 2, 'Amber schema control')]);
  const offering = projectionControl('protocol-item', 3, 'Quartz schema control'); offering.projection.entityKind = 'offering'; offering.projection.merchantId = 'protocol-one';
  if (offering.projection.classification.state === 'known') offering.projection.classification.evidence.validUntil = new Date(indexNow + 10000).toISOString();
  base.records.push(offering); base.source.checkpoint = 3;
  const input = (value: CatalogSnapshot | CatalogDelta) => ({ read: async () => value });
  const first = await coordinator.build(input(base), 'serving');

  await t.test('import, alias, scoped merchant/offering lookup and stable repeated reads', async () => {
    assert.equal(await index.readAlias('serving', AbortSignal.timeout(1000)), first.collection);
    assert.equal(first.count, 3);
    const request = { query: 'Orchid', selectionId: indexSelection, mode: 'merchant' as const, limit: 24 };
    const result = await reader.search(first.collection, request, 'serving');
    assert.deepEqual(result.refs, [{ kind: 'merchant', ownerId: 'protocol-index-owner', id: 'protocol-one', merchantId: 'protocol-one' }]);
    assert.deepEqual(result.count, { kind: 'lower_bound', value: 1 }); assert.equal(result.requiresSourceValidation, true);
    assert.deepEqual((await reader.search(first.collection, request, 'serving')).refs, result.refs);
    const item = await reader.search(first.collection, { ...request, query: 'Quartz', mode: 'offering' }, 'serving');
    assert.equal(item.refs[0]!.id, 'protocol-item'); assert.equal(item.refs[0]!.merchantId, 'protocol-one');
    const differentScope = await reader.search(first.collection, { ...request, selectionId: 'airport-transfers' }, 'serving');
    assert.deepEqual(differentScope.refs, []);
    const noRelax = await reader.search(first.collection, { ...request, query: 'Orchid missingtoken' }, 'serving');
    assert.deepEqual(noRelax.count, { kind: 'lower_bound', value: 0 });
  });

  await t.test('F07 actual serving adapter reaches public results only after current provider validation', async () => {
    let currentName = 'Orchid schema control'; let changeAliasDuringHydration = false;
    const provider: ServerDiscoveryProvider = { ownerId: 'protocol-index-owner', configured: true,
      probe: async () => true,
      getAreas: async () => ({ areas: ['protocol-area'] }),
      getMerchant: async () => { throw new Error('Unexpected detail fan-out'); },
      getMerchants: async (_scope, budget) => budget.run(async () => {
        if (changeAliasDuringHydration) await index.http.request('DELETE', `/aliases/${index.http.alias('serving')}`, budget.signal);
        return [normalizeMerchant({ ...sourceControl('protocol-one'), name: currentName }, 'protocol-index-owner', new Date().toISOString())];
      }),
    };
    const server = await buildReadOnlyServer({ release, provider, config: { host: '127.0.0.1', port: 5190 },
      retrieval: new TypesenseServingRetrieval(index, release, () => indexNow) });
    try {
      const request = { contractVersion: '1', requestId: 'protocol-query', discoveryReleaseId: release.releaseId, mode: 'merchant',
        selection: { categoryId: release.nodes.find(node => node.id === indexSelection)!.parentId, subcategoryId: indexSelection },
        query: 'Orchid', filters: [], sort: 'recommended', limit: 24 };
      const response = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
      assert.equal(response.statusCode, 200); const page = parseSchema('EnginePage', response.json());
      assert.deepEqual(page.refs, [{ kind: 'merchant', ownerId: 'protocol-index-owner', id: 'protocol-one', merchantId: 'protocol-one' }]);
      assert.equal(page.versions.indexGeneration, first.collection); assert.equal(page.presentations.merchants[0]!.name, 'Orchid schema control');
      currentName = 'Changed current source label';
      const changed = parseSchema('EnginePage', (await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request })).json());
      assert.deepEqual(changed.count, { kind: 'lower_bound', value: 0 });
      currentName = 'Orchid schema control'; changeAliasDuringHydration = true;
      const restarted = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
      assert.equal(restarted.statusCode, 409); assert.equal(parseSchema('EngineError', restarted.json()).recovery, 'restart_preserving_constraints');
      changeAliasDuringHydration = false;
      // A private preview/evaluation generation is never selected when serving is absent.
      const missing = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request });
      assert.equal(missing.statusCode, 503); assert.equal(parseSchema('EngineError', missing.json()).code, 'CATALOG_UNAVAILABLE');
    } finally { await index.pointAlias('serving', first.collection, AbortSignal.timeout(1000)); await server.app.close(); }
  });

  await t.test('F09 released collection and View all share the actual index/current-provider predicate', async () => {
    const categoryId = release.nodes.find(node => node.id === indexSelection)!.parentId!;
    const active = sealRelease({ ...structuredClone(release), collections: [definition('protocol-query-collection', {
      categoryId, maxItems: 2, predicate: { kind: 'query-matches' } })] });
    const composedCoordinator = new CatalogIndexCoordinator(index, new FileWriterLock(directory), active, () => indexNow);
    await composedCoordinator.build(input(base), 'serving');
    const provider: ServerDiscoveryProvider = { ownerId: 'protocol-index-owner', configured: true, probe: async () => true,
      getAreas: async () => ({ areas: ['protocol-area'] }), getMerchant: async () => { throw new Error('Unexpected detail fan-out'); },
      getMerchants: async (_scope, budget) => budget.run(async () => [
        normalizeMerchant({ ...sourceControl('protocol-one'), name: 'Orchid schema control' }, 'protocol-index-owner', new Date().toISOString()),
        normalizeMerchant({ ...sourceControl('protocol-two'), name: 'Amber schema control' }, 'protocol-index-owner', new Date().toISOString()),
      ]) };
    const server = await buildReadOnlyServer({ release: active, provider, config: { host: '127.0.0.1', port: 5190 },
      retrieval: new TypesenseServingRetrieval(index, active, () => indexNow) });
    try {
      const request = { contractVersion: '1', requestId: 'protocol-collection-proof', discoveryReleaseId: active.releaseId, mode: 'merchant',
        selection: { categoryId, subcategoryId: indexSelection }, query: 'schema control', filters: [], sort: 'recommended', limit: 24 };
      const response = await server.app.inject({ method: 'POST', url: '/api/discovery/collections', payload: { request, definitionIds: ['protocol-query-collection'] } });
      assert.equal(response.statusCode, 200); const collections = parseSchema('CollectionPage', response.json());
      assert.deepEqual(collections.sections[0]!.page.refs.map(ref => ref.id), ['protocol-one', 'protocol-two']);
      const view = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: collections.sections[0]!.viewAllRequest });
      assert.equal(view.statusCode, 200); assert.deepEqual(parseSchema('EnginePage', view.json()).refs, collections.sections[0]!.page.refs);
    } finally { await server.app.close(); await index.pointAlias('serving', first.collection, AbortSignal.timeout(1000)); }
  });

  let current = first;
  await t.test('atomic generation rebuild, update, tombstone and exact delta replay', async () => {
    const updated = projectionControl('protocol-one', 4, 'Cobalt schema control');
    const removed = projectionControl('protocol-two', 5); if (removed.projection.deleted.state === 'known') removed.projection.deleted.value = true;
    const delta: CatalogDelta = { kind: 'delta', source: { ...base.source, snapshotId: 'protocol-snapshot-2', checkpoint: 5 },
      fromSnapshot: 'protocol-snapshot-1', fromCheckpoint: 3, records: [updated, removed] };
    current = await coordinator.build(input(delta), 'serving'); assert.notEqual(current.collection, first.collection);
    assert.equal(current.manifest.tombstoneCount, 1);
    assert.deepEqual((await reader.search(current.collection, { query: '*', selectionId: indexSelection, mode: 'merchant', limit: 24 }, 'serving')).refs,
      [{ kind: 'merchant', ownerId: 'protocol-index-owner', id: 'protocol-one', merchantId: 'protocol-one' }]);
    assert.equal((await reader.search(current.collection, { query: 'Cobalt', selectionId: indexSelection, mode: 'merchant', limit: 24 }, 'serving')).refs[0]!.id, 'protocol-one');
    assert.equal((await coordinator.build(input(delta), 'serving')).collection, current.collection);
    assert.equal((await index.exportDocuments(first.collection, AbortSignal.timeout(1000))).find(row => row.source_id === 'protocol-one')!.label, 'Orchid schema control');
    await assert.rejects(reader.search(first.collection, { query: '*', selectionId: indexSelection, mode: 'merchant', limit: 24 }, 'serving'),
      error => error instanceof IndexingError && error.code === 'INDEX_GENERATION_RESTART_REQUIRED');
    const equivalent: CatalogSnapshot = { kind: 'snapshot', source: delta.source, records: [updated, removed, offering] };
    const copy = await coordinator.build(input(equivalent), 'serving'); assert.notEqual(copy.collection, current.collection);
    const restored = await coordinator.rollback(current.collection, 'serving');
    assert.equal(restored.collection, current.collection);
    assert.equal(await index.readAlias('serving', AbortSignal.timeout(1000)), current.collection);
  });

  await t.test('real HTTP 200 row-level import failure preserves the published generation', async () => {
    const next = snapshotControl([projectionControl('protocol-one', 6, 'Emerald schema control')]); next.source.snapshotId = 'protocol-snapshot-3';
    injectBadImport = true;
    await assert.rejects(coordinator.build(input(next), 'serving'), error => error instanceof IndexingError && error.code === 'PARTIAL_INDEX_IMPORT');
    injectBadImport = false;
    assert.equal(await index.readAlias('serving', AbortSignal.timeout(1000)), current.collection);
    assert.equal((await reader.search(current.collection, { query: 'Cobalt', selectionId: indexSelection, mode: 'merchant', limit: 24 }, 'serving')).refs[0]!.id, 'protocol-one');
  });

  await t.test('freshness, incompatible release and unsafe rollback reject before serving', async () => {
    const stale = new TypesenseCandidateReader(index, release, () => indexNow + 300001);
    await assert.rejects(stale.search(current.collection, { query: '*', selectionId: indexSelection, mode: 'merchant', limit: 24 }, 'serving'), error => error instanceof IndexingError && error.code === 'STALE_SOURCE');
    const expiredFact = new TypesenseCandidateReader(index, release, () => indexNow + 10001);
    await assert.rejects(expiredFact.search(current.collection, { query: '*', selectionId: indexSelection, mode: 'merchant', limit: 24 }, 'serving'), error => error instanceof IndexingError && error.code === 'STALE_SOURCE_FACT');
    const changed = structuredClone(release); changed.nodes[0]!.label = 'New approved release label';
    const incompatible = new TypesenseCandidateReader(index, sealRelease(changed), () => indexNow);
    await assert.rejects(incompatible.search(current.collection, { query: '*', selectionId: indexSelection, mode: 'merchant', limit: 24 }, 'serving'), error => error instanceof IndexingError && error.code === 'INDEX_RELEASE_INCOMPATIBLE');
    await assert.rejects(coordinator.rollback(first.collection, 'serving'), error => error instanceof IndexingError && error.code === 'UNSAFE_SOURCE_ROLLBACK');
    await assert.rejects(index.removeUnpublished(current.collection, AbortSignal.timeout(1000)), error => error instanceof IndexingError && error.code === 'PUBLISHED_GENERATION_DELETE_FORBIDDEN');
    assert.equal(await index.readAlias('serving', AbortSignal.timeout(1000)), current.collection);
  });
});
