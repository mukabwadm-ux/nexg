import type { ReleaseArtifact } from '../releases/artifact.js';
import { canonicalJson, sha256 } from '../shared/immutable.js';
import { requireIndex, type IndexPurpose, type ProjectionRecord, type SearchDocument, type SourceStamp } from './contracts.js';

export const selectionToken = (id: string): string => sha256(canonicalJson(['selection', id]));
export const documentKey = (ownerId: string, kind: string, id: string): string => sha256(canonicalJson([ownerId, kind, id]));
export const documentsDigest = (rows: readonly SearchDocument[]): string => sha256(canonicalJson([...rows].sort((a, b) => a.id.localeCompare(b.id))));

function semanticContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticContent);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'observedAt').map(([key, child]) => [key, semanticContent(child)]));
}

export function validateSourceStamp(source: SourceStamp, purpose: IndexPurpose, now: number): void {
  const asOf = Date.parse(source.asOf);
  requireIndex(asOf <= now && now - asOf <= 300000, 'STALE_SOURCE');
  if (purpose !== 'preview') requireIndex(source.complete && source.snapshotId !== null && source.checkpoint !== null && source.deletions === 'included', 'SOURCE_NOT_VERSIONED');
  else requireIndex(!source.complete && source.snapshotId === null && source.checkpoint === null && source.deletions === 'unknown', 'INVALID_PREVIEW_SOURCE');
}

/** Project only text/identity/classification. Workflow and money never become index authority. */
export function projectRecord(row: ProjectionRecord, source: SourceStamp, release: Readonly<ReleaseArtifact>, purpose: IndexPurpose): SearchDocument {
  const record = row.projection;
  requireIndex(record.ownerId === source.ownerId, 'OWNER_MISMATCH');
  requireIndex(record.entityKind !== 'merchant' || record.merchantId === record.id, 'MERCHANT_ID_MISMATCH');
  requireIndex(Date.parse(record.observedAt) <= Date.parse(source.asOf), 'FUTURE_SOURCE_FACT');
  const revision = record.sourceRevision.state === 'known' ? record.sourceRevision.value : '';
  let validUntil = Number.MAX_SAFE_INTEGER;
  for (const fact of [record.sourceRevision, record.classification, record.provenance, record.deleted]) {
    if (fact.state !== 'known') continue;
    requireIndex(fact.evidence.source.ownerId === record.ownerId && fact.evidence.source.id === record.id, 'FACT_IDENTITY_MISMATCH');
    requireIndex(!fact.evidence.source.revision || fact.evidence.source.revision === revision, 'FACT_REVISION_MISMATCH');
    requireIndex(Date.parse(fact.evidence.observedAt) <= Date.parse(record.observedAt)
      && (!fact.evidence.validUntil || Date.parse(fact.evidence.validUntil) > Date.parse(source.asOf)), 'STALE_SOURCE_FACT');
    if (fact.evidence.validUntil) validUntil = Math.min(validUntil, Date.parse(fact.evidence.validUntil));
  }
  const deleted = record.deleted.state === 'known' && record.deleted.value;
  const provenance = record.provenance.state === 'known' ? record.provenance.value : 'unknown';
  if (purpose !== 'preview') {
    requireIndex(row.sequence !== null && row.sequence <= source.checkpoint! && revision && record.deleted.state === 'known', 'UNVERSIONED_RECORD');
    requireIndex(deleted || (record.classification.state === 'known' && provenance !== 'unknown'), 'UNVERIFIED_RECORD');
    requireIndex(purpose !== 'serving' || deleted || provenance === 'confirmed', 'DEMO_NOT_SERVABLE');
  } else requireIndex(record.entityKind === 'merchant' && row.sequence === null && !revision, 'INVALID_PREVIEW_RECORD');
  const groups = record.classification.state === 'known' ? record.classification.value.sourceSubcategoryRefs : [];
  requireIndex(groups.every(ref => ref.ownerId === record.ownerId), 'CLASSIFICATION_OWNER_MISMATCH');
  const groupIds = new Set(groups.map(ref => ref.id));
  // Release mapping is context, never a category-to-workflow dispatcher.
  const mapped = release.nodes.filter(node => node.kind !== 'category' && release.mappings.find(mapping => mapping.nodeId === node.id)!
    .sourceSubcategoryIds.some(id => groupIds.has(id)));
  const contextIds = new Set(mapped.flatMap(node => [node.id, ...(node.parentId ? [node.parentId] : [])]));
  for (const node of mapped) if (node.kind === 'option') {
    const parent = release.nodes.find(candidate => candidate.id === node.parentId)!;
    if (parent.parentId) contextIds.add(parent.parentId);
  }
  const id = documentKey(record.ownerId, record.entityKind, record.id);
  return { id, stable_key: id, owner_id: record.ownerId, entity_kind: record.entityKind, source_id: record.id, merchant_id: record.merchantId,
    label: deleted ? '' : record.label, context_labels: deleted ? [] : release.nodes.filter(node => contextIds.has(node.id)).map(node => node.label),
    selection_tokens: deleted ? [] : [...contextIds].sort().map(selectionToken), provenance, deleted, sequence: row.sequence ?? -1,
    source_revision: revision, content_hash: sha256(canonicalJson(semanticContent(record))), release_id: release.releaseId, mapping_revision: release.mappingRevision,
    fact_valid_until: deleted ? Number.MAX_SAFE_INTEGER : validUntil };
}
