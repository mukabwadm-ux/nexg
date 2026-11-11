import { ContractError, type Schemas } from '../../../src/contracts/index.js';
import { parseSchema } from '../../../src/contracts/validate.js';
import type { ReleaseArtifact } from '../../../src/releases/artifact.js';
import { canonicalJson } from '../../../src/shared/immutable.js';
import { refKey } from '../../recommendation/src/contracts.js';
import type { CollectionCandidate, CollectionDiagnostic, CompositionResult, PreparedCollection } from './contracts.js';
import { validateCollectionDefinition } from './definitions.js';
import { parseEngineRequest } from '../../../src/contracts/validate.js';

/** Verify the port did not broaden predicates or swap source identities. */
export function validateCollectionPage(prepared: PreparedCollection, value: unknown, release: Readonly<ReleaseArtifact>): Schemas['EnginePage'] {
  validateCollectionDefinition(prepared.definition, release);
  const published = release.collections.find(definition => definition.id === prepared.definition.id);
  if (!published || !prepared.definition.enabled || canonicalJson(published) !== canonicalJson(prepared.definition)
    || canonicalJson({ ...prepared.viewAllRequest, limit: 48 }) !== canonicalJson(prepared.readRequest)) throw new ContractError('CONSTRAINT_CONFLICT', ['/collections/definition']);
  parseEngineRequest(prepared.viewAllRequest, release);
  parseEngineRequest(prepared.readRequest, release);
  const page = parseSchema('EnginePage', value); const request = prepared.readRequest;
  if (page.requestId !== request.requestId || page.versions.discoveryRelease !== release.releaseId
    || page.versions.taxonomy !== release.taxonomyRevision || page.versions.layout !== release.layoutRevision
    || page.versions.mapping !== release.mappingRevision || page.versions.policy !== release.policyRevision
    || page.applied.filterHash !== prepared.expectedFilterHash
    || canonicalJson(page.applied.selection) !== canonicalJson(request.selection) || page.applied.sort !== request.sort
    || page.applied.constraints.length !== request.filters.length
    || page.applied.constraints.some((constraint, index) => constraint.state !== 'supported' || constraint.strength !== 'hard'
      || canonicalJson(constraint.value) !== canonicalJson(request.filters[index]))) throw new ContractError('CONSTRAINT_CONFLICT', ['/collections/page']);
  const refs = new Map(page.refs.map(ref => [refKey(ref), ref]));
  if (refs.size !== page.refs.length || page.retrieval.candidateCount < page.refs.length
    || (page.count.kind !== 'unknown' && page.count.value < page.refs.length)
    || page.refs.some(ref => ref.kind !== request.mode || (ref.kind === 'merchant' && ref.id !== ref.merchantId)
    || (request.sourceScope?.merchantId !== undefined && ref.merchantId !== request.sourceScope.merchantId))) throw new ContractError('CONSTRAINT_CONFLICT', ['/collections/refs']);
  const presentations = [...page.presentations.merchants, ...page.presentations.offerings];
  if (page.presentations.merchants.some(row => row.ref.kind !== 'merchant' || row.items.some(item => item.ref.kind !== 'offering'
    || item.ref.ownerId !== row.ref.ownerId || item.ref.merchantId !== row.ref.id))
    || page.presentations.offerings.some(row => row.ref.kind !== 'offering')
    || presentations.length !== refs.size || new Set(presentations.map(row => refKey(row.ref))).size !== refs.size
    || presentations.some(row => { const ref = refs.get(refKey(row.ref)); return !ref || ref.merchantId !== row.ref.merchantId; })) throw new ContractError('CONSTRAINT_CONFLICT', ['/collections/presentations']);
  return page;
}

export function selectCollections(candidates: readonly CollectionCandidate[], initial: readonly CollectionDiagnostic[], release: Readonly<ReleaseArtifact>): CompositionResult {
  if (candidates.length > 8 || new Set(candidates.map(candidate => candidate.prepared.definition.id)).size !== candidates.length) throw new ContractError('INVALID_REQUEST', ['/collections']);
  const diagnostics = [...initial]; const sections: Schemas['CollectionPage']['sections'] = [];
  const retained: Set<string>[] = []; let versions: string | undefined;
  for (const candidate of candidates) {
    const { definition, viewAllRequest } = candidate.prepared;
    const source = validateCollectionPage(candidate.prepared, candidate.page, release);
    const currentVersions = canonicalJson(source.versions);
    if (versions !== undefined && currentVersions !== versions) throw new ContractError('CURSOR_RESTART_REQUIRED', ['/collections/versions']);
    versions = currentVersions;
    const suppress = (reasonCode: string) => diagnostics.push({ definitionId: definition.id, reasonCode });
    if (source.status === 'unmapped') { suppress('COLLECTION_UNMAPPED'); continue; }
    const previewLimit = Math.min(definition.maxItems, viewAllRequest.limit);
    const refs = source.refs.slice(0, previewLimit); const ids = new Set(refs.map(refKey));
    if (ids.size < definition.minDistinct) { suppress('COLLECTION_INSUFFICIENT_SUPPLY'); continue; }
    const duplicate = retained.some(other => {
      const intersection = [...ids].filter(id => other.has(id)).length; const union = ids.size + other.size - intersection;
      return intersection * 10 > union * 7;
    });
    if (duplicate) { suppress('COLLECTION_OVERLAP_SUPPRESSED'); continue; }
    const page = parseSchema('EnginePage', { ...source, refs, status: refs.length < previewLimit ? 'underfilled' : 'ok', pageCursor: undefined, previousCursor: undefined, nextCursor: undefined,
      retrieval: { ...source.retrieval, completion: source.refs.length > refs.length || source.retrieval.completion === 'more_in_window' ? 'unknown' : source.retrieval.completion },
      presentations: { merchants: source.presentations.merchants.filter(row => ids.has(refKey(row.ref))), offerings: source.presentations.offerings.filter(row => ids.has(refKey(row.ref))) } });
    sections.push({ definitionId: definition.id, titleKey: definition.titleKey, page, viewAllRequest: structuredClone(viewAllRequest) }); retained.push(ids);
    if (page.status === 'underfilled') diagnostics.push({ definitionId: definition.id, reasonCode: 'COLLECTION_BOUNDED_UNDERFILL' });
  }
  return { page: parseSchema('CollectionPage', { sections, partial: diagnostics.length > 0,
    reasonCodes: [...new Set(diagnostics.map(diagnostic => diagnostic.reasonCode))].sort() }), diagnostics };
}
