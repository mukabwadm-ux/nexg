import type { Decision, EngineRequest } from '../../../src/contracts/index.js';
import { assertSchema } from '../../../src/contracts/validate.js';
import type { ReleaseArtifact } from '../../../src/releases/artifact.js';
import { canonicalJson } from '../../../src/shared/immutable.js';
import { resolveWorkflowPolicy, requestBinding } from '../../catalog-eligibility/src/index.js';
import { featureValue } from '../../recommendation/src/features.js';
import type { RankingCandidate } from '../../recommendation/src/contracts.js';
import { refKey } from '../../recommendation/src/contracts.js';
import type { ExecutableCollectionDefinition } from './contracts.js';
import { validateCollectionDefinition } from './definitions.js';

export interface PredicateInput {
  release: Readonly<ReleaseArtifact>; request: EngineRequest; checkedAt: string;
  definition: ExecutableCollectionDefinition; candidate: RankingCandidate; anchor?: RankingCandidate;
  attributeRegistry?: Readonly<Record<string, readonly string[]>>;
}
const decision = (state: Decision['state'], reason: string): Decision => ({ state, reasonCodes: [reason], evidence: [] });

/** Pure fact evaluator for all five planned families. Complex families still
 * need an exact destination executor before section publication.
 */
export function evaluateCollectionPredicate(input: PredicateInput): Decision {
  const { candidate, request, definition, checkedAt } = input;
  validateCollectionDefinition(definition, input.release);
  if (!definition.enabled) return decision('unsupported', 'COLLECTION_DISABLED');
  const released = input.release.collections.find(value => value.id === definition.id);
  if (!released || canonicalJson(released) !== canonicalJson(definition)) return decision('unsupported', 'COLLECTION_DEFINITION_NOT_RELEASED');
  if (definition.selection) {
    const required = definition.selection.optionId ?? definition.selection.subcategoryId ?? definition.selection.categoryId;
    let current = request.selection.optionId ?? request.selection.subcategoryId ?? request.selection.categoryId;
    while (current && current !== required) current = input.release.nodes.find(node => node.id === current)?.parentId;
    if (!current) return decision('fail', 'COLLECTION_SELECTION_MISMATCH');
  }
  const policy = resolveWorkflowPolicy({ release: input.release, request, source: candidate.source, checkedAt,
    ...(input.attributeRegistry ? { attributeRegistry: input.attributeRegistry } : {}) });
  if (policy.decisions.canBrowse.state !== 'pass') return policy.decisions.canBrowse;
  if (policy.decisions.matchesHardRequest.state !== 'pass') return policy.decisions.matchesHardRequest;
  if (definition.mode !== request.mode || definition.categoryId !== request.selection.categoryId) return decision('fail', 'COLLECTION_CONTEXT_MISMATCH');
  if ((definition.filters ?? []).some(filter => !request.filters.some(applied => canonicalJson(filter) === canonicalJson(applied)))) return decision('fail', 'COLLECTION_FILTER_NOT_APPLIED');
  switch (definition.predicate.kind) {
    case 'scoped-explore': return decision('pass', 'COLLECTION_SCOPE_VERIFIED');
    case 'query-matches': return !request.query?.trim() ? decision('unsupported', 'COLLECTION_QUERY_REQUIRED')
      : candidate.relevance.band === 'partial' ? decision('fail', 'COLLECTION_QUERY_INCOMPLETE') : decision('pass', 'COLLECTION_QUERY_MATCHED');
    case 'requested-task-fit': return definition.filters?.length ? decision('pass', 'COLLECTION_TASK_FILTERS_VERIFIED') : decision('unsupported', 'COLLECTION_TASK_PREDICATE_REQUIRED');
    default: break;
  }
  const anchor = input.anchor; const anchorRef = request.sourceScope?.anchorRef;
  if (!anchor || !anchorRef || refKey(anchor.source.ref) !== refKey(anchorRef) || anchor.source.ref.merchantId !== anchorRef.merchantId
    || anchor.source.requestBinding !== requestBinding(request)) return decision('unknown', 'COLLECTION_ANCHOR_REQUIRED');
  for (const fact of [anchor.source.current, anchor.source.callerAccess, anchor.source.discoveryScope]) {
    if (featureValue(fact, anchor.source, checkedAt) !== true) return decision('unknown', 'COLLECTION_ANCHOR_UNVERIFIED');
  }
  if (refKey(anchor.source.ref) === refKey(candidate.source.ref)) return decision('fail', 'COLLECTION_SEED_EXCLUDED');
  if (definition.predicate.kind === 'more-from-merchant') return candidate.source.ref.ownerId === anchor.source.ref.ownerId
    && candidate.source.ref.merchantId === anchor.source.ref.merchantId ? decision('pass', 'COLLECTION_SAME_MERCHANT') : decision('fail', 'COLLECTION_OTHER_MERCHANT');
  const group = featureValue(candidate.diversityGroup, candidate.source, checkedAt);
  const anchorGroup = featureValue(anchor.diversityGroup, anchor.source, checkedAt);
  const workflow = policy.workflow;
  const anchorPolicy = resolveWorkflowPolicy({ release: input.release, request, source: anchor.source, checkedAt,
    ...(input.attributeRegistry ? { attributeRegistry: input.attributeRegistry } : {}) });
  const anchorWorkflow = anchorPolicy.decisions.canBrowse.state === 'pass' ? anchorPolicy.workflow : undefined;
  if (typeof group !== 'string' || !group || typeof anchorGroup !== 'string' || !workflow || !anchorWorkflow) return decision('unknown', 'COLLECTION_COMPARISON_UNKNOWN');
  if (group !== anchorGroup || workflow.kind !== anchorWorkflow.kind) return decision('fail', 'COLLECTION_NOT_COMPARABLE');
  const priceKind = definition.predicate.priceKind === 'listed_price' ? 'listedPrice' : 'comparableTotal';
  const price = featureValue(candidate.source[priceKind], candidate.source, checkedAt);
  const anchorPrice = featureValue(anchor.source[priceKind], anchor.source, checkedAt);
  if (!price || !anchorPrice || price.complete !== true || anchorPrice.complete !== true || !price.basisId || !anchorPrice.basisId) return decision('unknown', 'COLLECTION_COMPARISON_UNKNOWN');
  try { assertSchema('Money', price.amount); assertSchema('Money', anchorPrice.amount); } catch { return decision('unknown', 'COLLECTION_COMPARISON_UNKNOWN'); }
  return price.basisId === anchorPrice.basisId && price.amount.currency === anchorPrice.amount.currency
    ? decision('pass', 'COLLECTION_COMPARISON_VERIFIED') : decision('fail', 'COLLECTION_NOT_COMPARABLE');
}
