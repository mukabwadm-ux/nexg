import { ContractError, type Fact, type Evidence } from '../../../src/contracts/index.js';
import { assertSchema } from '../../../src/contracts/validate.js';
import type { OfferingFacts } from '../../catalog-eligibility/src/index.js';
import { requestBinding } from '../../catalog-eligibility/src/index.js';
import type { RankingInput, PreferenceContext, RankingCandidate } from './contracts.js';

export function validEvidence(evidence: Evidence, ownerId: string, id: string, revision: string | undefined, checkedAt: string): boolean {
  try { assertSchema('Evidence', evidence); } catch { return false; }
  const observed = Date.parse(evidence.observedAt); const now = Date.parse(checkedAt);
  return evidence.source.ownerId === ownerId && evidence.source.id === id && (revision === undefined || evidence.source.revision === revision)
    && observed <= now && now - observed <= 300000
    && (!evidence.validUntil || Date.parse(evidence.validUntil) > now);
}
/** Unknown, stale, wrong-owner and unbound facts never create a positive feature. */
export function featureValue<T>(fact: Fact<T> | undefined, source: OfferingFacts, checkedAt: string): T | undefined {
  return fact?.state === 'known' && validEvidence(fact.evidence, source.ref.ownerId, source.ref.id, source.sourceRevision, checkedAt) ? fact.value : undefined;
}
export function validatePreferences(input: RankingInput): PreferenceContext | undefined {
  const context = input.preferenceContext;
  if (!context) return undefined;
  if (context.origin !== 'explicit_request' || context.requestBinding !== requestBinding(input.request)) throw new ContractError('CONSTRAINT_CONFLICT', ['/ranking/preferences']);
  if (!Array.isArray(context.preferences) || context.preferences.length > 8) throw new ContractError('LIMIT_EXCEEDED', ['/ranking/preferences']);
  const ids = new Set<string>();
  for (const preference of context.preferences) {
    if (!preference.id || preference.id.length > 100 || ids.has(preference.id) || !Number.isSafeInteger(preference.weight) || preference.weight < 1 || preference.weight > 100) throw new ContractError('INVALID_REQUEST', ['/ranking/preferences']);
    ids.add(preference.id);
    if (preference.kind === 'catalog_area') {
      if (!preference.areaId || preference.areaId.length > 256 || preference.areaId === 'all') throw new ContractError('INVALID_REQUEST', ['/ranking/preferences']);
    } else if (preference.kind === 'attribute') {
      if (!input.attributeRegistry || !Object.hasOwn(input.attributeRegistry, preference.key)
        || !input.attributeRegistry[preference.key]?.includes(preference.valueId)) throw new ContractError('UNSUPPORTED_CAPABILITY', ['/ranking/preferences']);
    } else throw new ContractError('UNSUPPORTED_CAPABILITY', ['/ranking/preferences']);
  }
  return context;
}
export function preferenceFit(candidate: RankingCandidate, context: PreferenceContext, input: RankingInput): number {
  let matched = 0; let total = 0;
  for (const preference of context.preferences) {
    total += preference.weight;
    if (preference.kind === 'catalog_area') {
      if (featureValue(candidate.source.catalogArea, candidate.source, input.checkedAt) === preference.areaId) matched += preference.weight;
    } else {
      const workflow = featureValue(candidate.source.workflow, candidate.source, input.checkedAt);
      const attributes = featureValue(candidate.source.attributes, candidate.source, input.checkedAt);
      if (workflow?.supportedFilters.includes('required_attributes') && attributes && Object.hasOwn(attributes, preference.key)
        && attributes[preference.key] === preference.valueId) matched += preference.weight;
    }
  }
  return total ? matched / total : 0;
}
