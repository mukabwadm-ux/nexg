import type { EngineRequest, Schemas } from '../src/contracts/index.js';
import { sealRelease, type ReleaseArtifact } from '../src/releases/artifact.js';
import type { ExecutableCollectionDefinition, PreparedCollection } from '../engines/collection-composition/src/contracts.js';
import { release } from './helpers.js';
import { merchantRequest } from './readControls.js';

// Isolated release/schema controls only. Never catalog seeds or runtime defaults.
export function definition(id = 'protocol-explore', changes: Partial<ExecutableCollectionDefinition> = {}): ExecutableCollectionDefinition {
  return { id, categoryId: 'beauty-wellness', titleKey: 'discovery.collections.explore', predicateVersion: '1',
    predicate: { kind: 'scoped-explore' }, mode: 'merchant', minDistinct: 2, maxItems: 4, enabled: true, ...changes } as ExecutableCollectionDefinition;
}
export const collectionRelease = (definitions: ExecutableCollectionDefinition[]) => sealRelease({ ...structuredClone(release), collections: definitions });
export const collectionRequest = (artifact: Readonly<ReleaseArtifact>, changes: Partial<EngineRequest> = {}): EngineRequest =>
  ({ ...merchantRequest(), discoveryReleaseId: artifact.releaseId, ...changes });

export function collectionPage(prepared: PreparedCollection, ids: string[]): Schemas['EnginePage'] {
  const request = prepared.readRequest;
  const refs = ids.map(id => ({ kind: 'merchant' as const, ownerId: 'protocol-collection-owner', id, merchantId: id }));
  return { contractVersion: '1', requestId: request.requestId, refs,
    count: { kind: 'lower_bound', value: refs.length }, retrieval: { scope: 'bounded_candidates', windowId: 'protocol-window', candidateCount: refs.length, completion: 'window_exhausted' },
    versions: { discoveryRelease: request.discoveryReleaseId, taxonomy: preparedVersion('taxonomy'), layout: preparedVersion('layout'), mapping: preparedVersion('mapping'), policy: preparedVersion('policy'),
      ranker: 'deterministic-recommendation/v1', sourceSnapshots: [{ ownerId: 'protocol-collection-owner', snapshot: { state: 'unknown', reason: 'not_exposed' } }] },
    applied: { selection: request.selection, filterHash: prepared.expectedFilterHash, sort: request.sort,
      constraints: request.filters.map(value => ({ value, origin: 'explicit_control', strength: 'hard', state: 'supported', reasonCodes: [] })) },
    status: 'underfilled', presentations: { merchants: refs.map(ref => ({ ref, name: 'Protocol merchant', items: [], itemsCount: { kind: 'lower_bound', value: 0 }, itemsCompletion: 'bounded_window' })), offerings: [] } };
}
// Test releases change only definitions, so the concern-specific versions stay fixed.
function preparedVersion(kind: 'taxonomy' | 'layout' | 'mapping' | 'policy'): string {
  return release[`${kind}Revision`];
}
