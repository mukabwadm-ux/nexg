import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCollections, selectCollections, evaluateCollectionPredicate } from '../engines/collection-composition/src/index.js';
import { ContractError } from '../src/contracts/index.js';
import { sealRelease } from '../src/releases/artifact.js';
import { release } from './helpers.js';
import { definition, collectionRelease, collectionRequest, collectionPage } from './collectionControls.js';
import { known, rankCandidate, checkedAt } from './rankingControls.js';
import { requestBinding } from '../engines/catalog-eligibility/src/index.js';

const code = (value: string) => (error: unknown) => error instanceof ContractError && error.code === value;

test('compatible executable collection releases change only collection identity; baseline stays disabled and unchanged', () => {
  const active = collectionRelease([definition()]);
  assert.notEqual(active.releaseId, release.releaseId); assert.notEqual(active.collectionRevision, release.collectionRevision);
  assert.equal(active.taxonomyRevision, release.taxonomyRevision); assert.equal(active.mappingRevision, release.mappingRevision);
  assert.ok(release.collections.every(value => value.enabled === false)); assert.equal(active.collections[0]!.enabled, true);
  assert.equal(sealRelease(structuredClone(release)).releaseId, release.releaseId);
  for (const invalid of [definition('bad', { minDistinct: 1 }), definition('bad', { predicateVersion: '2' as '1' }),
    definition('bad', { predicate: { kind: 'requested-task-fit' } }), definition('bad', { selection: { categoryId: 'airport-transfers' } })]) {
    assert.throws(() => collectionRelease([invalid]), code('RELEASE_INCOMPATIBLE'));
  }
});

test('definitions can be disabled again without losing their key or executable predicate', () => {
  const disabled = definition('same-key', { enabled: false, reason: 'EDITORIAL_DISABLED' });
  const artifact = collectionRelease([disabled]); const request = collectionRequest(artifact);
  const prepared = prepareCollections({ request, definitionIds: ['same-key'] }, artifact);
  assert.deepEqual(prepared.diagnostics, [{ definitionId: 'same-key', reasonCode: 'COLLECTION_DISABLED' }]);
  assert.equal(artifact.collections[0]!.id, 'same-key'); assert.equal(prepared.prepared.length, 0);
  const active = collectionRelease([definition()]);
  assert.deepEqual(prepareCollections({ request: collectionRequest(active, { limit: 1 }), definitionIds: ['protocol-explore'] }, active).diagnostics,
    [{ definitionId: 'protocol-explore', reasonCode: 'COLLECTION_PREVIEW_LIMIT_TOO_SMALL' }]);
});

test('exact destination preserves query, filters, source scope, mode and sort while intersecting selectors', () => {
  const artifact = collectionRelease([definition('query', { predicate: { kind: 'query-matches' }, selection: { categoryId: 'beauty-wellness' }, filters: [{ kind: 'catalog_area', areaId: 'east' }] })]);
  const request = collectionRequest(artifact, { query: '"Protocol merchant"', sort: 'rating', filters: [{ kind: 'catalog_area', areaId: 'east' }] });
  const prepared = prepareCollections({ request, definitionIds: ['query'] }, artifact).prepared[0]!;
  assert.deepEqual(prepared.viewAllRequest, request); assert.equal(prepared.readRequest.limit, 48);
  assert.deepEqual(prepared.readRequest.filters, [{ kind: 'catalog_area', areaId: 'east' }]);
  const sibling = artifact.nodes.find(node => node.kind === 'subcategory' && node.parentId === request.selection.categoryId && node.id !== request.selection.subcategoryId)!;
  const narrowedRelease = collectionRelease([definition('sibling', { selection: { categoryId: sibling.parentId!, subcategoryId: sibling.id } })]);
  const conflict = prepareCollections({ request: { ...request, discoveryReleaseId: narrowedRelease.releaseId }, definitionIds: ['sibling'] }, narrowedRelease);
  assert.deepEqual(conflict.diagnostics, [{ definitionId: 'sibling', reasonCode: 'COLLECTION_SELECTION_CONFLICT' }]);
});

test('released order wins and unsupported query, mode, destination and conflicting constraints are suppressed', () => {
  const artifact = collectionRelease([definition('first'), definition('second'), definition('query', { predicate: { kind: 'query-matches' } }),
    definition('conflict', { filters: [{ kind: 'catalog_area', areaId: 'west' }] }), definition('anchor', { mode: 'offering', predicate: { kind: 'more-from-merchant' } })]);
  const request = collectionRequest(artifact, { filters: [{ kind: 'catalog_area', areaId: 'east' }] });
  const result = prepareCollections({ request, definitionIds: ['anchor', 'conflict', 'query', 'second', 'first'] }, artifact);
  assert.deepEqual(result.prepared.map(value => value.definition.id), ['first', 'second']);
  assert.deepEqual(result.diagnostics.map(value => value.reasonCode), ['COLLECTION_QUERY_REQUIRED', 'COLLECTION_CONSTRAINT_CONFLICT', 'COLLECTION_CONTEXT_UNSUPPORTED']);
  const anchor = prepareCollections({ request: { ...request, mode: 'offering' }, definitionIds: ['anchor'] }, artifact);
  assert.deepEqual(anchor.diagnostics, [{ definitionId: 'anchor', reasonCode: 'COLLECTION_DESTINATION_UNSUPPORTED' }]);
});

test('unknown, duplicate and oversized IDs and stale release never fall back to other sections', () => {
  const artifact = collectionRelease([definition()]); const request = collectionRequest(artifact);
  assert.throws(() => prepareCollections({ request, definitionIds: ['unknown'] }, artifact), code('INVALID_REQUEST'));
  assert.throws(() => prepareCollections({ request, definitionIds: ['protocol-explore', 'protocol-explore'] }, artifact), code('INVALID_REQUEST'));
  assert.throws(() => prepareCollections({ request, definitionIds: Array(9).fill('protocol-explore') }, artifact), code('INVALID_REQUEST'));
  assert.throws(() => prepareCollections({ request: { ...request, discoveryReleaseId: 'stale' }, definitionIds: ['protocol-explore'] }, artifact), code('RELEASE_INCOMPATIBLE'));
});

test('distinct minimum hides one result; sufficient previews preserve source presentations and exact destination', () => {
  const artifact = collectionRelease([definition()]); const request = collectionRequest(artifact);
  const prepared = prepareCollections({ request, definitionIds: ['protocol-explore'] }, artifact).prepared[0]!;
  const sparse = selectCollections([{ prepared, page: collectionPage(prepared, ['a']) }], [], artifact);
  assert.deepEqual(sparse.page, { sections: [], partial: true, reasonCodes: ['COLLECTION_INSUFFICIENT_SUPPLY'] });
  const source = { ...collectionPage(prepared, ['a', 'b', 'c', 'd', 'e']), pageCursor: 'source-page-48', previousCursor: 'source-prev-48' };
  const result = selectCollections([{ prepared, page: source }], [], artifact);
  assert.deepEqual(result.page.sections[0]!.page.refs.map(ref => ref.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(result.page.sections[0]!.page.presentations.merchants.map(row => row.ref), result.page.sections[0]!.page.refs);
  assert.deepEqual(result.page.sections[0]!.viewAllRequest, request); assert.equal(result.page.sections[0]!.page.retrieval.completion, 'unknown');
  assert.equal(result.page.sections[0]!.page.status, 'ok'); assert.equal(result.page.partial, false);
  assert.equal(result.page.sections[0]!.page.pageCursor, undefined); assert.equal(result.page.sections[0]!.page.previousCursor, undefined);
});

test('strict Jaccard boundary keeps 0.70, suppresses above it and compares with every retained preview', () => {
  const artifact = collectionRelease([definition('one', { maxItems: 10 }), definition('boundary', { maxItems: 10 }), definition('duplicate', { maxItems: 10 })]);
  const prepared = prepareCollections({ request: collectionRequest(artifact), definitionIds: ['duplicate', 'boundary', 'one'] }, artifact).prepared;
  const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const result = selectCollections(prepared.map((item, index) => ({ prepared: item, page: collectionPage(item, index === 0 ? all : all.slice(0, 7)) })), [], artifact);
  assert.deepEqual(result.page.sections.map(section => section.definitionId), ['one', 'boundary']);
  assert.deepEqual(result.page.reasonCodes, ['COLLECTION_BOUNDED_UNDERFILL', 'COLLECTION_OVERLAP_SUPPRESSED']);
});

test('foreign query hashes, constraints, versions, duplicate refs and cross-merchant presentations fail', () => {
  const artifact = collectionRelease([definition()]); const prepared = prepareCollections({ request: collectionRequest(artifact, { query: 'protocol' }), definitionIds: ['protocol-explore'] }, artifact).prepared[0]!;
  const base = collectionPage(prepared, ['a', 'b']);
  for (const mutate of [(page: typeof base) => { page.applied.filterHash = 'wrong-query'; },
    (page: typeof base) => { page.refs[1] = page.refs[0]!; }, (page: typeof base) => { page.presentations.merchants[0]!.ref.merchantId = 'other'; },
    (page: typeof base) => { page.versions.mapping = 'other'; }]) {
    const page = structuredClone(base); mutate(page);
    assert.throws(() => selectCollections([{ prepared, page }], [], artifact), code('CONSTRAINT_CONFLICT'));
  }
  assert.deepEqual(selectCollections([{ prepared, page: base }], [], artifact).page.sections[0]!.page.refs.map(ref => ref.id), ['a', 'b']);
});

test('sections cannot silently mix index generations or source snapshots', () => {
  const artifact = collectionRelease([definition('a'), definition('b')]);
  const prepared = prepareCollections({ request: collectionRequest(artifact), definitionIds: ['a', 'b'] }, artifact).prepared;
  const one = collectionPage(prepared[0]!, ['a', 'b']); const two = collectionPage(prepared[1]!, ['c', 'd']);
  one.versions.indexGeneration = 'one'; two.versions.indexGeneration = 'two';
  assert.throws(() => selectCollections([{ prepared: prepared[0]!, page: one }, { prepared: prepared[1]!, page: two }], [], artifact), code('CURSOR_RESTART_REQUIRED'));
});

test('more-from-merchant requires current anchor, same owner/merchant, and always excludes the seed', () => {
  const def = definition('more', { mode: 'offering', predicate: { kind: 'more-from-merchant' } }); const artifact = collectionRelease([def]);
  const request = collectionRequest(artifact, { mode: 'offering', sourceScope: { anchorRef: { kind: 'offering', ownerId: 'protocol-rank-owner', id: 'seed', merchantId: 'merchant-one' } } });
  const anchor = rankCandidate('seed', request, 'merchant-one'); const candidate = rankCandidate('other', request, 'merchant-one');
  const input = { release: artifact, request, definition: def, checkedAt, anchor, candidate };
  assert.equal(evaluateCollectionPredicate(input).state, 'pass');
  assert.deepEqual(evaluateCollectionPredicate({ ...input, candidate: anchor }).reasonCodes, ['COLLECTION_SEED_EXCLUDED']);
  assert.equal(evaluateCollectionPredicate({ ...input, candidate: rankCandidate('different', request, 'merchant-two') }).state, 'fail');
  anchor.source.current = { state: 'unknown', reason: 'not_exposed' }; assert.equal(evaluateCollectionPredicate(input).state, 'unknown');
});

test('comparable alternatives require real classification/workflow, compatible complete price basis and currency, including zero', () => {
  const def = definition('compare', { mode: 'offering', predicate: { kind: 'comparable-alternatives', priceKind: 'listed_price' } }); const artifact = collectionRelease([def]);
  const request = collectionRequest(artifact, { mode: 'offering', sourceScope: { anchorRef: { kind: 'offering', ownerId: 'protocol-rank-owner', id: 'seed', merchantId: 'merchant-one' } } });
  const anchor = rankCandidate('seed', request, 'merchant-one'); const candidate = rankCandidate('candidate', request, 'merchant-two');
  anchor.source.listedPrice = known({ amount: { minor: 100, currency: 'KES' }, basisId: 'same-unit', complete: true }, 'seed');
  candidate.source.listedPrice = known({ amount: { minor: 0, currency: 'KES' }, basisId: 'same-unit', complete: true }, 'candidate');
  const input = { release: artifact, request, definition: def, checkedAt, anchor, candidate };
  assert.deepEqual(evaluateCollectionPredicate(input).reasonCodes, ['COLLECTION_COMPARISON_VERIFIED']);
  if (candidate.source.listedPrice.state === 'known') candidate.source.listedPrice.value.basisId = 'per-person';
  assert.equal(evaluateCollectionPredicate(input).state, 'fail');
  if (candidate.source.listedPrice.state === 'known') candidate.source.listedPrice.value.basisId = 'same-unit';
  if (candidate.source.listedPrice.state === 'known') candidate.source.listedPrice.value.amount.currency = 'USD';
  assert.equal(evaluateCollectionPredicate(input).state, 'fail');
  candidate.source.listedPrice = { state: 'unknown', reason: 'not_verified' }; assert.equal(evaluateCollectionPredicate(input).state, 'unknown');
});

test('typed task filters must actually pass source policy; a prose title or stronger score cannot supply missing facts', () => {
  const def = definition('task', { predicate: { kind: 'requested-task-fit' }, mode: 'offering', filters: [{ kind: 'required_attributes', values: [{ key: 'finish', valueId: 'matte' }] }] });
  const artifact = collectionRelease([def]); const request = collectionRequest(artifact, { mode: 'offering', filters: def.filters! });
  const candidate = rankCandidate('a', request, 'merchant'); const input = { release: artifact, request, definition: def, checkedAt, candidate, attributeRegistry: { finish: ['matte'] } };
  assert.equal(evaluateCollectionPredicate(input).state, 'unknown');
  candidate.source.attributes = known({ finish: 'matte' }, 'a'); assert.deepEqual(evaluateCollectionPredicate(input).reasonCodes, ['COLLECTION_TASK_FILTERS_VERIFIED']);
  candidate.source.callerAccess = known(false, 'a'); assert.equal(evaluateCollectionPredicate(input).state, 'fail');
  assert.equal(candidate.source.requestBinding, requestBinding(request));
});
