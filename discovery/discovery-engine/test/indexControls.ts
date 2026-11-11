import type { CatalogProjection } from '../src/contracts/ownerProjection.js';
import type { CatalogSnapshot, ProjectionRecord } from '../src/indexing/contracts.js';
import { release } from './helpers.js';

// Isolated schema/protocol controls only. Never imported by runtime/provider code.
export const indexNow = Date.parse('2026-10-19T10:00:00Z');
export const indexGroup = release.mappings.find(mapping => mapping.nodeId === 'beauty-wellness:massage-spa')?.sourceSubcategoryIds[0]
  ?? release.mappings.find(mapping => mapping.sourceSubcategoryIds.length === 1)!.sourceSubcategoryIds[0]!;
export const indexSelection = release.mappings.find(mapping => mapping.sourceSubcategoryIds.includes(indexGroup)
  && release.nodes.find(node => node.id === mapping.nodeId)?.kind === 'subcategory')!.nodeId;
export function projectionControl(id = 'protocol-index-ref', sequence = 1, label = 'Orchid schema control', asOf = new Date(indexNow).toISOString()): ProjectionRecord {
  const ownerId = 'protocol-index-owner'; const revision = `control-revision-${sequence}`;
  const evidence = { source: { ownerId, id, revision }, observedAt: asOf };
  const known = <T>(value: T) => ({ state: 'known' as const, value, evidence });
  const unknown = { state: 'unknown' as const, reason: 'not_exposed' as const };
  const projection: CatalogProjection = { entityKind: 'merchant', ownerId, id, merchantId: id, label, observedAt: asOf,
    sourceRevision: known(revision), provenance: known('confirmed'), deleted: known(false), listedPrice: unknown, workflowPaths: unknown,
    classification: known({ sourceCategoryRefs: [], sourceSubcategoryRefs: [{ ownerId, id: indexGroup }], evidenceRef: { ownerId, id } }) };
  return { projection, sequence };
}
export function snapshotControl(records = [projectionControl()], asOf = new Date(indexNow).toISOString()): CatalogSnapshot {
  return { kind: 'snapshot', source: { ownerId: 'protocol-index-owner', scopeId: 'protocol-index-scope', snapshotId: 'protocol-snapshot-1',
    checkpoint: Math.max(0, ...records.map(row => row.sequence!)), asOf, complete: true, deletions: 'included' }, records };
}
