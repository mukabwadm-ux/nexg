import test from 'node:test';
import assert from 'node:assert/strict';
import { composeConstraints, type ConstraintLayer } from '../src/policy/composition.js';
import { resolveWorkflowPolicy, requestBinding, andDecisions, type VerifiedWorkflow } from '../engines/catalog-eligibility/src/index.js';
import { known, unknown, policyControl, interval } from './helpers.js';
import type { EngineRequest } from '../src/contracts/index.js';

const appointmentFilters = [
  { kind: 'party' as const, adults: 2 },
  { kind: 'required_availability' as const, start: interval.start, end: interval.end, timezone: interval.timezone },
  { kind: 'comparable_total' as const, max: { minor: 700000, currency: 'KES' }, scopeId: 'whole-party-treatment' },
];
function appointmentControl() {
  const input = policyControl(appointmentFilters);
  Object.assign(input.source, { partyCapacity: known({ value: '2', unitId: 'person' }), availableInterval: known(interval), availability: known(true),
    resourcesReady: known(true), comparableTotal: known({ amount: { minor: 650000, currency: 'KES' }, basisId: 'whole-party-treatment', complete: true }) });
  return input;
}
test('typed composition intersects sets, strengthens bounds and unions authorized requirements independently of order', () => {
  const layers: ConstraintLayer[] = [
    { origin: 'workflow', ownerId: 'owner', revision: '1', constraints: [
      { key: 'party', type: 'bounds', unit: 'person', min: 1, max: 8 },
      { key: 'fulfillment', type: 'allowed_set', values: ['pickup', 'delivery'] },
      { key: 'required_acknowledgements', type: 'requirements', values: ['owner-terms'] },
    ] },
    { origin: 'offering', ownerId: 'owner', revision: '2', constraints: [
      { key: 'party', type: 'bounds', unit: 'person', min: 2, max: 4 },
      { key: 'fulfillment', type: 'allowed_set', values: ['pickup'] },
      { key: 'required_acknowledgements', type: 'requirements', values: ['owner-terms', 'actual-cancellation-terms'] },
    ] },
  ];
  const expected = { constraints: [
    { key: 'fulfillment', type: 'allowed_set', values: ['pickup'] },
    { key: 'party', type: 'bounds', unit: 'person', min: 2, max: 4 },
    { key: 'required_acknowledgements', type: 'requirements', values: ['actual-cancellation-terms', 'owner-terms'] },
  ], conflicts: [] };
  assert.deepEqual(composeConstraints(layers), expected);
  assert.deepEqual(composeConstraints([...layers].reverse()), expected);
});
test('impossible bounds, empty sets and mismatched units remain conflicts', () => {
  const layer: ConstraintLayer = { origin: 'workflow', ownerId: 'owner', revision: '1', constraints: [
    { key: 'party', type: 'bounds', unit: 'person', min: 4, max: 2 },
    { key: 'fulfillment', type: 'allowed_set', values: [] },
    { key: 'duration', type: 'bounds', unit: 'hour', min: 1 },
  ] };
  assert.deepEqual(composeConstraints([layer]).conflicts, [
    { key: 'duration', code: 'INCOMPATIBLE_UNIT' }, { key: 'fulfillment', code: 'EMPTY_ALLOWED_SET' }, { key: 'party', code: 'IMPOSSIBLE_BOUNDS' },
  ]);
});
test('request layers cannot add private intake or acknowledgement requirements', () => {
  const result = composeConstraints([{ origin: 'request', ownerId: 'guest', revision: '1', constraints: [{ key: 'required_acknowledgements', type: 'requirements', values: ['invented-intake'] }] }]);
  assert.deepEqual(result, { constraints: [], conflicts: [{ key: 'required_acknowledgements', code: 'INVALID_CONSTRAINT' }] });
});
test('DE-AC-001 four passengers fail a three-person transfer but pass a verified four-person control', () => {
  const input = policyControl([{ kind: 'workflow_kind', value: 'TRANSFER' }, { kind: 'party', adults: 4 }], 'TRANSFER');
  input.source.partyCapacity = known({ value: '3', unitId: 'person' });
  const failed = resolveWorkflowPolicy(input);
  assert.equal(failed.decisions.matchesHardRequest.state, 'fail');
  assert.equal(failed.decisions.matchesHardRequest.reasonCodes.includes('PARTY_CAPACITY_EXCEEDED'), true);
  input.source.partyCapacity = known({ value: '4', unitId: 'person' });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'pass');
});
test('DE-AC-001 rental cannot satisfy transfer intent and owner party bounds cannot be relaxed', () => {
  const input = policyControl([{ kind: 'workflow_kind', value: 'TRANSFER' }, { kind: 'party', adults: 4 }], 'RENTAL');
  input.source.partyCapacity = known({ value: '8', unitId: 'person' });
  input.source.workflow = known({ ...(input.source.workflow as { value: VerifiedWorkflow }).value,
    layers: [{ origin: 'offering', ownerId: 'contract-owner', revision: 'terms', constraints: [{ key: 'party', type: 'bounds', unit: 'person', max: 2 }] }] });
  const report = resolveWorkflowPolicy(input);
  assert.equal(report.decisions.matchesHardRequest.state, 'fail');
  assert.equal(report.workflow?.kind, 'RENTAL');
  assert.equal(report.decisions.matchesHardRequest.reasonCodes.includes('WORKFLOW_MISMATCH'), true);
  assert.equal((input.request as EngineRequest).filters[1]?.kind, 'party');
});
test('DE-AC-001 transfer interval cannot pass without route feasibility', () => {
  const input = policyControl([{ kind: 'required_availability', start: interval.start, end: interval.end, timezone: interval.timezone }], 'TRANSFER');
  input.source.workflow = known({ ...(input.source.workflow as { value: VerifiedWorkflow }).value, modules: ['route'] });
  input.source.availableInterval = known(interval); input.source.availability = known(true); input.source.resourcesReady = known(true); input.source.serviceArea = unknown;
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unknown');
  input.source.serviceArea = known(true);
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'pass');
});
test('DE-AC-002 merchant context cannot prove a dish; verified registered attributes can match', () => {
  const input = policyControl([{ kind: 'required_attributes', values: [{ key: 'dish', valueId: 'reviewed-dish-id' }] }], 'PURCHASE');
  input.attributeRegistry = { dish: ['reviewed-dish-id'] };
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unknown');
  input.source.attributes = known({ dish: 'reviewed-dish-id' });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'pass');
  input.source.attributes = known({ dish: 'different-dish-id' });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'fail');
});
test('unregistered or inferred attribute keys cannot create a supported capability', () => {
  const input = policyControl([{ kind: 'required_attributes', values: [{ key: 'invented', valueId: 'guess' }] }]);
  input.source.attributes = known({ invented: 'guess' });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unsupported');
  input.attributeRegistry = { invented: ['guess'] };
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'pass');
});
test('prototype names are not registered attributes or policy rules', () => {
  const input = policyControl([{ kind: 'required_attributes', values: [{ key: 'toString', valueId: 'guess' }] }]);
  input.attributeRegistry = {};
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unsupported');
  assert.throws(() => composeConstraints([{ origin: 'offering', ownerId: 'owner', revision: '1', constraints: [{ key: 'toString', type: 'allowed_set', values: ['guess'] } as unknown as ConstraintLayer['constraints'][number]] }]));
});
test('DE-AC-003 two-person treatment requires resources and complete whole-party price', () => {
  const input = appointmentControl();
  const verified = resolveWorkflowPolicy(input);
  assert.deepEqual([verified.decisions.canBrowse.state, verified.decisions.matchesHardRequest.state, verified.businessEffect], ['pass', 'pass', 'none']);
  input.source.resourcesReady = known(false);
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'fail');
  input.source.resourcesReady = unknown;
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unknown');
});
test('DE-AC-003 one resource or per-person/estimated price cannot satisfy the whole-party cap', () => {
  const input = appointmentControl();
  input.source.comparableTotal = known({ amount: { minor: 350000, currency: 'KES' }, basisId: 'per-person', complete: true });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unknown');
  input.source.comparableTotal = known({ amount: { minor: 650000, currency: 'KES' }, basisId: 'whole-party-treatment', complete: false });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unknown');
  input.source.comparableTotal = known({ amount: { minor: 650000, currency: 'KES' }, basisId: 'whole-party-treatment', complete: true });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'pass');
});
test('source reprice excludes an over-budget candidate without increasing the customer cap', () => {
  const input = appointmentControl();
  input.source.comparableTotal = known({ amount: { minor: 800000, currency: 'KES' }, basisId: 'whole-party-treatment', complete: true });
  const result = resolveWorkflowPolicy(input);
  assert.equal(result.decisions.matchesHardRequest.state, 'fail');
  assert.equal(result.decisions.matchesHardRequest.reasonCodes.includes('BUDGET_EXCEEDED'), true);
  assert.equal((input.request as EngineRequest).filters.find(filter => filter.kind === 'comparable_total')?.max.minor, 700000);
});
test('currency mismatch and fractional person capacity stay incomparable or insufficient', () => {
  const input = appointmentControl();
  input.source.comparableTotal = known({ amount: { minor: 6000, currency: 'USD' }, basisId: 'whole-party-treatment', complete: true });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unknown');
  input.source.partyCapacity = known({ value: '1.999999', unitId: 'person' });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'fail');
});
test('the whole interval and source notice rules apply independently of nominal availability', () => {
  const input = appointmentControl();
  input.source.availableInterval = known({ ...interval, end: '2026-10-20T09:30:00+03:00' });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'fail');
  input.source.availableInterval = known(interval);
  input.source.workflow = known({ ...(input.source.workflow as { value: VerifiedWorkflow }).value,
    layers: [{ origin: 'workflow', ownerId: 'contract-owner', revision: 'notice', constraints: [{ key: 'notice', type: 'bounds', unit: 'minute', min: 1440 }] }] });
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'fail');
});
test('missing workflow facts do not prevent ordinary browsing or invent an alternative workflow', () => {
  const input = policyControl(); input.source.workflow = unknown;
  const browse = resolveWorkflowPolicy(input);
  assert.deepEqual([browse.decisions.canBrowse.state, browse.decisions.matchesHardRequest.state, browse.decisions.canTransact.state], ['pass', 'pass', 'unsupported']);
  const constrained = policyControl([{ kind: 'party', adults: 2 }]); constrained.source.workflow = unknown;
  constrained.source.partyCapacity = known({ value: '2', unitId: 'person' });
  assert.equal(resolveWorkflowPolicy(constrained).decisions.matchesHardRequest.state, 'unknown');
});
test('mixed workflows coexist in one category; changing category context does not change verified workflow', () => {
  const product = policyControl([], 'PURCHASE'); const service = policyControl([], 'APPOINTMENT');
  assert.deepEqual([resolveWorkflowPolicy(product).workflow?.kind, resolveWorkflowPolicy(service).workflow?.kind], ['PURCHASE', 'APPOINTMENT']);
  const nextRequest = { ...(service.request as EngineRequest), selection: { categoryId: 'experiences' } };
  service.request = nextRequest; service.source.requestBinding = requestBinding(nextRequest);
  assert.equal(resolveWorkflowPolicy(service).workflow?.kind, 'APPOINTMENT');
});
test('DE-AC-004 selected merchant scope and entity mode cannot be bypassed', () => {
  const input = policyControl();
  const selected = { ...(input.request as EngineRequest), sourceScope: { merchantId: 'other-merchant' } };
  input.request = selected; input.source.requestBinding = requestBinding(selected);
  assert.equal(resolveWorkflowPolicy(input).decisions.canBrowse.state, 'fail');
  const merchantRequest = { ...selected, sourceScope: { merchantId: 'contract-parent' }, mode: 'merchant' as const };
  input.request = merchantRequest; input.source.requestBinding = requestBinding(merchantRequest);
  assert.equal(resolveWorkflowPolicy(input).decisions.canBrowse.state, 'fail');
});
test('facts bound to an old request cannot satisfy a changed hard request', () => {
  const input = appointmentControl();
  input.request = { ...(input.request as EngineRequest), filters: [{ kind: 'party', adults: 3 }] };
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'fail');
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.reasonCodes.includes('CONSTRAINT_BINDING_MISMATCH'), true);
});
test('expired, future-dated and version-mismatched source evidence never become known true', () => {
  const input = policyControl();
  input.source.current = { state: 'known', value: true, evidence: { source: { ownerId: 'contract-owner', id: 'contract-offering', revision: 'control-revision' }, observedAt: '2026-10-19T08:00:00Z', validUntil: '2026-10-19T09:00:00Z' } };
  assert.equal(resolveWorkflowPolicy(input).decisions.canBrowse.state, 'unknown');
  input.source.current = known(true); input.source.sourceRevision = 'changed-revision';
  assert.equal(resolveWorkflowPolicy(input).decisions.canBrowse.state, 'unknown');
  input.source.sourceRevision = 'control-revision';
  input.checkedAt = '2026-10-19T08:00:00Z';
  assert.equal(resolveWorkflowPolicy(input).decisions.canBrowse.state, 'unknown');
});
test('false mandatory access and capacity remain failures in the presence of unrelated unknown facts', () => {
  const input = appointmentControl(); input.source.availability = unknown; input.source.callerAccess = known(false);
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'fail');
  assert.deepEqual(andDecisions([{ state: 'unknown', reasonCodes: ['UNRESOLVED'], evidence: [] }, { state: 'fail', reasonCodes: ['DENIED'], evidence: [] }]),
    { state: 'fail', reasonCodes: ['DENIED', 'UNRESOLVED'], evidence: [] });
});
test('wrong-offering workflow evidence does not inherit another offering capability', () => {
  const input = appointmentControl();
  const fact = known((input.source.workflow as { value: VerifiedWorkflow }).value);
  if (fact.state === 'known') fact.evidence.source.id = 'different-offering';
  input.source.workflow = fact;
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unknown');
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.reasonCodes.includes('SOURCE_IDENTITY_MISMATCH'), true);
});
test('DE-AC-007 no compute/spend override exists and source eligibility remains decisive', () => {
  const input = appointmentControl(); input.source.partyCapacity = known({ value: '1', unitId: 'person' });
  const lowCost = resolveWorkflowPolicy(input); const quality = resolveWorkflowPolicy(structuredClone(input));
  assert.deepEqual(lowCost.decisions, quality.decisions);
  assert.equal(quality.decisions.matchesHardRequest.state, 'fail');
  const boosted = { ...(input.request as EngineRequest), adSpend: 1000000 };
  assert.throws(() => resolveWorkflowPolicy({ ...input, request: boosted }));
});
test('even complete policy controls enable no owner action, side effect or operational authority', () => {
  const input = appointmentControl(); const before = structuredClone(input.source);
  const result = resolveWorkflowPolicy(input);
  assert.deepEqual([result.decisions.matchesHardRequest.state, result.decisions.canSubmitRequest.state, result.decisions.canTransact.state, result.businessEffect], ['pass', 'unsupported', 'unsupported', 'none']);
  assert.deepEqual(input.source, before);
  if (input.source.workflow.state === 'known') {
    input.source.workflow.value.ref.id = 'updated-local-control';
    assert.equal(input.source.workflow.value.ref.id, 'updated-local-control');
    input.source.workflow.value.ref.id = 'contract-workflow';
  }
  assert.throws(() => { result.decisions.matchesHardRequest.state = 'fail'; }, TypeError);
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'pass');
});
test('workflow-required resource predicates cannot be removed by omitting source modules', () => {
  const input = appointmentControl();
  input.source.workflow = known({ ...(input.source.workflow as { value: VerifiedWorkflow }).value, modules: [] });
  input.source.resourcesReady = unknown;
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'unknown');
  input.source.resourcesReady = known(true);
  assert.equal(resolveWorkflowPolicy(input).decisions.matchesHardRequest.state, 'pass');
});
test('unimplemented entitlement or telecom availability semantics cannot borrow appointment intervals', () => {
  const input = appointmentControl();
  input.source.workflow = known({ ...(input.source.workflow as { value: VerifiedWorkflow }).value, kind: 'ENTITLEMENT' });
  const report = resolveWorkflowPolicy(input);
  assert.equal(report.workflow?.kind, 'ENTITLEMENT');
  assert.equal(report.decisions.matchesHardRequest.state, 'unsupported');
  assert.equal(report.decisions.matchesHardRequest.reasonCodes.includes('WORKFLOW_FEASIBILITY_NOT_IMPLEMENTED'), true);
});
