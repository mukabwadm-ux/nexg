import type { EngineRequest } from '../contracts/index.js';
import type { CatalogScope, ObservedMerchant, ServerDiscoveryProvider } from '../providers/DiscoveryProvider.js';
import type { ReleaseArtifact } from '../releases/artifact.js';
import type { ReadBudget } from './readBudget.js';
import type { QueryPlan } from '../../engines/query-understanding/src/index.js';
import type { CandidateWindow, RetrievalCandidatePort } from '../../engines/search-retrieval/src/ports.js';
import { lexicalMatch } from '../../engines/search-retrieval/src/lexical.js';
import { sourceUnavailable } from '../contracts/readErrors.js';

/** Candidate hints intersect a current bounded source read in the SAME scope.
 * The existing owner cannot validate an arbitrary 200-ref pool. Withhold anything
 * outside its 48-merchant observation window instead of assuming index authority.
 */
export async function retrieveMerchants(request: EngineRequest, plan: QueryPlan | undefined, scope: CatalogScope,
  release: Readonly<ReleaseArtifact>, provider: ServerDiscoveryProvider, budget: ReadBudget, retrieval?: RetrievalCandidatePort) {
  let window: CandidateWindow | undefined;
  if (plan && retrieval) {
    const selectionId = request.selection.optionId ?? request.selection.subcategoryId ?? request.selection.categoryId!;
    window = await retrieval.search({ query: plan.normalized, selectionId, mode: 'merchant', limit: 200 }, budget);
    if (!window.indexGeneration || !window.sourceSnapshot || window.refs.length > 200 || window.refs.some(ref => ref.kind !== 'merchant'
      || ref.ownerId !== provider.ownerId || ref.id !== ref.merchantId) || new Set(window.refs.map(ref => ref.id)).size !== window.refs.length) throw sourceUnavailable(false);
    budget.assertOpen();
  }
  const observed = await provider.getMerchants({ ...scope, limit: 48 }, budget);
  const candidates = window ? new Set(window.refs.map(ref => ref.id)) : undefined;
  const rows = candidates ? observed.filter(row => candidates.has(row.presentation.ref.id)) : observed;
  // Only labels on the actual selected branch; never all child labels of a category.
  const contexts = [request.selection.categoryId, request.selection.subcategoryId, request.selection.optionId]
    .flatMap(id => id ? release.nodes.filter(node => node.id === id).map(node => node.label) : []);
  const matched: { row: ObservedMerchant; tier: number; nameMatches: number }[] = [];
  if (plan) for (const row of rows) {
    budget.assertOpen();
    const match = lexicalMatch(plan, row.presentation.name, contexts);
    if (match) matched.push({ row, ...match });
  }
  budget.assertOpen();
  return { rows: plan ? matched.map(item => item.row) : rows, matches: matched, candidateCount: rows.length,
    ...(window ? { window } : {}) };
}
