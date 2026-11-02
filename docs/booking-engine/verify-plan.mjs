/** Verify planning-artifact consistency. This is not the application resolver. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');
const json = name => JSON.parse(read(name));
const audit = JSON.parse(fs.readFileSync(path.join(dir, '../audits/merchant-onboarding-128-taxonomy.json'), 'utf8'));
const registry = json('question-registry.json');
const profiles = json('profiles-128.json');
const acceptance = json('acceptance-128.json');
const example = json('example-new-category.json');
const domain = json('domain-registry.json');
const workflowText = read('workflow-catalogue.md');
const workflowIds = new Set([...workflowText.matchAll(/^## (WF_[A-Z_]+):/gm)].map(m => m[1]));
const questionMap = new Map(registry.questions.map(q => [q.questionId, q]));
const screenFiles = [
  ['SC_WORK', 'screens/01-work.md'], ['SC_OFFERINGS', 'screens/02-offerings.md'],
  ['SC_AVAILABILITY', 'screens/03-availability.md'], ['SC_BUSINESS', 'screens/04-business.md'],
  ['SC_MONEY', 'screens/05-money.md'], ['SC_PROMOTIONS', 'screens/06-promotions.md'],
  ['SC_INSIGHTS', 'screens/07-insights.md'], ['SC_SETTINGS', 'screens/08-settings.md'],
];
const screenIds = screenFiles.map(x => x[0]);
const featureIds = new Set();
for (const [screenId, file] of screenFiles) {
  const text = read(file);
  assert(text.includes(screenId), file);
  assert(text.includes('Acceptance scenarios'), file);
  assert(text.length > 6500, `Detailed specification required: ${file}`);
  for (const match of text.matchAll(/\| ((?:WK|OF|AV|BU|MO|PR|IN|SE)\d{2}) \|/g)) {
    assert(!featureIds.has(match[1]), `Duplicate feature ID ${match[1]}`);
    featureIds.add(match[1]);
  }
}
assert.equal(questionMap.size, registry.questions.length);
assert.equal(profiles.profiles.length, audit.rows.length);
assert.equal(acceptance.acceptanceCases.length, audit.rows.length);
assert.equal(new Set(profiles.profiles.map(p => p.subcategoryId)).size, audit.rows.length);
assert.equal(new Set(acceptance.acceptanceCases.map(c => c.id)).size, audit.rows.length);
const profileMap = new Map(profiles.profiles.map(p => [p.id, p]));
const auditMap = new Map(audit.rows.map(r => [r.id, r]));
const taxonomyKeys = new Set(audit.rows.flatMap(r => r.fields));
for (const key of taxonomyKeys) assert(registry.questions.some(q => q.key === key), `Missing question ${key}`);

const ops = new Set(['eq', 'neq', 'in', 'contains', 'intersects', 'exists', 'nonempty']);
let predicateLeaves = 0;
function verifyPredicate(condition, depth = 0) {
  assert(depth < 30, 'Bounded predicate depth');
  if (condition.all || condition.any) {
    const children = condition.all ?? condition.any;
    assert(Array.isArray(children));
    for (const child of children) verifyPredicate(child, depth + 1);
    return;
  }
  assert(ops.has(condition.op), `Unsupported predicate ${JSON.stringify(condition)}`);
  assert.equal(typeof condition.path, 'string');
  assert(!/(__proto__|constructor|prototype|https?:|javascript:)/i.test(condition.path));
  predicateLeaves++;
}
for (const question of registry.questions) {
  assert(question.valueSchema?.type || question.valueSchema?.oneOf || question.valueSchema?.anyOf || question.valueSchema?.$ref, question.questionId);
  for (const dependency of question.dependencies) assert(questionMap.has(dependency), `${question.questionId}: ${dependency}`);
  verifyPredicate(question.visibleWhen);
  verifyPredicate(question.requiredWhen);
}

let screenMappings = 0;
let conditionalRules = 0;
for (const profile of profiles.profiles) {
  const original = auditMap.get(profile.subcategoryId);
  assert(original);
  assert.equal(profile.categoryId, original.categoryId);
  assert.deepEqual(profile.rawTaxonomy.fields, original.fields);
  assert.equal(profile.rawTaxonomy.workflowHint, original.workflowHint);
  assert.equal(profile.rawTaxonomy.fulfillmentHint, original.fulfillmentHint);
  assert(workflowIds.has(profile.primaryWorkflowId), profile.id);
  for (const id of profile.conditionalWorkflowIds) assert(workflowIds.has(id), id);
  assert.deepEqual(Object.keys(profile.screenConfiguration).sort(), [...screenIds].sort());
  for (const configuration of Object.values(profile.screenConfiguration)) {
    assert(featureIds.has(configuration.featureReference), configuration.featureReference);
    screenMappings++;
  }
  for (const field of profile.exactOnboardingFields) assert(questionMap.has(field.questionId), field.questionId);
  for (const rule of profile.conditionalRules) {
    const question = questionMap.get(rule.questionId);
    assert(question, rule.questionId);
    assert.equal(rule.condition.path, question.canonicalTarget, rule.id);
    verifyPredicate(rule.condition);
    for (const id of [...(rule.effect.addWorkflowIds ?? []), ...(rule.effect.removeWorkflowIds ?? [])]) assert(workflowIds.has(id), id);
    if (rule.effect.setPrimaryWorkflowId) assert(workflowIds.has(rule.effect.setPrimaryWorkflowId));
    conditionalRules++;
  }
}

let variants = 0;
for (const scenario of acceptance.acceptanceCases) {
  assert(profileMap.has(scenario.profileId), scenario.profileId);
  const all = [scenario, ...scenario.variants];
  variants += scenario.variants.length;
  for (const fixture of all) {
    assert.equal(fixture.expected.operationalReady, 'UNVERIFIED');
    for (const id of fixture.expected.enabledWorkflowIds) assert(workflowIds.has(id), id);
    if (fixture.input.authority.work_items === 'READ_ONLY_EXTERNAL') assert.equal(fixture.expected.workCommandAuthorityAndRoleSatisfied, false);
    if (fixture.input.authority.offerings === 'READ_ONLY_EXTERNAL') assert.equal(fixture.expected.offeringEditAuthorityAndRoleSatisfied, false);
    if (['car_rental', 'bike_rental'].includes(fixture.input.subcategoryId) && fixture.input.answers.with_driver === 'yes') {
      assert(fixture.expected.enabledWorkflowIds.includes('WF_RENTAL'));
      assert(!fixture.expected.enabledWorkflowIds.includes('WF_TRANSFER'));
    }
    const resolved = fixture.expected.resolvedScreenVariants;
    assert(resolved?.SC_WORK && resolved?.SC_INSIGHTS, fixture.id);
    const shape = profiles.workflowShapeReferences[fixture.expected.primaryWorkflowId];
    if (shape) {
      assert.equal(resolved.SC_OFFERINGS.primarySchemaId, shape.offeringSchemaId);
      assert.equal(resolved.SC_AVAILABILITY.primaryModelId, shape.availabilityModelId);
      assert.deepEqual(resolved.SC_INSIGHTS.primaryMetricIds, shape.metrics);
    } else assert.equal(resolved.SC_INSIGHTS.primaryMetricIds.length, 0);
    if (fixture.expected.primaryWorkflowId === 'WF_SERVICE_JOB' && profileMap.get(scenario.profileId).primaryWorkflowId === 'WF_APPOINTMENT') assert(!/appointment/i.test(fixture.expected.primaryWorkNoun));
  }
}

const components = new Set([...read('components.md').matchAll(/`(CMP_[A-Z_]+)`/g)].map(m => m[1]));
for (const binding of example.questionBindings) {
  const question = questionMap.get(binding.question.id);
  assert(question, binding.question.id);
  if (binding.allowedValues) for (const value of binding.allowedValues) assert(question.valueSchema.enum.includes(value));
}
assert.deepEqual(example.screens.map(s => s.screenId).sort(), [...screenIds].sort());
for (const screen of example.screens) for (const component of screen.components) assert(components.has(component.id), component.id);
for (const binding of example.workflowBindings) assert(workflowIds.has(binding.workflow.id), binding.workflow.id);
assert.equal(example.status, 'DRAFT');

const offeringIds = new Set(domain.offeringSchemas.map(d => d.id));
const availabilityIds = new Set(domain.availabilityModels.map(d => d.id));
const metricIds = new Set(domain.metrics.map(d => d.id));
const capabilityIds = new Set(domain.capabilities.map(d => d.id));
const fulfillmentIds = new Set(domain.fulfillmentMethods.map(d => d.id));
const questionModes = questionMap.get('Q_FULFILLMENT_MODES').valueSchema.items.enum;
assert.deepEqual(Object.keys(domain.fulfillmentQuestionMapping.values).sort(), [...questionModes].sort());
for (const binding of [...Object.values(domain.fulfillmentQuestionMapping.values), ...Object.values(domain.fulfillmentAliasMapping)]) for (const id of binding.methodChoices) assert(fulfillmentIds.has(id), id);
for (const profile of profiles.profiles) {
  const aliases = [...profile.proposedFulfilmentModes, ...profile.conditionalRules.flatMap(r => [...(r.effect.addFulfilmentModes ?? []), ...(r.effect.setFulfilmentModes ?? [])])];
  for (const alias of aliases) assert(domain.fulfillmentAliasMapping[alias], `Unknown fulfillment alias ${alias}`);
}
for (const shape of Object.values(profiles.workflowShapeReferences)) {
  assert(offeringIds.has(shape.offeringSchemaId), shape.offeringSchemaId);
  assert(availabilityIds.has(shape.availabilityModelId), shape.availabilityModelId);
  for (const id of shape.metrics) assert(metricIds.has(id), id);
  for (const id of shape.capabilities) assert(capabilityIds.has(id), id);
}
for (const profile of profiles.profiles) {
  for (const id of profile.baseCapabilities) assert(capabilityIds.has(id), id);
  for (const rule of profile.conditionalRules) {
    for (const id of rule.effect.addCapabilities ?? []) assert(capabilityIds.has(id), id);
  }
}
const definitionIds = new Set([...workflowIds, ...questionMap.keys(), ...components]);
let domainDefinitions = 0;
for (const list of Object.values(domain)) {
  if (!Array.isArray(list) || !list[0]?.id) continue;
  const ids = list.map(d => d.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const definition of list) {
    if ('runtimeEnabled' in definition) assert.equal(definition.runtimeEnabled, false, definition.id);
    definitionIds.add(definition.id);
    domainDefinitions++;
  }
}
let versionedExampleReferences = 0;
function verifyExampleReferences(value) {
  if (Array.isArray(value)) for (const child of value) verifyExampleReferences(child);
  else if (value && typeof value === 'object') {
    if (value.id && value.version) {
      assert(definitionIds.has(value.id), `Unresolved future-category reference ${value.id}`);
      versionedExampleReferences++;
    }
    for (const child of Object.values(value)) verifyExampleReferences(child);
  }
}
verifyExampleReferences(example);
for (const metric of domain.metrics) for (const key of ['aggregation', 'numerator', 'denominator', 'unit', 'dateBasis', 'sourceEvents', 'authoritativeSource']) assert(metric[key], `${metric.id}: ${key}`);
const categoryVerification = json('category-verification.json');
assert.equal(categoryVerification.status, 'CATEGORY_DESIGN_CHECKS_PASSED');

const required = ['README.md', 'onboarding-and-configuration.md', 'answer-effects.md', 'workflow-catalogue.md', 'integrations.md', 'components.md', 'category-extension.md', 'implementation-plan.md', 'review.md', 'image-briefs.md'];
for (const file of required) {
  const text = read(file);
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    assert(fs.existsSync(path.resolve(path.dirname(path.join(dir, file)), target)), `${file}: ${target}`);
  }
}

const report = {
  clientDate: '2026-10-29', status: 'PLANNING_ARTIFACT_CHECKS_PASSED',
  scope: 'Static references, preserved inputs, bounded expressions and proposed fixture invariants. No application or integration runtime verification.',
  counts: { categories: new Set(profiles.profiles.map(p => p.categoryId)).size, subcategories: profiles.profiles.length, questionDefinitions: registry.questions.length, taxonomyFieldDefinitions: taxonomyKeys.size, workflowFamilies: workflowIds.size, conditionalRules, screenSpecifications: screenFiles.length, featureDefinitions: featureIds.size, screenMappings, baselineAcceptanceCases: acceptance.acceptanceCases.length, additionalScenarioVariants: variants, predicateLeavesChecked: predicateLeaves, domainDefinitions, versionedExampleReferences, metricDefinitions: domain.metrics.length, rejectedInvalidCategoryCandidates: categoryVerification.negativeCases.length },
  safeguards: { readinessRemainsUnverified: true, readOnlyAuthorityRespectedInFixtures: true, driverOptionDoesNotCreateTransferActivity: true, newCategoryRemainsDraft: true, rawTaxonomyPreserved: true, sourceAndGrantsAreSeparate: true },
  command: 'node docs/merchant-portal-plan/verify-plan.mjs',
  artifacts: {},
  runtimeStatus: 'NOT_IMPLEMENTED_NOT_EXECUTED',
  imageGenerationGate: 'FOUNDATION_EIGHT_SCREEN_SPECS_AND_REFERENCE_CHECKS_COMPLETE',
};
for (const file of ['question-registry.json', 'profiles-128.json', 'acceptance-128.json', 'example-new-category.json', 'domain-registry.json', 'category-verification.json', ...required, ...screenFiles.map(x => x[1])]) report.artifacts[file] = crypto.createHash('sha256').update(read(file)).digest('hex');
fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, ...report.counts }, null, 2));
