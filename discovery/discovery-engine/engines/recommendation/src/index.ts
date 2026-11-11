import { ContractError } from '../../../src/contracts/index.js';
import { assertSchema, parseEngineRequest } from '../../../src/contracts/validate.js';
import { canonicalJson } from '../../../src/shared/immutable.js';
import { resolveWorkflowPolicy, requestBinding } from '../../catalog-eligibility/src/index.js';
import { compareRef, rankerRevision, refKey, type RankingInput, type RankingResult, type RankedRow, type RankingCandidate } from './contracts.js';
import { featureValue, preferenceFit, validEvidence, validatePreferences } from './features.js';
import { diversify } from './diversify.js';

export * from './contracts.js';

const bandOrder = { name: 0, context: 1, partial: 2 } as const;
const tier = (candidate: RankingCandidate): number => (candidate.relevance.exactIdentity ? 0 : 3) + bandOrder[candidate.relevance.band];
function validateCandidate(candidate: RankingCandidate): void {
  assertSchema('EngineRef', candidate.source.ref);
  if (Object.keys(candidate).some(key => !['source', 'relevance', 'diversityGroup', 'quality'].includes(key))
    || Object.keys(candidate.relevance).some(key => !['exactIdentity', 'band', 'retrievalRank'].includes(key))
    || typeof candidate.relevance.exactIdentity !== 'boolean' || !Object.hasOwn(bandOrder, candidate.relevance.band)
    || !Number.isSafeInteger(candidate.relevance.retrievalRank) || candidate.relevance.retrievalRank < 1 || candidate.relevance.retrievalRank > 200
    || (candidate.quality && (!candidate.quality.metricId || candidate.quality.metricId.length > 100))) throw new ContractError('INVALID_REQUEST', ['/ranking/candidates']);
}

function explicitOrder(input: RankingInput, rows: RankedRow[]): RankingResult {
  const order = input.explicitOrder;
  if (!order) throw new ContractError('UNSUPPORTED_CAPABILITY', ['/sort']);
  if (order.sort !== input.request.sort || order.requestBinding !== requestBinding(input.request)
    || order.scope !== 'complete_request_scope' || !order.scopeId || !order.snapshotId || !order.comparisonKey
    || !validEvidence(order.evidence, order.ownerId, order.scopeId, order.snapshotId, input.checkedAt)
    || !Array.isArray(order.refs) || order.refs.length > 200) throw new ContractError('REQUIRED_FACT_UNKNOWN', ['/sort']);
  order.refs.forEach(ref => assertSchema('EngineRef', ref));
  const positions = new Map(order.refs.map((ref, index) => [refKey(ref), index]));
  if (positions.size !== order.refs.length || order.refs.some(ref => ref.ownerId !== order.ownerId)
    || rows.some(row => row.item.ref.ownerId !== order.ownerId || !positions.has(refKey(row.item.ref))
      || order.refs[positions.get(refKey(row.item.ref))!]!.merchantId !== row.item.ref.merchantId)) throw new ContractError('CONSTRAINT_CONFLICT', ['/sort']);
  rows.sort((a, b) => positions.get(refKey(a.item.ref))! - positions.get(refKey(b.item.ref))!);
  return { rankerRevision, items: rows.map(row => ({ ...row.item, reasonCodes: ['OWNER_EXPLICIT_ORDER'] })), excluded: [],
    diversity: { statuses: ['explicit_sort'], movedCount: 0, windowSize: Math.min(10, rows.length) } };
}

/** Pure bounded V1 ranking. Every candidate passes the existing policy resolver
 * for this exact request before relevance, preference, quality or diversity.
 */
export function rankRecommendations(input: RankingInput): RankingResult {
  const request = parseEngineRequest(input.request, input.release);
  if (!Number.isFinite(Date.parse(input.checkedAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(input.checkedAt)) throw new ContractError('INVALID_REQUEST', ['/ranking/checkedAt']);
  if (!Array.isArray(input.candidates) || input.candidates.length > 200) throw new ContractError('LIMIT_EXCEEDED', ['/ranking/candidates']);
  if (input.intent !== undefined && !['general', 'exact_merchant'].includes(input.intent)) throw new ContractError('INVALID_REQUEST', ['/ranking/intent']);
  if (input.qualityMetricIds && (!Array.isArray(input.qualityMetricIds) || input.qualityMetricIds.length > 8
    || input.qualityMetricIds.some(id => typeof id !== 'string' || !id || id.length > 100))) throw new ContractError('INVALID_REQUEST', ['/ranking/qualityMetrics']);
  const preferences = validatePreferences(input);
  const unique = new Map<string, RankingCandidate>();
  for (const candidate of input.candidates) {
    validateCandidate(candidate); const key = refKey(candidate.source.ref); const prior = unique.get(key);
    if (prior && canonicalJson(prior) !== canonicalJson(candidate)) throw new ContractError('SOURCE_REVISION_CHANGED', ['/ranking/candidates']);
    unique.set(key, candidate);
  }
  const rows: RankedRow[] = []; const excluded: RankingResult['excluded'] = [];
  for (const candidate of unique.values()) {
    const policy = resolveWorkflowPolicy({ release: input.release, request, source: candidate.source, checkedAt: input.checkedAt,
      ...(input.attributeRegistry ? { attributeRegistry: input.attributeRegistry } : {}) });
    const decisions = [policy.decisions.canBrowse, policy.decisions.matchesHardRequest];
    if (decisions.some(decision => decision.state !== 'pass')) {
      excluded.push({ ref: candidate.source.ref, reasonCodes: [...new Set(decisions.flatMap(decision => decision.reasonCodes))].sort() }); continue;
    }
    const key = String(tier(candidate));
    const group = featureValue(candidate.diversityGroup, candidate.source, input.checkedAt);
    const quality = candidate.quality && input.qualityMetricIds?.includes(candidate.quality.metricId)
      ? featureValue(candidate.quality.value, candidate.source, input.checkedAt) : undefined;
    rows.push({ candidate, groupKey: key, item: { ref: structuredClone(candidate.source.ref),
      reasonCodes: [candidate.relevance.exactIdentity ? 'EXACT_REQUEST_MATCH' : request.query ? 'MATCHED_QUERY' : 'SCOPED_EXPLORE'],
      score: { base: 0, combined: 0 } },
      ...(typeof group === 'string' && group && group.length <= 256 && policy.workflow ? { diversityKey: JSON.stringify([policy.workflow.kind, group]) } : {}),
      ...(typeof quality === 'number' && Number.isFinite(quality) && quality >= 0 && quality <= 1 ? { qualityValue: quality } : {}) });
  }
  excluded.sort((a, b) => compareRef(a.ref, b.ref));
  if (request.sort !== 'recommended') return { ...explicitOrder(input, rows), excluded };
  for (const row of rows) {
    const group = rows.filter(other => other.groupKey === row.groupKey);
    // Re-rank within ELIGIBLE tiers. Tied retrieval ranks remain tied.
    const rank = 1 + group.filter(other => other.candidate.relevance.retrievalRank < row.candidate.relevance.retrievalRank).length;
    const base = 1 - (rank - 1) / Math.max(1, group.length - 1);
    const fit = preferences?.preferences.length ? preferenceFit(row.candidate, preferences, input) : undefined;
    row.item.score = { base, ...(fit === undefined ? {} : { preferenceFit: fit }), combined: fit === undefined ? base : 0.90 * base + 0.10 * fit };
    if (fit !== undefined && fit > 0) row.item.reasonCodes.push('MATCHED_EXPLICIT_PREFERENCE');
  }
  // Enable quality only for a whole equal-score tier with the SAME known metric.
  // Pairwise known/unknown comparisons would otherwise make sorting non-transitive.
  for (const row of rows) {
    const peers = rows.filter(other => other.groupKey === row.groupKey && other.item.score.combined === row.item.score.combined);
    row.qualityComparable = peers.length > 1 && peers.every(other => other.qualityValue !== undefined && other.candidate.quality?.metricId === row.candidate.quality?.metricId);
    if (row.qualityComparable) row.item.reasonCodes.push('VERIFIED_QUALITY_TIEBREAK');
  }
  rows.sort((a, b) => tier(a.candidate) - tier(b.candidate) || b.item.score.combined - a.item.score.combined
    || (a.qualityComparable && b.qualityComparable ? b.qualityValue! - a.qualityValue! : 0) || compareRef(a.item.ref, b.item.ref));
  const diversified = diversify(rows, input.intent === 'exact_merchant' || request.sourceScope?.merchantId !== undefined);
  return { rankerRevision, items: diversified.rows.map(row => row.item), excluded, diversity: diversified.diagnostics };
}
