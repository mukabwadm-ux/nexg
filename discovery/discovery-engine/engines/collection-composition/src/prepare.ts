import { ContractError, type EngineRequest, type Schemas } from '../../../src/contracts/index.js';
import { parseEngineRequest, parseSchema } from '../../../src/contracts/validate.js';
import type { ReleaseArtifact } from '../../../src/releases/artifact.js';
import { canonicalJson } from '../../../src/shared/immutable.js';
import { validateCollectionDefinition } from './definitions.js';
import type { PreparedCollections } from './contracts.js';
import { understandQuery, type QueryRules } from '../../query-understanding/src/index.js';
import { requestFingerprint } from '../../../src/shared/requestFingerprint.js';

export function parseCollectionRequest(value: unknown, release: Readonly<ReleaseArtifact>): Schemas['CollectionRequest'] {
  const collection = parseSchema('CollectionRequest', value);
  parseEngineRequest(collection.request, release);
  if (new Set(collection.definitionIds).size !== collection.definitionIds.length) throw new ContractError('INVALID_REQUEST', ['/definitionIds']);
  if (collection.definitionIds.some(id => !release.collections.some(definition => definition.id === id))) throw new ContractError('INVALID_REQUEST', ['/definitionIds']);
  return collection;
}

function descendant(release: Readonly<ReleaseArtifact>, candidate: string, parent: string): boolean {
  let current: string | undefined = candidate;
  while (current) { if (current === parent) return true; current = release.nodes.find(node => node.id === current)?.parentId; }
  return false;
}

/** Definition controls intersect the guest's request; nothing silently overwrites it. */
export function prepareCollections(value: unknown, release: Readonly<ReleaseArtifact>, queryRules?: QueryRules): PreparedCollections {
  const collection = parseCollectionRequest(value, release); const base = collection.request;
  const result: PreparedCollections = { prepared: [], diagnostics: [] };
  const selected = new Set(collection.definitionIds);
  for (const definition of release.collections.filter(definition => selected.has(definition.id))) {
    const suppress = (reasonCode: string) => result.diagnostics.push({ definitionId: definition.id, reasonCode });
    validateCollectionDefinition(definition, release);
    if (!definition.enabled || !('predicate' in definition)) { suppress('COLLECTION_DISABLED'); continue; }
    if (base.limit < definition.minDistinct) { suppress('COLLECTION_PREVIEW_LIMIT_TOO_SMALL'); continue; }
    if (definition.categoryId !== base.selection.categoryId || definition.mode !== base.mode) { suppress('COLLECTION_CONTEXT_UNSUPPORTED'); continue; }
    if (base.cursor !== undefined || (base.offset ?? 0) > 0) throw new ContractError('CURSOR_RESTART_REQUIRED', ['/request/cursor', '/request/offset']);
    let selection = definition.selection ?? base.selection;
    const leaf = base.selection.optionId ?? base.selection.subcategoryId ?? base.selection.categoryId;
    const target = selection.optionId ?? selection.subcategoryId ?? selection.categoryId;
    if (!leaf || !target) { suppress('COLLECTION_SELECTION_CONFLICT'); continue; }
    if (descendant(release, leaf, target)) selection = base.selection;
    else if (!descendant(release, target, leaf)) { suppress('COLLECTION_SELECTION_CONFLICT'); continue; }
    const filters = [...base.filters];
    for (const filter of definition.filters ?? []) if (!filters.some(existing => canonicalJson(existing) === canonicalJson(filter))) filters.push(structuredClone(filter));
    if (filters.length > 12) { suppress('COLLECTION_CONSTRAINT_LIMIT'); continue; }
    const areas = new Set(filters.flatMap(filter => filter.kind === 'catalog_area' ? [filter.areaId] : []));
    if (areas.size > 1) { suppress('COLLECTION_CONSTRAINT_CONFLICT'); continue; }
    if (definition.predicate.kind === 'query-matches' && !base.query?.trim()) { suppress('COLLECTION_QUERY_REQUIRED'); continue; }
    // Anchor exclusion/comparison is not representable by the current results
    // contract without an approved F10 context executor. Never publish a lie.
    if (['more-from-merchant', 'comparable-alternatives'].includes(definition.predicate.kind)) { suppress('COLLECTION_DESTINATION_UNSUPPORTED'); continue; }
    const viewAllRequest = parseEngineRequest({ ...base, selection, filters }, release);
    const readRequest: EngineRequest = { ...viewAllRequest, limit: 48 };
    const plan = understandQuery(readRequest, release, queryRules ? { rules: queryRules } : {});
    if (plan?.issues.length) { suppress('COLLECTION_QUERY_CONTEXT_UNSUPPORTED'); continue; }
    result.prepared.push({ definition, viewAllRequest, readRequest, expectedFilterHash: requestFingerprint(readRequest, plan?.normalized) });
  }
  return result;
}
