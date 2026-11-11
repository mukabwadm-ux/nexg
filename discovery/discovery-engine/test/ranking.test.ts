import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendations, type RankingCandidate, type RankingInput } from '../engines/recommendation/src/index.js';
import { requestBinding } from '../engines/catalog-eligibility/src/index.js';
import { ContractError } from '../src/contracts/index.js';
import { known, rankInput, rankCandidate, sortProof } from './rankingControls.js';

const ids = (input: RankingInput) => rankRecommendations(input).items.map(item => item.ref.id);
const code = (value: string) => (error: unknown) => error instanceof ContractError && error.code === value;

test('cold-start ties use original IDs and remain stable under input permutation without mutation', () => {
  const input = rankInput(); const candidates = ['z', 'a', 'b'].map(id => rankCandidate(id, input.request));
  const before = JSON.stringify(candidates);
  assert.deepEqual(ids({ ...input, candidates }), ['a', 'b', 'z']);
  assert.deepEqual(ids({ ...input, candidates: [...candidates].reverse() }), ['a', 'b', 'z']);
  assert.equal(JSON.stringify(candidates), before);
  assert.deepEqual(rankRecommendations({ ...input, candidates }).items[0]!.score, { base: 1, combined: 1 });
});

test('DE-AC-004 exact identity and relevance bands dominate preferences and optional quality', () => {
  const input = rankInput(); input.request.query = 'protocol model';
  const exact = rankCandidate('z-exact', input.request, undefined, 200); exact.relevance.exactIdentity = true;
  const name = rankCandidate('b-name', input.request); name.source.catalogArea = known('west', 'b-name');
  const context = rankCandidate('a-context', input.request); context.relevance.band = 'context';
  const partial = rankCandidate('a-partial', input.request); partial.relevance.band = 'partial';
  input.preferenceContext = { origin: 'explicit_request', requestBinding: requestBinding(input.request), preferences: [{ id: 'area', kind: 'catalog_area', areaId: 'east', weight: 1 }] };
  assert.deepEqual(ids({ ...input, candidates: [partial, context, name, exact] }), ['z-exact', 'b-name', 'a-context', 'a-partial']);
  assert.deepEqual(rankRecommendations({ ...input, candidates: [exact] }).items[0]!.reasonCodes, ['EXACT_REQUEST_MATCH', 'MATCHED_EXPLICIT_PREFERENCE']);
});

test('DE-AC-007 failed or unknown eligibility cannot be repaired by exact matches, quality or preference', () => {
  const input = rankInput(); input.request.filters = [{ kind: 'catalog_area', areaId: 'east' }];
  const candidates = ['current-false', 'access-unknown', 'wrong-area', 'valid'].map(id => rankCandidate(id, input.request));
  candidates[0]!.source.current = known(false, 'current-false'); candidates[0]!.relevance.exactIdentity = true;
  candidates[1]!.source.callerAccess = { state: 'unknown', reason: 'not_exposed' };
  candidates[2]!.source.catalogArea = known('west', 'wrong-area');
  const result = rankRecommendations({ ...input, candidates });
  assert.deepEqual(result.items.map(item => item.ref.id), ['valid']);
  assert.deepEqual(result.excluded.map(item => item.ref.id), ['access-unknown', 'current-false', 'wrong-area']);
  assert.ok(result.excluded.some(item => item.reasonCodes.includes('SOURCE_ENTITY_NOT_CURRENT')));
});

test('duplicate replay does not boost identity; conflicting source facts or ownership fail closed', () => {
  const input = rankInput(true); const a = rankCandidate('a', input.request, 'merchant-one'); const b = rankCandidate('b', input.request, 'merchant-two');
  assert.deepEqual(ids({ ...input, candidates: [a, b, structuredClone(a)] }), ['a', 'b']);
  const changed = structuredClone(a); changed.source.catalogArea = known('west', 'a');
  assert.throws(() => ids({ ...input, candidates: [a, changed] }), code('SOURCE_REVISION_CHANGED'));
  changed.source = structuredClone(a.source); changed.source.ref.merchantId = 'different-parent';
  assert.throws(() => ids({ ...input, candidates: [a, changed] }), code('SOURCE_REVISION_CHANGED'));
});

test('explicit preferences can reorder close retrieval ranks with the planned bounded score', () => {
  const input = rankInput();
  const candidates = Array.from({ length: 12 }, (_, index) => rankCandidate(`candidate-${String(index).padStart(2, '0')}`, input.request, undefined, index + 1));
  candidates[1]!.source.catalogArea = known('west', 'candidate-01');
  input.preferenceContext = { origin: 'explicit_request', requestBinding: requestBinding(input.request), preferences: [{ id: 'area', kind: 'catalog_area', areaId: 'west', weight: 1 }] };
  const ranked = rankRecommendations({ ...input, candidates });
  assert.deepEqual(ranked.items.slice(0, 2).map(item => item.ref.id), ['candidate-01', 'candidate-00']);
  assert.equal(ranked.items[0]!.score.preferenceFit, 1);
  assert.ok(Math.abs(ranked.items[0]!.score.combined - (0.9 * (10 / 11) + 0.1)) < 1e-12);
  assert.deepEqual(ids({ ...input, preferenceContext: { ...input.preferenceContext, preferences: [] }, candidates }).slice(0, 2), ['candidate-00', 'candidate-01']);
});

test('unknown, stale and wrong-entity features cannot earn preference credit; denominator retains unknowns', () => {
  const input = rankInput(true); input.attributeRegistry = { finish: ['matte'] };
  input.preferenceContext = { origin: 'explicit_request', requestBinding: requestBinding(input.request), preferences: [
    { id: 'area', kind: 'catalog_area', areaId: 'east', weight: 1 }, { id: 'finish', kind: 'attribute', key: 'finish', valueId: 'matte', weight: 3 }] };
  const a = rankCandidate('a', input.request, 'merchant-a'); const b = rankCandidate('b', input.request, 'merchant-b');
  b.source.attributes = known({ finish: 'matte' }, 'b');
  const result = rankRecommendations({ ...input, candidates: [a, b] });
  assert.deepEqual(result.items.map(item => item.ref.id), ['b', 'a']);
  assert.equal(result.items[1]!.score.preferenceFit, 0.25); assert.equal(result.items[0]!.score.preferenceFit, 1);
  if (b.source.attributes.state === 'known') b.source.attributes.evidence.validUntil = input.checkedAt;
  assert.deepEqual(ids({ ...input, candidates: [a, b] }), ['a', 'b']);
  b.source.attributes = known({ finish: 'matte' }, 'another-entity');
  assert.equal(rankRecommendations({ ...input, candidates: [b] }).items[0]!.score.preferenceFit, 0.25);
});

test('old/inferred preferences and unregistered attributes never follow a changed request', () => {
  const input = rankInput(); const a = rankCandidate('a', input.request);
  input.preferenceContext = { origin: 'explicit_request', requestBinding: 'old-request', preferences: [] };
  assert.throws(() => ids({ ...input, candidates: [a] }), code('CONSTRAINT_CONFLICT'));
  input.preferenceContext = { origin: 'explicit_request', requestBinding: requestBinding(input.request), preferences: [{ id: 'unknown', kind: 'attribute', key: 'medical_guess', valueId: 'inferred', weight: 1 }] };
  assert.throws(() => ids({ ...input, candidates: [a] }), code('UNSUPPORTED_CAPABILITY'));
  input.preferenceContext.preferences = [];
  assert.deepEqual(ids({ ...input, candidates: [a] }), ['a']);
});

test('optional quality is comparable only with the same verified metric across a tied tier', () => {
  const input = rankInput(); const a = rankCandidate('a', input.request); const z = rankCandidate('z', input.request);
  a.quality = { metricId: 'reviewed-confidence', value: known(0, 'a') };
  z.quality = { metricId: 'reviewed-confidence', value: known(0.9, 'z') };
  assert.deepEqual(ids({ ...input, candidates: [a, z] }), ['a', 'z']);
  input.qualityMetricIds = ['reviewed-confidence'];
  assert.deepEqual(ids({ ...input, candidates: [a, z] }), ['z', 'a']);
  const b = rankCandidate('b', input.request);
  for (const candidates of [[a, z, b], [b, z, a], [z, a, b]]) assert.deepEqual(ids({ ...input, candidates }), ['a', 'b', 'z']);
  z.quality.metricId = 'different-basis'; assert.deepEqual(ids({ ...input, candidates: [a, z] }), ['a', 'z']);
});

test('explicit owner sort bypasses relevance, preferences and diversification without a local top-K sort', () => {
  const input = rankInput(true); input.request.sort = 'rating';
  const a = rankCandidate('a', input.request, 'm-one'); a.relevance.exactIdentity = true;
  const z = rankCandidate('z', input.request, 'm-two');
  input.explicitOrder = sortProof(input, [z, a]);
  const result = rankRecommendations({ ...input, candidates: [a, z] });
  assert.deepEqual(result.items.map(item => item.ref.id), ['z', 'a']); assert.deepEqual(result.diversity.statuses, ['explicit_sort']);
  assert.deepEqual(result.items[0]!.reasonCodes, ['OWNER_EXPLICIT_ORDER']);
  assert.throws(() => rankRecommendations({ ...input, explicitOrder: { ...input.explicitOrder!, refs: [a.source.ref] }, candidates: [a, z] }), code('CONSTRAINT_CONFLICT'));
  input.explicitOrder.evidence.validUntil = input.checkedAt;
  assert.throws(() => ids({ ...input, candidates: [a, z] }), code('REQUIRED_FACT_UNKNOWN'));
});

test('missing global-sort proof and stale request binding remain unsupported/unresolved', () => {
  const input = rankInput(); input.request.sort = 'listed_price_low';
  const a = rankCandidate('a', input.request);
  assert.throws(() => ids({ ...input, candidates: [a] }), code('UNSUPPORTED_CAPABILITY'));
  input.explicitOrder = { ...sortProof(input, [a]), sort: 'listed_price_low', comparisonKey: 'protocol-KES-unit-basis', requestBinding: 'old' };
  assert.throws(() => ids({ ...input, candidates: [a] }), code('REQUIRED_FACT_UNKNOWN'));
});

function offeringPool(input: RankingInput): RankingCandidate[] {
  return Array.from({ length: 6 }, (_, merchant) => Array.from({ length: 3 }, (_, item) => rankCandidate(`m${merchant + 1}-${item + 1}`,
    input.request, `merchant-${merchant + 1}`, merchant * 3 + item + 1))).flat();
}

test('diversification caps first-ten repetition with enough comparable supply and preserves the full unique pool', () => {
  const input = rankInput(true); const candidates = offeringPool(input); const before = JSON.stringify(candidates);
  const result = rankRecommendations({ ...input, candidates });
  assert.deepEqual(result.items.slice(0, 10).map(item => item.ref.id), ['m1-1', 'm1-2', 'm2-1', 'm2-2', 'm3-1', 'm3-2', 'm4-1', 'm4-2', 'm5-1', 'm5-2']);
  assert.deepEqual([...result.items.map(item => item.ref.id)].sort(), candidates.map(item => item.source.ref.id).sort());
  assert.deepEqual(result.diversity.statuses, ['applied']); assert.ok(result.diversity.movedCount > 0); assert.equal(JSON.stringify(candidates), before);
});

test('sparse supply and exact merchant intent keep useful results without forced caps or underfill', () => {
  const input = rankInput(true); const candidates = offeringPool(input).slice(0, 6);
  const result = rankRecommendations({ ...input, candidates });
  assert.deepEqual(result.items.map(item => item.ref.id), ['m1-1', 'm1-2', 'm1-3', 'm2-1', 'm2-2', 'm2-3']);
  assert.deepEqual(result.diversity.statuses, ['sparse_supply']);
  const exact = rankRecommendations({ ...input, candidates: offeringPool(input), intent: 'exact_merchant' });
  assert.deepEqual(exact.items.slice(0, 4).map(item => item.ref.id), ['m1-1', 'm1-2', 'm1-3', 'm2-1']);
  assert.deepEqual(exact.diversity.statuses, ['exact_merchant']);
});

test('diversity never moves weaker bands above exact identities or sparse stronger matches', () => {
  const input = rankInput(true); const candidates = offeringPool(input);
  for (const candidate of candidates.slice(0, 3)) candidate.relevance.exactIdentity = true;
  assert.deepEqual(ids({ ...input, candidates }).slice(0, 3), ['m1-1', 'm1-2', 'm1-3']);
  for (const candidate of candidates) candidate.relevance.exactIdentity = false;
  for (const candidate of candidates.slice(3)) candidate.relevance.band = 'context';
  const result = rankRecommendations({ ...input, candidates });
  assert.deepEqual(result.items.slice(0, 3).map(item => item.ref.id), ['m1-1', 'm1-2', 'm1-3']);
  assert.ok(result.diversity.statuses.includes('sparse_supply'));
});

test('unknown or incompatible comparison/workflow groups disable diversification instead of inventing comparability', () => {
  const input = rankInput(true); const candidates = offeringPool(input);
  candidates[0]!.diversityGroup = { state: 'unknown', reason: 'not_verified' };
  const unknown = rankRecommendations({ ...input, candidates });
  assert.deepEqual(unknown.items.slice(0, 4).map(item => item.ref.id), ['m1-1', 'm1-2', 'm1-3', 'm2-1']);
  assert.deepEqual(unknown.diversity.statuses, ['comparison_unresolved']);
  candidates[0]!.diversityGroup = known('protocol-comparable-product', candidates[0]!.source.ref.id);
  if (candidates[1]!.source.workflow.state === 'known') candidates[1]!.source.workflow.value.kind = 'APPOINTMENT';
  assert.deepEqual(rankRecommendations({ ...input, candidates }).diversity.statuses, ['comparison_unresolved']);
});

test('DE-AC-003 price basis, zero price and budgets stay policy facts, not rank weights', () => {
  const input = rankInput(true); input.request.filters = [{ kind: 'comparable_total', max: { minor: 700000, currency: 'KES' }, scopeId: 'whole-party' }];
  const candidates = ['zero', 'too-much', 'per-person', 'unknown'].map(id => rankCandidate(id, input.request, `merchant-${id}`));
  candidates[0]!.source.comparableTotal = known({ amount: { minor: 0, currency: 'KES' }, complete: true, basisId: 'whole-party' }, 'zero');
  candidates[1]!.source.comparableTotal = known({ amount: { minor: 700001, currency: 'KES' }, complete: true, basisId: 'whole-party' }, 'too-much');
  candidates[2]!.source.comparableTotal = known({ amount: { minor: 100, currency: 'KES' }, complete: true, basisId: 'per-person' }, 'per-person');
  candidates[1]!.relevance.exactIdentity = true;
  assert.deepEqual(ids({ ...input, candidates }), ['zero']);
});

test('changed requests cannot reuse old policy binding; malformed ranks, spend features and excessive pools fail', () => {
  const input = rankInput(); const old = rankCandidate('old', input.request);
  input.request.query = 'new task'; const current = rankCandidate('current', input.request);
  assert.deepEqual(ids({ ...input, candidates: [old, current] }), ['current']);
  const invalid = structuredClone(current); invalid.relevance.retrievalRank = Number.NaN;
  assert.throws(() => ids({ ...input, candidates: [invalid] }), code('INVALID_REQUEST'));
  assert.throws(() => ids({ ...input, candidates: [{ ...current, adSpend: 999999 } as RankingCandidate] }), code('INVALID_REQUEST'));
  assert.throws(() => ids({ ...input, candidates: Array.from({ length: 201 }, () => current) }), code('LIMIT_EXCEEDED'));
});
