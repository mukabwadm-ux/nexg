import { ContractError, type Decision, type EngineRef, type EngineRequest, type Evidence, type Fact, type Interval, type Money, type Quantity, type SourceRef } from '../../../src/contracts/index.js';
import { assertSchema, parseEngineRequest } from '../../../src/contracts/validate.js';
import { resolveSelection, type ReleaseArtifact } from '../../../src/releases/artifact.js';
import { composeConstraints, type ConstraintLayer } from '../../../src/policy/composition.js';
import { workflowKinds, intervalModules, type WorkflowKind } from '../../../src/policy/registry.js';
import { deepFreeze, revision } from '../../../src/shared/immutable.js';

type FilterKind = EngineRequest['filters'][number]['kind'];
export interface VerifiedWorkflow {
  kind: WorkflowKind;
  version: '1';
  ref: SourceRef;
  supportedFilters: FilterKind[];
  modules: ('resources' | 'route')[];
  layers: ConstraintLayer[];
}
export interface PriceValue { amount: Money; basisId: string; complete: boolean }
export interface OfferingFacts {
  ref: EngineRef;
  sourceRevision?: string;
  requestBinding: string;
  current: Fact<boolean>;
  callerAccess: Fact<boolean>;
  discoveryScope: Fact<boolean>;
  workflow: Fact<VerifiedWorkflow>;
  partyCapacity?: Fact<Quantity>;
  availableInterval?: Fact<Interval>;
  availability?: Fact<boolean>;
  resourcesReady?: Fact<boolean>;
  serviceArea?: Fact<boolean>;
  merchantOpen?: Fact<boolean>;
  catalogArea?: Fact<string>;
  fulfillment?: Fact<string[]>;
  listedPrice?: Fact<PriceValue>;
  comparableTotal?: Fact<PriceValue>;
  attributes?: Fact<Record<string, string>>;
}
export interface PolicyInput {
  release: Readonly<ReleaseArtifact>;
  request: unknown;
  source: OfferingFacts;
  checkedAt: string;
  // Server-approved enumerations, never supplied by a public request/model.
  attributeRegistry?: Readonly<Record<string, readonly string[]>>;
}
interface Check extends Decision { key: string }
export interface PolicyReport {
  ref: EngineRef;
  workflow?: { kind: WorkflowKind; version: string; ref: SourceRef };
  decisions: { canBrowse: Decision; matchesHardRequest: Decision; canSubmitRequest: Decision; canTransact: Decision };
  checks: readonly Check[];
  composed: ReturnType<typeof composeConstraints>;
  requiredAcknowledgements: readonly string[];
  policyVersion: '1';
  checkedAt: string;
  businessEffect: 'none';
}

export function requestBinding(request: EngineRequest): string { return revision(request); }
const check = (key: string, state: Decision['state'], reason: string, evidence: Evidence[] = []): Check => ({ key, state, reasonCodes: [reason], evidence: structuredClone(evidence) });
export function andDecisions(decisions: readonly Decision[]): Decision {
  const state = decisions.some(decision => decision.state === 'fail') ? 'fail'
    : decisions.some(decision => decision.state === 'unsupported') ? 'unsupported'
      : decisions.some(decision => decision.state === 'unknown') ? 'unknown' : 'pass';
  const codes = [...new Set(decisions.flatMap(decision => decision.reasonCodes))].sort();
  const evidence = new Map(decisions.flatMap(decision => decision.evidence).map(item => [revision(item), item]));
  return { state, reasonCodes: codes.length > 20 ? [...codes.slice(0, 19), 'ADDITIONAL_POLICY_REASONS'] : codes, evidence: [...evidence.values()].slice(0, 30) };
}

interface ReadFact<T> { value?: T; result: Check }
function readFact<T>(key: string, fact: Fact<T> | undefined, input: PolicyInput, guard: (value: T) => boolean = () => true): ReadFact<T> {
  if (!fact || fact.state === 'unknown') return { result: check(key, 'unknown', fact?.state === 'unknown' && fact.reason === 'stale' ? 'FACTS_TOO_STALE' : 'REQUIRED_FACT_UNKNOWN') };
  if (fact.state === 'not_applicable') return { result: check(key, 'unsupported', 'FACT_NOT_APPLICABLE') };
  try { assertSchema('Evidence', fact.evidence); } catch { return { result: check(key, 'unknown', 'INVALID_SOURCE_EVIDENCE') }; }
  const evidence = fact.evidence;
  if (['workflow', 'current', 'callerAccess', 'scope'].includes(key) && evidence.source.id !== input.source.ref.id) {
    return { result: check(key, 'unknown', 'SOURCE_IDENTITY_MISMATCH') };
  }
  if (evidence.source.ownerId !== input.source.ref.ownerId
    || (input.source.sourceRevision && evidence.source.id === input.source.ref.id && evidence.source.revision !== input.source.sourceRevision)) {
    return { result: check(key, 'unknown', 'SOURCE_REVISION_CHANGED') };
  }
  if (Date.parse(evidence.observedAt) > Date.parse(input.checkedAt)
    || (evidence.validUntil && (Date.parse(evidence.validUntil) <= Date.parse(input.checkedAt) || Date.parse(evidence.validUntil) < Date.parse(evidence.observedAt)))) {
    return { result: check(key, 'unknown', 'FACTS_TOO_STALE') };
  }
  try { if (!guard(fact.value)) return { result: check(key, 'unknown', 'INVALID_SOURCE_FACT') }; }
  catch { return { result: check(key, 'unknown', 'INVALID_SOURCE_FACT') }; }
  return { value: fact.value, result: check(key, 'pass', 'SOURCE_FACT_VERIFIED', [evidence]) };
}
function booleanCheck(key: string, fact: Fact<boolean> | undefined, input: PolicyInput, failure: string): Check {
  const read = readFact(key, fact, input, value => typeof value === 'boolean');
  return read.result.state === 'pass' ? check(key, read.value ? 'pass' : 'fail', read.value ? 'REQUIREMENT_SATISFIED' : failure, read.result.evidence) : read.result;
}
function validWorkflow(workflow: VerifiedWorkflow): boolean {
  assertSchema('SourceRef', workflow.ref);
  return workflowKinds.includes(workflow.kind) && workflow.version === '1' && Array.isArray(workflow.supportedFilters)
    && workflow.supportedFilters.every(kind => ['catalog_area', 'merchant_open', 'listed_price', 'comparable_total', 'fulfillment', 'service_area', 'required_attributes', 'required_availability', 'party', 'workflow_kind'].includes(kind))
    && Array.isArray(workflow.modules) && workflow.modules.every(module => ['resources', 'route'].includes(module))
    && Array.isArray(workflow.layers) && workflow.layers.every(layer => ['workflow', 'qualifier', 'offering'].includes(layer.origin)
      && layer.ownerId === workflow.ref.ownerId && layer.revision && Array.isArray(layer.constraints));
}
function quantity(value: Quantity): bigint {
  assertSchema('Quantity', value);
  const [whole, decimal = ''] = value.value.split('.');
  return BigInt(whole!) * 1_000_000n + BigInt(decimal.padEnd(6, '0'));
}
function intervalValid(value: Interval): boolean {
  assertSchema('Interval', value);
  new Intl.DateTimeFormat('en', { timeZone: value.timezone });
  return Date.parse(value.end) > Date.parse(value.start);
}
function priceValid(value: PriceValue): boolean {
  assertSchema('Money', value.amount);
  return typeof value.basisId === 'string' && value.basisId.length > 0 && typeof value.complete === 'boolean';
}

export function resolveWorkflowPolicy(input: PolicyInput): Readonly<PolicyReport> {
  const request = parseEngineRequest(input.request, input.release);
  assertSchema('EngineRef', input.source.ref);
  if (!Number.isFinite(Date.parse(input.checkedAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(input.checkedAt)) throw new ContractError('INVALID_REQUEST', ['/checkedAt']);
  const source = input.source;
  const browse: Check[] = [
    check('identity', source.ref.kind === 'merchant' && source.ref.id !== source.ref.merchantId ? 'fail' : 'pass', 'SOURCE_IDENTITY_CHECKED'),
    check('entityMode', source.ref.kind === request.mode ? 'pass' : 'fail', source.ref.kind === request.mode ? 'ENTITY_MODE_MATCHED' : 'ENTITY_MODE_MISMATCH'),
    booleanCheck('current', source.current, input, 'SOURCE_ENTITY_NOT_CURRENT'),
    booleanCheck('callerAccess', source.callerAccess, input, 'SOURCE_ACCESS_DENIED'),
    booleanCheck('scope', source.discoveryScope, input, 'OUTSIDE_DISCOVERY_SCOPE'),
  ];
  const selection = resolveSelection(input.release, request.selection);
  if (selection.state === 'unmapped') browse.push(check('mapping', 'unsupported', 'UNMAPPED_SELECTION'));
  if (request.sourceScope?.merchantId && request.sourceScope.merchantId !== source.ref.merchantId) browse.push(check('merchantScope', 'fail', 'OUTSIDE_MERCHANT_SCOPE'));
  const match: Check[] = [check('requestBinding', source.requestBinding === requestBinding(request) ? 'pass' : 'fail', source.requestBinding === requestBinding(request) ? 'REQUEST_BINDING_VERIFIED' : 'CONSTRAINT_BINDING_MISMATCH')];
  const workflowRead = readFact('workflow', source.workflow, input, validWorkflow);
  const workflow = workflowRead.value;
  let composed: ReturnType<typeof composeConstraints> = { constraints: [], conflicts: [] };
  if (workflow) {
    try { composed = composeConstraints(workflow.layers); }
    catch { composed = { constraints: [], conflicts: [{ key: 'workflow', code: 'INVALID_CONSTRAINT' }] }; }
    if (composed.conflicts.length) match.push(check('policy', 'fail', 'POLICY_CONFIGURATION_CONFLICT'));
  }
  for (const [index, filter] of request.filters.entries()) {
    const key = `filter:${index}:${filter.kind}`;
    const common = filter.kind === 'catalog_area' || filter.kind === 'merchant_open';
    if (!common && !workflow) { match.push({ ...workflowRead.result, key }); continue; }
    if (!common && !workflow!.supportedFilters.includes(filter.kind)) { match.push(check(key, 'unsupported', 'UNSUPPORTED_CAPABILITY')); continue; }
    switch (filter.kind) {
      case 'workflow_kind':
        match.push(check(key, workflow!.kind === filter.value ? 'pass' : 'fail', workflow!.kind === filter.value ? 'WORKFLOW_MATCHED' : 'WORKFLOW_MISMATCH', workflowRead.result.evidence));
        break;
      case 'party': {
        const read = readFact(key, source.partyCapacity, input, value => { quantity(value); return value.unitId === 'person'; });
        if (read.value) {
          const party = filter.adults + (filter.children ?? 0) + (filter.infants ?? 0);
          const bounds = composed.constraints.find(rule => rule.key === 'party');
          const fit = quantity(read.value) >= BigInt(party) * 1_000_000n && (!bounds || bounds.type !== 'bounds'
            || ((bounds.min === undefined || party >= bounds.min) && (bounds.max === undefined || party <= bounds.max)));
          match.push(check(key, fit ? 'pass' : 'fail', fit ? 'PARTY_CAPACITY_SATISFIED' : 'PARTY_CAPACITY_EXCEEDED', read.result.evidence));
        } else match.push(read.result);
        break;
      }
      case 'required_availability': {
        const requiredModules = intervalModules[workflow!.kind];
        if (!requiredModules) { match.push(check(key, 'unsupported', 'WORKFLOW_FEASIBILITY_NOT_IMPLEMENTED')); break; }
        match.push(booleanCheck(`${key}:available`, source.availability, input, 'NOT_AVAILABLE'));
        const read = readFact(key, source.availableInterval, input, intervalValid);
        if (!filter.end) match.push(check(key, 'unknown', 'INTERVAL_END_REQUIRED'));
        else if (read.value) {
          const fits = Date.parse(read.value.start) <= Date.parse(filter.start) && Date.parse(read.value.end) >= Date.parse(filter.end);
          match.push(check(key, fits ? 'pass' : 'fail', fits ? 'WHOLE_INTERVAL_SATISFIED' : 'INTERVAL_NOT_COVERED', read.result.evidence));
          for (const rule of composed.constraints) if (rule.type === 'bounds' && (rule.key === 'notice' || rule.key === 'duration')) {
            const milliseconds = rule.key === 'notice' ? Date.parse(filter.start) - Date.parse(input.checkedAt) : Date.parse(filter.end) - Date.parse(filter.start);
            const fit = (rule.min === undefined || milliseconds >= rule.min * 60_000) && (rule.max === undefined || milliseconds <= rule.max * 60_000);
            match.push(check(`${key}:${rule.key}`, fit ? 'pass' : 'fail', fit ? 'TEMPORAL_BOUND_SATISFIED' : 'TEMPORAL_BOUND_FAILED'));
          }
        } else match.push(read.result);
        const modules = new Set([...requiredModules, ...workflow!.modules]);
        if (modules.has('resources')) match.push(booleanCheck(`${key}:resources`, source.resourcesReady, input, 'REQUIRED_RESOURCE_UNAVAILABLE'));
        if (modules.has('route')) match.push(booleanCheck(`${key}:route`, source.serviceArea, input, 'ROUTE_NOT_SERVICEABLE'));
        break;
      }
      case 'service_area': match.push(booleanCheck(key, source.serviceArea, input, 'OUTSIDE_SERVICE_AREA')); break;
      case 'merchant_open': match.push(booleanCheck(key, source.merchantOpen, input, 'MERCHANT_CLOSED')); break;
      case 'catalog_area': {
        const read = readFact(key, source.catalogArea, input, value => typeof value === 'string');
        match.push(read.value === undefined ? read.result : check(key, read.value === filter.areaId ? 'pass' : 'fail', read.value === filter.areaId ? 'CATALOG_AREA_MATCHED' : 'CATALOG_AREA_MISMATCH', read.result.evidence));
        break;
      }
      case 'fulfillment': {
        const read = readFact(key, source.fulfillment, input, value => Array.isArray(value) && value.every(entry => typeof entry === 'string'));
        const allowed = composed.constraints.find(rule => rule.key === 'fulfillment');
        const fits = read.value?.includes(filter.method) && (!allowed || allowed.type !== 'allowed_set' || allowed.values.includes(filter.method));
        match.push(read.value === undefined ? read.result : check(key, fits ? 'pass' : 'fail', fits ? 'FULFILLMENT_SUPPORTED' : 'FULFILLMENT_UNSUPPORTED', read.result.evidence));
        break;
      }
      case 'listed_price':
      case 'comparable_total': {
        const read = readFact(key, filter.kind === 'listed_price' ? source.listedPrice : source.comparableTotal, input, priceValid);
        const basis = filter.kind === 'listed_price' ? filter.basisId : filter.scopeId;
        if (!read.value) match.push(read.result);
        else if (read.value.basisId !== basis || (filter.kind === 'comparable_total' && !read.value.complete)) match.push(check(key, 'unknown', 'PRICE_BASIS_UNRESOLVED'));
        else {
          const minimum = filter.kind === 'listed_price' ? filter.min : undefined;
          const maximum = filter.max;
          if ((minimum && minimum.currency !== read.value.amount.currency) || (maximum && maximum.currency !== read.value.amount.currency)) match.push(check(key, 'unknown', 'INCOMPATIBLE_CURRENCY'));
          else {
            const fits = (!minimum || read.value.amount.minor >= minimum.minor) && (!maximum || read.value.amount.minor <= maximum.minor);
            match.push(check(key, fits ? 'pass' : 'fail', fits ? 'PRICE_REQUIREMENT_SATISFIED' : 'BUDGET_EXCEEDED', read.result.evidence));
          }
        }
        break;
      }
      case 'required_attributes': {
        if (!filter.values.every(attribute => input.attributeRegistry && Object.hasOwn(input.attributeRegistry, attribute.key)
          && Array.isArray(input.attributeRegistry[attribute.key]) && input.attributeRegistry[attribute.key]!.includes(attribute.valueId))) {
          match.push(check(key, 'unsupported', 'UNREGISTERED_ATTRIBUTE')); break;
        }
        const read = readFact(key, source.attributes, input, value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(entry => typeof entry === 'string'));
        if (!read.value || filter.values.some(attribute => read.value![attribute.key] === undefined)) match.push(read.value ? check(key, 'unknown', 'REQUIRED_FACT_UNKNOWN') : read.result);
        else {
          const fits = filter.values.every(attribute => read.value![attribute.key] === attribute.valueId);
          match.push(check(key, fits ? 'pass' : 'fail', fits ? 'REQUIRED_ATTRIBUTES_MATCHED' : 'REQUIRED_ATTRIBUTE_MISMATCH', read.result.evidence));
        }
      }
    }
  }
  const canBrowse = andDecisions(browse);
  const matchesHardRequest = andDecisions([canBrowse, ...match]);
  const ownerIntegration = check('ownerIntegration', 'unsupported', 'OWNER_INTEGRATION_NOT_CONNECTED');
  const operations = andDecisions([canBrowse, workflowRead.result, ownerIntegration]);
  return deepFreeze({ ref: structuredClone(source.ref), ...(workflow ? { workflow: { kind: workflow.kind, version: workflow.version, ref: structuredClone(workflow.ref) } } : {}),
    decisions: { canBrowse, matchesHardRequest, canSubmitRequest: operations, canTransact: andDecisions([matchesHardRequest, workflowRead.result, ownerIntegration]) },
    checks: [...browse, workflowRead.result, ...match, ownerIntegration], composed,
    requiredAcknowledgements: composed.constraints.flatMap(rule => rule.type === 'requirements' ? rule.values : []),
    policyVersion: '1', checkedAt: input.checkedAt, businessEffect: 'none' });
}
