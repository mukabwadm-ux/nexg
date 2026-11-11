import { canonicalJson, sha256 } from '../shared/immutable.js';
import type { ReleaseArtifact } from '../releases/artifact.js';
import { parseIndexInput, requireIndex, type GenerationManifest, type IndexGeneration, type IndexPurpose, type SearchDocument } from './contracts.js';
import { documentsDigest, projectRecord, validateSourceStamp } from './projection.js';
import type { CatalogIndexSource, IndexAdminPort, WriterLock } from './ports.js';

/** Immutable generations ensure partial imports never alter a published index. */
export class CatalogIndexCoordinator {
  constructor(private readonly index: IndexAdminPort, private readonly lock: WriterLock,
    private readonly release: Readonly<ReleaseArtifact>, private readonly now: () => number = Date.now) {}

  async #verify(generation: IndexGeneration, signal: AbortSignal): Promise<SearchDocument[]> {
    const rows = await this.index.exportDocuments(generation.collection, signal);
    requireIndex(rows.length === generation.count && rows.length === generation.manifest.count
      && new Set(rows.map(row => row.id)).size === rows.length && documentsDigest(rows) === generation.manifest.documentsDigest
      && rows.filter(row => row.deleted).length === generation.manifest.tombstoneCount, 'CORRUPT_GENERATION');
    return rows;
  }
  #compatible(manifest: GenerationManifest): void {
    requireIndex(manifest.releaseId === this.release.releaseId && manifest.mappingRevision === this.release.mappingRevision
      && manifest.policyRevision === this.release.policyRevision, 'INDEX_RELEASE_INCOMPATIBLE');
  }
  async build(source: CatalogIndexSource, purpose: IndexPurpose): Promise<IndexGeneration> {
    return this.lock.run(async () => {
      const signal = AbortSignal.timeout(60000);
      const input = parseIndexInput(await source.read(signal));
      validateSourceStamp(input.source, purpose, this.now());
      requireIndex(purpose !== 'preview' || input.kind === 'snapshot', 'PREVIEW_DELTA_FORBIDDEN');
      const previousCollection = purpose === 'preview' ? null : await this.index.readAlias(purpose, signal);
      const previous = previousCollection ? await this.index.inspect(previousCollection, signal) : null;
      if (previous) {
        requireIndex(previous.manifest.purpose === purpose && previous.manifest.source.ownerId === input.source.ownerId
          && previous.manifest.source.scopeId === input.source.scopeId, 'INDEX_SCOPE_MISMATCH');
      }
      const inputDigest = sha256(canonicalJson(input));
      if (previous?.manifest.inputDigest === inputDigest && previous.manifest.releaseId === this.release.releaseId) {
        this.#compatible(previous.manifest); requireIndex(Date.parse(previous.manifest.expiresAt) > this.now(), 'STALE_SOURCE_FACT');
        await this.#verify(previous, signal); return previous;
      }
      let rows: SearchDocument[];
      const projected = input.records.map(row => projectRecord(row, input.source, this.release, purpose));
      if (input.kind === 'delta') {
        requireIndex(previous && previous.manifest.source.snapshotId === input.fromSnapshot
          && previous.manifest.source.checkpoint === input.fromCheckpoint, 'DELTA_CHECKPOINT_MISMATCH');
        this.#compatible(previous.manifest);
        requireIndex(Date.parse(input.source.asOf) >= Date.parse(previous.manifest.source.asOf), 'STALE_SNAPSHOT');
        requireIndex(input.source.checkpoint === input.fromCheckpoint + projected.length && input.source.snapshotId !== input.fromSnapshot, 'DELTA_NOT_CONTIGUOUS');
        const state = new Map((await this.#verify(previous, signal)).map(row => [row.id, row]));
        for (const [offset, row] of projected.entries()) {
          requireIndex(row.sequence === input.fromCheckpoint + offset + 1, 'DELTA_NOT_CONTIGUOUS');
          const old = state.get(row.id);
          requireIndex(!old || (row.sequence > old.sequence && (row.source_revision !== old.source_revision || row.content_hash === old.content_hash)), 'REVISION_CONFLICT');
          state.set(row.id, row);
        }
        rows = [...state.values()];
      } else {
        rows = projected;
        requireIndex(new Set(rows.map(row => row.id)).size === rows.length, 'DUPLICATE_SOURCE_ID');
        if (previous) {
          requireIndex(input.source.checkpoint! >= previous.manifest.source.checkpoint!
            && Date.parse(input.source.asOf) >= Date.parse(previous.manifest.source.asOf), 'STALE_SNAPSHOT');
          const old = new Map((await this.#verify(previous, signal)).map(row => [row.id, row]));
          if (input.source.checkpoint === previous.manifest.source.checkpoint) requireIndex(old.size === rows.length
            && rows.every(row => old.get(row.id)?.content_hash === row.content_hash && old.get(row.id)?.sequence === row.sequence), 'REVISION_CONFLICT');
          for (const row of rows) {
            const prior = old.get(row.id);
            requireIndex(!prior || (row.sequence >= prior.sequence && (row.sequence !== prior.sequence || row.content_hash === prior.content_hash)
              && (row.source_revision !== prior.source_revision || row.content_hash === prior.content_hash)), 'REVISION_CONFLICT');
          }
        }
      }
      requireIndex(rows.length <= 10000 && Buffer.byteLength(canonicalJson(rows)) <= 32 * 1024 * 1024, 'GENERATION_TOO_LARGE');
      const manifest: GenerationManifest = { schemaVersion: '1', projectionVersion: 'catalog-text/v1', releaseId: this.release.releaseId,
        mappingRevision: this.release.mappingRevision, policyRevision: this.release.policyRevision, purpose, source: input.source, inputDigest,
        expiresAt: new Date(Math.min(Date.parse(input.source.asOf) + 300000, ...rows.map(row => row.fact_valid_until))).toISOString(),
        documentsDigest: documentsDigest(rows), count: rows.length, tombstoneCount: rows.filter(row => row.deleted).length };
      requireIndex(Date.parse(manifest.expiresAt) > this.now(), 'STALE_SOURCE_FACT');
      const collection = await this.index.create(manifest, signal);
      await this.index.importDocuments(collection, rows, signal);
      const generation = await this.index.inspect(collection, signal);
      requireIndex(canonicalJson(generation.manifest) === canonicalJson(manifest), 'GENERATION_MANIFEST_MISMATCH');
      await this.#verify(generation, signal);
      validateSourceStamp(input.source, purpose, this.now());
      requireIndex(Date.parse(manifest.expiresAt) > this.now(), 'STALE_SOURCE_FACT');
      if (purpose !== 'preview') {
        requireIndex(await this.index.readAlias(purpose, signal) === previousCollection, 'INDEX_WRITER_CONFLICT');
        await this.index.pointAlias(purpose, collection, signal);
      }
      return generation;
    });
  }

  async rollback(collection: string, purpose: 'serving' | 'evaluation'): Promise<IndexGeneration> {
    return this.lock.run(async () => {
      const signal = AbortSignal.timeout(60000);
      const currentCollection = await this.index.readAlias(purpose, signal);
      requireIndex(currentCollection, 'NO_ACTIVE_GENERATION');
      const current = await this.index.inspect(currentCollection, signal);
      const target = await this.index.inspect(collection, signal);
      this.#compatible(target.manifest); validateSourceStamp(target.manifest.source, purpose, this.now());
      requireIndex(Date.parse(target.manifest.expiresAt) > this.now(), 'STALE_SOURCE_FACT');
      requireIndex(target.manifest.purpose === purpose && target.manifest.source.ownerId === current.manifest.source.ownerId
        && target.manifest.source.scopeId === current.manifest.source.scopeId && target.manifest.source.snapshotId === current.manifest.source.snapshotId
        && target.manifest.source.checkpoint === current.manifest.source.checkpoint && target.manifest.documentsDigest === current.manifest.documentsDigest, 'UNSAFE_SOURCE_ROLLBACK');
      await this.#verify(target, signal);
      requireIndex(await this.index.readAlias(purpose, signal) === currentCollection, 'INDEX_WRITER_CONFLICT');
      await this.index.pointAlias(purpose, collection, signal); return target;
    });
  }
}
