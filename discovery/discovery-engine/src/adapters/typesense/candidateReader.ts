import type { ReleaseArtifact } from '../../releases/artifact.js';
import { requireIndex, parseSearchDocument, type IndexPurpose } from '../../indexing/contracts.js';
import { selectionToken, validateSourceStamp } from '../../indexing/projection.js';
import { jsonObject } from './transport.js';
import type { TypesenseIndexAdapter } from './indexAdapter.js';

export interface CatalogLookup { query: string; selectionId: string; mode: 'merchant' | 'offering'; limit: number }

/** Internal candidate lookup only. F07/F08 must still validate and rank source refs. */
export class TypesenseCandidateReader {
  constructor(private readonly index: TypesenseIndexAdapter, private readonly release: Readonly<ReleaseArtifact>, private readonly now: () => number = Date.now) {}
  async search(collection: string, request: CatalogLookup, purpose: IndexPurpose, signal = AbortSignal.timeout(1000)) {
    requireIndex(typeof request.query === 'string' && request.query.length > 0 && request.query.length <= 512 && !/[\u0000-\u001f]/.test(request.query)
      && this.release.nodes.some(node => node.id === request.selectionId) && ['merchant', 'offering'].includes(request.mode)
      && Number.isSafeInteger(request.limit) && request.limit > 0 && request.limit <= 200, 'INVALID_INDEX_LOOKUP');
    const generation = await this.index.inspect(collection, signal);
    const manifest = generation.manifest;
    requireIndex(manifest.releaseId === this.release.releaseId && manifest.mappingRevision === this.release.mappingRevision
      && manifest.policyRevision === this.release.policyRevision && manifest.purpose === purpose && generation.count === manifest.count, 'INDEX_RELEASE_INCOMPATIBLE');
    validateSourceStamp(manifest.source, purpose, this.now());
    requireIndex(Date.parse(manifest.expiresAt) > this.now(), 'STALE_SOURCE_FACT');
    if (purpose !== 'preview') requireIndex(await this.index.readAlias(purpose, signal) === collection, 'INDEX_GENERATION_RESTART_REQUIRED');
    const params = new URLSearchParams({ q: request.query, query_by: 'label,context_labels',
      filter_by: `deleted:=false && entity_kind:=${request.mode} && selection_tokens:=${selectionToken(request.selectionId)}`,
      per_page: String(request.limit), page: '1', sort_by: '_text_match:desc,stable_key:asc', prefix: 'false', num_typos: '0',
      query_by_weights: '5,3', drop_tokens_threshold: '0', split_join_tokens: 'off',
      enable_typos_for_numerical_tokens: 'false', enable_typos_for_alpha_numerical_tokens: 'false',
      include_fields: 'id,stable_key,entity_kind,owner_id,source_id,merchant_id,label,context_labels,selection_tokens,provenance,deleted,sequence,source_revision,content_hash,release_id,mapping_revision,fact_valid_until' });
    const result = jsonObject(await this.index.http.request('GET', `/collections/${this.index.http.collection(collection)}/documents/search?${params}`, signal));
    requireIndex(result.search_cutoff !== true && Array.isArray(result.hits) && result.hits.length <= request.limit, 'INVALID_SEARCH_RESPONSE');
    const documents = result.hits.map(hit => parseSearchDocument((hit as { document?: unknown }).document));
    for (const row of documents) requireIndex(!row.deleted && row.entity_kind === request.mode && row.selection_tokens.includes(selectionToken(request.selectionId))
      && row.owner_id === manifest.source.ownerId && row.release_id === this.release.releaseId && row.mapping_revision === this.release.mappingRevision
      && (purpose !== 'serving' || row.provenance === 'confirmed'), 'SEARCH_SCOPE_MISMATCH');
    requireIndex(new Set(documents.map(row => row.id)).size === documents.length, 'DUPLICATE_SEARCH_RESULT');
    if (purpose !== 'preview') requireIndex(await this.index.readAlias(purpose, signal) === collection, 'INDEX_GENERATION_RESTART_REQUIRED');
    requireIndex(Date.parse(manifest.expiresAt) > this.now(), 'STALE_SOURCE_FACT');
    return { refs: documents.map(row => ({ kind: row.entity_kind, ownerId: row.owner_id, id: row.source_id, merchantId: row.merchant_id })),
      count: { kind: 'lower_bound' as const, value: documents.length }, indexGeneration: collection, sourceSnapshot: manifest.source.snapshotId,
      requiresSourceValidation: true as const, purpose };
  }
}
