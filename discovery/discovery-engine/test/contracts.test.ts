import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError, type EngineRequest } from '../src/contracts/index.js';
import { parseEngineRequest, parseSchema, validateTaskRequest } from '../src/contracts/validate.js';
import { request, release, evidence } from './helpers.js';

function rejects(value: unknown, code = 'INVALID_REQUEST'): void {
  assert.throws(() => parseEngineRequest(value, release), error => error instanceof ContractError && error.code === code);
}
test('wire request retains real const discriminants, zero prices and explicit source IDs', () => {
  const input = request([{ kind: 'listed_price', max: { minor: 0, currency: 'KES' }, basisId: 'declared-listed-unit' }]);
  assert.deepEqual(parseEngineRequest(input, release), input);
  assert.deepEqual(parseSchema('ObservedRef', { ownerId: 'source', id: 'legacy_opaque-id' }), { ownerId: 'source', id: 'legacy_opaque-id' });
});
test('known false remains a fact; unknown cannot carry a value or fabricated evidence', () => {
  assert.deepEqual(parseSchema('BooleanFact', { state: 'known', value: false, evidence }), { state: 'known', value: false, evidence });
  assert.deepEqual(parseSchema('BooleanFact', { state: 'unknown', reason: 'not_verified' }), { state: 'unknown', reason: 'not_verified' });
  for (const bad of [{ state: 'unknown', reason: 'not_verified', value: true }, { state: 'known', value: true }]) assert.throws(() => parseSchema('BooleanFact', bad), ContractError);
});
test('money rejects floats, unsafe integers, negative values and missing currency', () => {
  assert.deepEqual(parseSchema('Money', { minor: 700000, currency: 'KES' }), { minor: 700000, currency: 'KES' });
  for (const bad of [{ minor: 1.5, currency: 'KES' }, { minor: Number.MAX_SAFE_INTEGER + 1, currency: 'KES' }, { minor: -1, currency: 'KES' }, { minor: 100 }]) assert.throws(() => parseSchema('Money', bad), ContractError);
});
test('malformed requests reject unknown fields, oversized pages and cursor/offset combinations', () => {
  assert.equal(parseEngineRequest(request(), release).limit, 24);
  for (const extra of [{ madeUpPolicy: true }, { limit: 49 }, { cursor: 'opaque', offset: 0 }, { filters: [{ kind: 'PartyFilter', adults: 2 }] }]) rejects({ ...request(), ...extra });
});
test('selection never silently repairs unknown IDs or conflicting parent-child scope', () => {
  assert.equal(parseEngineRequest({ ...request(), selection: { categoryId: 'restaurants-food' } }, release).selection.categoryId, 'restaurants-food');
  rejects({ ...request(), selection: { categoryId: 'invented' } });
  const sub = release.nodes.find(node => node.kind === 'subcategory' && node.parentId === 'restaurants-food')!;
  rejects({ ...request(), selection: { categoryId: 'beauty-wellness', subcategoryId: sub.id } }, 'CONSTRAINT_CONFLICT');
  rejects({ ...request(), discoveryReleaseId: 'another-release' }, 'RELEASE_INCOMPATIBLE');
});
test('request semantics reject zero party, invalid timezone, reversed dates and incomparable range currency', () => {
  assert.equal(parseEngineRequest(request([{ kind: 'party', adults: 2 }]), release).filters.length, 1);
  for (const filters of [
    [{ kind: 'party', adults: 0 }],
    [{ kind: 'required_availability', start: '2026-10-19T10:00:00Z', end: '2026-10-19T09:00:00Z', timezone: 'Africa/Nairobi' }],
    [{ kind: 'required_availability', start: '2026-10-19T10:00:00Z', timezone: 'invented/zone' }],
  ]) rejects({ ...request(), filters });
  rejects(request([{ kind: 'listed_price', min: { minor: 100, currency: 'KES' }, max: { minor: 200, currency: 'USD' }, basisId: 'unit' }]), 'CONSTRAINT_CONFLICT');
});
test('merchant and anchor scopes must identify the same owning merchant', () => {
  const valid: EngineRequest = { ...request(), sourceScope: { merchantId: 'actual-id', anchorRef: { kind: 'offering', ownerId: 'source', id: 'item-id', merchantId: 'actual-id' } } };
  assert.equal(parseEngineRequest(valid, release).sourceScope?.merchantId, 'actual-id');
  rejects({ ...valid, sourceScope: { ...valid.sourceScope, merchantId: 'other' } }, 'CONSTRAINT_CONFLICT');
});
test('task contract allows three required independent groups but rejects four or duplicate component IDs', () => {
  const components = ['restaurant', 'safari', 'spa'].map(componentId => ({ componentId, required: true, request: request() }));
  const task = { contractVersion: '1', requestId: 'task-control', discoveryReleaseId: release.releaseId, components };
  assert.deepEqual(validateTaskRequest(task, release).components.map(component => component.componentId), ['restaurant', 'safari', 'spa']);
  assert.throws(() => validateTaskRequest({ ...task, components: [...components, { componentId: 'fourth', required: true, request: request() }] }, release), error => error instanceof ContractError && error.code === 'LIMIT_EXCEEDED');
  assert.throws(() => validateTaskRequest({ ...task, components: [components[0], components[0]] }, release), ContractError);
  assert.throws(() => validateTaskRequest({ ...task, discoveryReleaseId: 'old-release' }, release), error => error instanceof ContractError && error.code === 'RELEASE_INCOMPATIBLE');
});
