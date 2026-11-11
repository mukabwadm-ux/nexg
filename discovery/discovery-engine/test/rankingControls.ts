import type { Fact, EngineRequest } from '../src/contracts/index.js';
import type { RankingCandidate, RankingInput, SourceSortOrder } from '../engines/recommendation/src/index.js';
import { requestBinding } from '../engines/catalog-eligibility/src/index.js';
import { merchantRequest } from './readControls.js';
import { release } from './helpers.js';

// Isolated policy/feature controls only. No real businesses, seeds or runtime supply.
export const checkedAt = '2026-10-19T10:00:00Z';
export function known<T>(value: T, id: string): Fact<T> {
  return { state: 'known', value, evidence: { source: { ownerId: 'protocol-rank-owner', id, revision: 'protocol-revision' },
    observedAt: checkedAt, validUntil: '2026-10-19T10:01:00Z' } };
}
export function rankInput(offering = false): RankingInput {
  return { release, request: { ...merchantRequest(), ...(offering ? { mode: 'offering' as const } : {}) }, checkedAt, candidates: [] };
}
export function rankCandidate(id: string, request: EngineRequest, merchantId = id, rank = 1): RankingCandidate {
  const offering = request.mode === 'offering';
  return { source: { ref: { kind: request.mode, ownerId: 'protocol-rank-owner', id, merchantId },
    sourceRevision: 'protocol-revision', requestBinding: requestBinding(request), current: known(true, id), callerAccess: known(true, id), discoveryScope: known(true, id),
    catalogArea: known('east', id), workflow: offering ? known({ kind: 'PURCHASE', version: '1', ref: { ownerId: 'protocol-rank-owner', id: 'protocol-workflow', revision: 'protocol-workflow-revision' },
      supportedFilters: ['required_attributes', 'listed_price', 'comparable_total'], modules: [], layers: [] }, id) : { state: 'unknown', reason: 'not_exposed' } },
    relevance: { exactIdentity: false, band: 'name', retrievalRank: rank },
    ...(offering ? { diversityGroup: known('protocol-comparable-product', id) } : {}) };
}
export function sortProof(input: RankingInput, candidates: readonly RankingCandidate[]): SourceSortOrder {
  return { sort: 'rating', requestBinding: requestBinding(input.request), ownerId: 'protocol-rank-owner', scopeId: 'protocol-scope',
    snapshotId: 'protocol-snapshot', scope: 'complete_request_scope', comparisonKey: 'protocol-verified-rating', refs: candidates.map(row => row.source.ref),
    evidence: { source: { ownerId: 'protocol-rank-owner', id: 'protocol-scope', revision: 'protocol-snapshot' }, observedAt: checkedAt } };
}
