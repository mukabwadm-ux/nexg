import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogIndexCoordinator } from '../src/indexing/coordinator.js';
import { IndexingError, parseIndexInput, type GenerationManifest, type SearchDocument, type IndexGeneration, type CatalogDelta, type CatalogSnapshot } from '../src/indexing/contracts.js';
import { projectRecord, selectionToken, validateSourceStamp } from '../src/indexing/projection.js';
import type { IndexAdminPort, WriterLock } from '../src/indexing/ports.js';
import { FileWriterLock } from '../src/indexing/writerLock.js';
import { TypesenseIndexAdapter } from '../src/adapters/typesense/indexAdapter.js';
import { PlatformCatalogPreviewSource } from '../src/adapters/platform/catalogPreviewSource.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { release } from './helpers.js';
import { sealRelease } from '../src/releases/artifact.js';
import { controlFetch } from './readControls.js';
import { indexNow, projectionControl, snapshotControl } from './indexControls.js';

class MemoryIndex implements IndexAdminPort {
  readonly generations = new Map<string, { manifest: GenerationManifest; rows: SearchDocument[] }>();
  readonly aliases = new Map<string, string>(); failImport = false; corruptImport = false;
  async create(manifest: GenerationManifest) { const id = `generation-${this.generations.size + 1}`; this.generations.set(id, { manifest: structuredClone(manifest), rows: [] }); return id; }
  async importDocuments(collection: string, rows: readonly SearchDocument[]) {
    this.generations.get(collection)!.rows = structuredClone([...rows]);
    if (this.failImport) throw new IndexingError('PARTIAL_INDEX_IMPORT');
    if (this.corruptImport) this.generations.get(collection)!.rows[0]!.label = 'corrupted text';
  }
  async inspect(collection: string): Promise<IndexGeneration> {
    const value = this.generations.get(collection)!; return { collection, manifest: structuredClone(value.manifest), count: value.rows.length };
  }
  async exportDocuments(collection: string) { return structuredClone(this.generations.get(collection)!.rows); }
  async readAlias(purpose: 'serving' | 'evaluation') { return this.aliases.get(purpose) ?? null; }
  async pointAlias(purpose: 'serving' | 'evaluation', collection: string) { this.aliases.set(purpose, collection); }
}
const lock: WriterLock = { run: async operation => operation() };
const isCode = (code: string) => (error: unknown) => error instanceof IndexingError && error.code === code;
const source = (input: unknown) => ({ read: async () => parseIndexInput(input) });
function setup() { const index = new MemoryIndex(); return { index, coordinator: new CatalogIndexCoordinator(index, lock, release, () => indexNow) }; }

test('projection preserves exact identity and release context without operational defaults', () => {
  const input = snapshotControl(); const document = projectRecord(input.records[0]!, input.source, release, 'serving');
  assert.equal(document.source_id, 'protocol-index-ref'); assert.equal(document.owner_id, 'protocol-index-owner');
  assert.equal(document.label, 'Orchid schema control'); assert.equal(document.provenance, 'confirmed');
  assert.equal(document.selection_tokens.length > 0, true); assert.equal('listedPrice' in document, false); assert.equal('workflowPaths' in document, false);
  const other = projectionControl(); other.projection.ownerId = 'other-owner'; other.projection.sourceRevision = { state: 'unknown', reason: 'not_exposed' };
  other.projection.classification = { state: 'unknown', reason: 'not_exposed' }; other.projection.provenance = { state: 'unknown', reason: 'not_exposed' }; other.projection.deleted = { state: 'unknown', reason: 'not_exposed' }; other.sequence = null;
  const preview = projectRecord(other, { ...input.source, ownerId: 'other-owner' }, release, 'preview');
  assert.notEqual(document.id, preview.id); assert.equal(preview.source_id, document.source_id);
});

test('owner projection schemas and strict envelopes reject coercion, unknown fields and invalid identity', () => {
  const input = snapshotControl(); assert.equal(parseIndexInput(input).records[0]!.projection.id, 'protocol-index-ref');
  assert.throws(() => parseIndexInput({ ...input, extra: true }), isCode('INVALID_INDEX_INPUT'));
  const coercion = structuredClone(input); (coercion.records[0]!.projection as unknown as { id: number }).id = 7;
  assert.throws(() => parseIndexInput(coercion), /INVALID_CATALOG_PROJECTION/);
  const wrong = projectionControl(); wrong.projection.merchantId = 'wrong-parent';
  assert.throws(() => projectRecord(wrong, input.source, release, 'serving'), isCode('MERCHANT_ID_MISMATCH'));
});

test('projection follows all released category/subcategory mappings while keeping unmapped nodes empty', () => {
  for (const node of release.nodes.filter(node => node.kind !== 'option')) {
    const mappings = node.kind === 'category' ? release.mappings.filter(mapping => release.nodes.some(child => child.id === mapping.nodeId && child.parentId === node.id))
      : release.mappings.filter(mapping => mapping.nodeId === node.id);
    const ids = [...new Set(mappings.flatMap(mapping => mapping.sourceSubcategoryIds))];
    const input = snapshotControl(); const row = input.records[0]!;
    if (row.projection.classification.state === 'known') row.projection.classification.value.sourceSubcategoryRefs = ids.map(id => ({ ownerId: row.projection.ownerId, id }));
    const document = projectRecord(row, input.source, release, 'serving');
    assert.equal(document.selection_tokens.includes(selectionToken(node.id)), ids.length > 0, node.id);
    assert.equal(document.source_id, 'protocol-index-ref');
  }
});

test('new observations of unchanged revisions do not create content conflicts, and shorter evidence expiry limits the generation', async () => {
  let clock = indexNow; const index = new MemoryIndex(); const coordinator = new CatalogIndexCoordinator(index, lock, release, () => clock);
  const input = snapshotControl(); const first = await coordinator.build(source(input), 'serving');
  clock += 100; const observed = snapshotControl([projectionControl('protocol-index-ref', 1, 'Orchid schema control', new Date(clock).toISOString())], new Date(clock).toISOString());
  observed.source.snapshotId = 'observed-again';
  const next = await coordinator.build(source(observed), 'serving');
  assert.equal(next.manifest.documentsDigest, first.manifest.documentsDigest); assert.notEqual(next.collection, first.collection);
  const expiring = snapshotControl([projectionControl('next', 2)]); expiring.source.snapshotId = 'expiring';
  expiring.source.asOf = new Date(clock).toISOString();
  const fact = expiring.records[0]!.projection.classification;
  if (fact.state === 'known') fact.evidence.validUntil = new Date(clock + 1000).toISOString();
  const result = await coordinator.build(source(expiring), 'serving'); assert.equal(result.manifest.expiresAt, new Date(clock + 1000).toISOString());
  clock += 1001; await assert.rejects(coordinator.build(source(expiring), 'serving'), isCode('STALE_SOURCE_FACT'));
});

test('missing provenance, version, classification and deletion guarantees cannot publish', async () => {
  const { coordinator, index } = setup(); const valid = await coordinator.build(source(snapshotControl()), 'serving');
  for (const field of ['sourceRevision', 'classification', 'provenance', 'deleted'] as const) {
    const input = snapshotControl([projectionControl('next', 2)]); input.source.snapshotId = 'next';
    input.records[0]!.projection[field] = { state: 'unknown', reason: 'not_verified' };
    await assert.rejects(coordinator.build(source(input), 'serving'));
    assert.equal(await index.readAlias('serving'), valid.collection);
  }
  const incomplete = snapshotControl(); incomplete.source.complete = false;
  await assert.rejects(coordinator.build(source(incomplete), 'serving'), isCode('SOURCE_NOT_VERSIONED'));
  assert.equal((await index.exportDocuments(valid.collection))[0]!.label, 'Orchid schema control');
});

test('demo data is allowed only in evaluation, and fact identity/revision errors fail closed', async () => {
  const { coordinator } = setup(); const input = snapshotControl();
  if (input.records[0]!.projection.provenance.state === 'known') input.records[0]!.projection.provenance.value = 'demo';
  await assert.rejects(coordinator.build(source(input), 'serving'), isCode('DEMO_NOT_SERVABLE'));
  const evaluation = await coordinator.build(source(input), 'evaluation'); assert.equal(evaluation.manifest.purpose, 'evaluation');
  const wrong = snapshotControl(); const fact = wrong.records[0]!.projection.classification;
  if (fact.state === 'known') fact.evidence.source.id = 'another-entity';
  assert.throws(() => projectRecord(wrong.records[0]!, wrong.source, release, 'serving'), isCode('FACT_IDENTITY_MISMATCH'));
});

test('replayed rebuild is idempotent and a partial or corrupted import preserves the last published generation', async () => {
  const { coordinator, index } = setup(); const input = snapshotControl();
  const first = await coordinator.build(source(input), 'serving');
  assert.equal((await coordinator.build(source(input), 'serving')).collection, first.collection); assert.equal(index.generations.size, 1);
  const next = snapshotControl([projectionControl('next', 2)]); next.source.snapshotId = 'snapshot-2';
  index.failImport = true; await assert.rejects(coordinator.build(source(next), 'serving'), isCode('PARTIAL_INDEX_IMPORT'));
  assert.equal(await index.readAlias('serving'), first.collection);
  index.failImport = false; index.corruptImport = true; await assert.rejects(coordinator.build(source(next), 'serving'), isCode('CORRUPT_GENERATION'));
  assert.equal((await index.exportDocuments(first.collection))[0]!.source_id, 'protocol-index-ref');
  assert.equal(await index.readAlias('serving'), first.collection);
});

test('ordered deltas persist tombstones, reject old resurrection and replay without another generation', async () => {
  const { coordinator, index } = setup(); await coordinator.build(source(snapshotControl()), 'serving');
  const tombstone = projectionControl('protocol-index-ref', 2); if (tombstone.projection.deleted.state === 'known') tombstone.projection.deleted.value = true;
  const delta: CatalogDelta = { kind: 'delta', source: { ...snapshotControl().source, snapshotId: 'snapshot-2', checkpoint: 2 }, fromSnapshot: 'protocol-snapshot-1', fromCheckpoint: 1, records: [tombstone] };
  const next = await coordinator.build(source(delta), 'serving');
  const row = (await index.exportDocuments(next.collection))[0]!;
  assert.equal(row.deleted, true); assert.equal(row.label, ''); assert.deepEqual(row.selection_tokens, []); assert.equal(next.manifest.tombstoneCount, 1);
  assert.equal((await coordinator.build(source(delta), 'serving')).collection, next.collection);
  const stale: CatalogDelta = { ...delta, source: { ...delta.source, snapshotId: 'snapshot-3', checkpoint: 3 }, fromSnapshot: 'snapshot-2', fromCheckpoint: 2,
    records: [projectionControl('protocol-index-ref', 1)] };
  await assert.rejects(coordinator.build(source(stale), 'serving'), isCode('DELTA_NOT_CONTIGUOUS'));
  assert.equal(await index.readAlias('serving'), next.collection);
});

test('delta gaps, wrong snapshot/scope and a reused revision with changed content are rejected', async () => {
  const { coordinator, index } = setup(); const first = await coordinator.build(source(snapshotControl()), 'serving');
  const changed = projectionControl('protocol-index-ref', 2, 'Changed schema control');
  if (changed.projection.sourceRevision.state === 'known') {
    changed.projection.sourceRevision.value = 'control-revision-1';
    for (const fact of [changed.projection.sourceRevision, changed.projection.classification, changed.projection.provenance, changed.projection.deleted]) if (fact.state === 'known') fact.evidence.source.revision = 'control-revision-1';
  }
  const delta: CatalogDelta = { kind: 'delta', source: { ...snapshotControl().source, snapshotId: 'next', checkpoint: 2 }, fromSnapshot: 'protocol-snapshot-1', fromCheckpoint: 1, records: [changed] };
  await assert.rejects(coordinator.build(source(delta), 'serving'), isCode('REVISION_CONFLICT'));
  await assert.rejects(coordinator.build(source({ ...delta, fromSnapshot: 'wrong' }), 'serving'), isCode('DELTA_CHECKPOINT_MISMATCH'));
  await assert.rejects(coordinator.build(source({ ...delta, source: { ...delta.source, checkpoint: 3 } }), 'serving'), isCode('DELTA_NOT_CONTIGUOUS'));
  await assert.rejects(coordinator.build(source({ ...delta, source: { ...delta.source, scopeId: 'wrong' } }), 'serving'), isCode('INDEX_SCOPE_MISMATCH'));
  assert.equal(await index.readAlias('serving'), first.collection);
});

test('freshness rejects expired/future sources and full rebuild supports a new compatible release', async () => {
  const { coordinator, index } = setup(); const input = snapshotControl(); await coordinator.build(source(input), 'serving');
  assert.throws(() => validateSourceStamp({ ...input.source, asOf: new Date(indexNow - 300001).toISOString() }, 'serving', indexNow), isCode('STALE_SOURCE'));
  assert.throws(() => validateSourceStamp({ ...input.source, asOf: new Date(indexNow + 1).toISOString() }, 'serving', indexNow), isCode('STALE_SOURCE'));
  const parts = structuredClone(release); parts.nodes[0]!.label = 'Updated approved label'; const updated = sealRelease(parts);
  const rebuilt = await new CatalogIndexCoordinator(index, lock, updated, () => indexNow).build(source(input), 'serving');
  assert.equal(rebuilt.manifest.releaseId, updated.releaseId); assert.notEqual(rebuilt.manifest.releaseId, release.releaseId);
});

test('rollback may restore an equivalent source checkpoint but never resurrect older source state', async () => {
  let clock = indexNow; const index = new MemoryIndex(); const coordinator = new CatalogIndexCoordinator(index, lock, release, () => clock);
  const first = await coordinator.build(source(snapshotControl()), 'serving'); clock++;
  const equivalent = snapshotControl(); equivalent.source.asOf = new Date(clock).toISOString();
  const second = await coordinator.build(source(equivalent), 'serving'); assert.notEqual(first.collection, second.collection);
  assert.equal((await coordinator.rollback(first.collection, 'serving')).collection, first.collection);
  const next = snapshotControl([projectionControl('protocol-index-ref', 2, 'New current source text')]); next.source.snapshotId = 'new-source'; next.source.asOf = new Date(clock).toISOString();
  const current = await coordinator.build(source(next), 'serving');
  await assert.rejects(coordinator.rollback(first.collection, 'serving'), isCode('UNSAFE_SOURCE_ROLLBACK'));
  assert.equal((await index.exportDocuments(current.collection))[0]!.label, 'New current source text');
});

test('legacy provider capture is bounded merchant context and cannot be promoted to serving', async () => {
  const provider = new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: controlFetch() });
  const previewSource = new PlatformCatalogPreviewSource(provider, release, 'beauty-wellness');
  const input = await previewSource.read(AbortSignal.timeout(1000));
  assert.equal(input.records[0]!.projection.id, 'protocol-control'); assert.equal(input.source.snapshotId, null); assert.equal(input.source.complete, false);
  assert.equal(input.records[0]!.projection.provenance.state, 'unknown'); assert.equal(input.records[0]!.projection.sourceRevision.state, 'unknown');
  const index = new MemoryIndex(); const coordinator = new CatalogIndexCoordinator(index, lock, release);
  const preview = await coordinator.build(source(input), 'preview'); assert.equal(preview.manifest.purpose, 'preview');
  await assert.rejects(coordinator.build(source(input), 'serving'), isCode('SOURCE_NOT_VERSIONED'));
  assert.equal((await index.exportDocuments(preview.collection))[0]!.source_id, 'protocol-control');
});

test('actual filesystem lock excludes a concurrent writer and releases after failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'discovery-index-lock-'));
  try {
    const first = new FileWriterLock(directory); const second = new FileWriterLock(directory);
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    let releaseWriter!: () => void; const wait = new Promise<void>(resolve => { releaseWriter = resolve; });
    const pending = first.run(async () => { entered(); await wait; return 'first finished'; }); await started;
    await assert.rejects(second.run(async () => 'should not enter'), isCode('INDEX_WRITER_BUSY')); releaseWriter();
    assert.equal(await pending, 'first finished');
    await assert.rejects(first.run(async () => { throw new Error('failed job'); }), /failed job/);
    assert.equal(await second.run(async () => 'writer available'), 'writer available');
  } finally { await unlink(join(directory, 'last-writer.json')); await rmdir(directory); }
});

test('HTTP 200 partial imports fail and never leak raw document/secret errors', async () => {
  const input = snapshotControl(); const row = projectRecord(input.records[0]!, input.source, release, 'serving');
  const index = new TypesenseIndexAdapter({ origin: 'http://index.test', apiKey: 'a'.repeat(64),
    fetcher: async () => new Response('{"success":false,"error":"private raw payload"}', { status: 200 }) });
  await assert.rejects(index.importDocuments(`nexg_discovery_g_${'b'.repeat(32)}`, [row], AbortSignal.timeout(1000)), error => {
    assert.equal((error as IndexingError).code, 'PARTIAL_INDEX_IMPORT'); assert.equal(String(error).includes('private raw payload'), false); return true;
  });
});
