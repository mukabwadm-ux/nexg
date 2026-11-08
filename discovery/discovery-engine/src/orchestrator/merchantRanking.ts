import type { EngineRequest, Fact } from '../contracts/index.js';
import type { ObservedMerchant } from '../providers/DiscoveryProvider.js';
import type { ReleaseArtifact } from '../releases/artifact.js';
import type { ReadBudget } from './readBudget.js';
import { rankRecommendations, type RankingCandidate } from '../../engines/recommendation/src/index.js';
import { requestBinding, resolveWorkflowPolicy } from '../../engines/catalog-eligibility/src/index.js';
import type { LexicalMatch } from '../../engines/search-retrieval/src/lexical.js';

function currentFacts(row: ObservedMerchant, binding: string): RankingCandidate['source'] {
  const known = <T>(value: T): Fact<T> => ({ state: 'known', value, evidence: row.evidence });
  return { ref: row.presentation.ref, requestBinding: binding, current: known(true), callerAccess: known(true), discoveryScope: known(true),
    workflow: { state: 'unknown', reason: 'not_exposed' }, ...(row.presentation.area ? { catalogArea: known(row.presentation.area) } : {}) };
}

/** Subsequent session pages run current policy only; the initial order is pinned. */
export function revalidateMerchants(request: EngineRequest, rows: readonly ObservedMerchant[], release: Readonly<ReleaseArtifact>, budget: ReadBudget): ObservedMerchant[] {
  const binding = requestBinding(request); const checkedAt = new Date().toISOString();
  return rows.filter(row => {
    budget.assertOpen();
    const policy = resolveWorkflowPolicy({ release, request, checkedAt, source: currentFacts(row, binding) });
    return policy.decisions.canBrowse.state === 'pass' && policy.decisions.matchesHardRequest.state === 'pass';
  });
}

/** Only current provider observations and F07 lexical features enter P0 ranking.
 * Legacy rating/featured/commerce defaults and preview item text are not features.
 */
export function rankMerchants(request: EngineRequest, rows: readonly ObservedMerchant[],
  matches: readonly ({ row: ObservedMerchant } & LexicalMatch)[], release: Readonly<ReleaseArtifact>, budget: ReadBudget) {
  budget.assertOpen();
  const features = new Map(matches.map(match => [match.row.presentation.ref.id, match]));
  const binding = requestBinding(request);
  const candidates: RankingCandidate[] = rows.map(row => {
    const match = features.get(row.presentation.ref.id);
    return { source: currentFacts(row, binding),
      relevance: { exactIdentity: match?.tier === 0, band: match && match.tier < 2 ? 'name' : 'context',
        retrievalRank: match ? 1 + matches.filter(other => other.tier === match.tier && other.nameMatches > match.nameMatches).length : 1 } };
  });
  const ranked = rankRecommendations({ release, request, checkedAt: new Date().toISOString(), candidates });
  const presentations = new Map(rows.map(row => [row.presentation.ref.id, row]));
  budget.assertOpen();
  return { rows: ranked.items.map(item => presentations.get(item.ref.id)!), rankerRevision: ranked.rankerRevision };
}
