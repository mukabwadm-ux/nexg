/** Documentation generation only. This file is not imported by the application. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(directory, '../../..');
const planDirectory = path.dirname(directory);
const sourceDirectory = path.join(workspace, 'docs/booking-engine/payload-reserve-plan/reconciliation');
const files = {
  profiles: path.join(sourceDirectory, 'effective-profiles-128.json'),
  workflows: path.join(sourceDirectory, 'effective-workflows.json'),
  sourceManifest: path.join(sourceDirectory, 'manifest.json'),
  audit: path.join(workspace, 'docs/audits/merchant-onboarding-128-taxonomy.json'),
  vocabulary: path.join(planDirectory, 'profiles-128.json'),
  views: path.join(directory, 'workflow-view-catalog.json'),
  confirmation: path.join(planDirectory, 'order-confirmation.md'),
};
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const relative = filename => path.relative(workspace, filename).split(path.sep).join('/');
const write = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n');
const unique = values => [...new Set(values)];
const sourceProfiles = read(files.profiles);
const sourceWorkflows = read(files.workflows);
const sourceManifest = read(files.sourceManifest);
const audit = read(files.audit);
const vocabulary = read(files.vocabulary);
const catalogue = read(files.views);
const sourceRows = sourceProfiles.rows;
const views = new Map(catalogue.views.map(view => [view.workflowId, view]));
const workflows = new Map(sourceWorkflows.workflows.map(workflow => [workflow.workflowId, workflow]));
const auditRows = new Map(audit.rows.map(row => [row.id, row]));
const vocabularyRows = new Map(vocabulary.profiles.map(profile => [profile.subcategoryId, profile]));
const knownModels = new Set(catalogue.views.flatMap(view => view.modelIds));

assert.equal(sourceRows.length, 128, 'Expected audited current 128 specialties.');
assert.equal(new Set(sourceRows.map(row => row.subcategoryId)).size, 128, 'Duplicate specialty identities.');
assert.equal(new Set(sourceRows.map(row => row.categoryId)).size, 21, 'Expected 21 current categories.');
assert.equal(catalogue.views.length, 18, 'Catalogue must include the 18 effective workflow graphs.');
assert.equal(views.size, 18, 'Duplicate workflow view identities.');
assert(views.has('WF_SPACE_RESERVATION_V1'), 'Explicit party/table/space view missing.');
assert.deepEqual(new Set(views.keys()), new Set(workflows.keys()), 'View catalogue and effective workflow identities disagree.');
assert(fs.readFileSync(files.confirmation, 'utf8').includes('Standard stock-backed orders proceed automatically'), 'Later user confirmation policy missing.');

function containsGenericAcceptance(value) {
  if (typeof value === 'string') return /\bAcceptOrder\b/.test(value);
  if (Array.isArray(value)) return value.some(containsGenericAcceptance);
  if (value && typeof value === 'object') return Object.values(value).some(containsGenericAcceptance);
  return false;
}
for (const view of views.values()) {
  for (const key of ['queueFields', 'detailSections', 'primaryActions', 'stageLabels']) {
    assert(Array.isArray(view[key]) && view[key].length, `${view.workflowId}: ${key} missing`);
  }
  assert(!containsGenericAcceptance(view.primaryActions), `${view.workflowId}: generic AcceptOrder cannot be a primary action`);
  assert(view.modelIds.every(id => typeof id === 'string'), view.workflowId);
}

let bindingCount = 0;
let ruleCount = 0;
let candidateReferenceCount = 0;
let ruleModelReferenceCount = 0;
const displayNameDiscrepancies = [];

function validateRuleModels(rule, specialty) {
  const effects = rule.effects ?? {};
  const refs = [
    ...(effects.addModels ?? []),
    ...(effects.suppressModels ?? []),
    ...(effects.replacePrimaryModel ? [effects.replacePrimaryModel] : []),
  ];
  for (const model of refs) {
    assert(knownModels.has(model), `${specialty}: rule ${rule.id} references unknown model ${model}`);
    ruleModelReferenceCount++;
  }
}

function viewReference(workflowId) {
  assert(views.has(workflowId), `Unknown workflow view ${workflowId}`);
  const view = views.get(workflowId);
  return {
    workflowId,
    viewRef: `workflow-view-catalog.json#${workflowId}`,
    workNoun: view.workNoun,
    queueFields: view.queueFields,
    detailSections: view.detailSections,
    stageLabels: view.stageLabels,
    primaryActions: view.primaryActions,
    confirmation: view.confirmation,
    defaultViews: view.defaultViews,
    optionalVariants: view.optionalVariants,
    restrictions: view.restrictions,
  };
}

const profiles = sourceRows.map(row => {
  const original = auditRows.get(row.subcategoryId);
  assert(original, row.subcategoryId);
  assert.equal(row.categoryId, original.categoryId, row.subcategoryId);
  if (row.name !== original.name) displayNameDiscrepancies.push({
    subcategoryId: row.subcategoryId,
    categoryId: row.categoryId,
    sourceName: row.name,
    auditedTaxonomyName: original.name,
    displayName: original.name,
    treatment: 'Display the audited taxonomy label; preserve the discrepant effective-source label and report it. No input registry is rewritten.',
  });
  assert.deepEqual(row.sourceQuestionKeys, original.fields, `${row.subcategoryId}: source fields changed`);
  assert.equal(row.sourceQuestionIds.length, row.sourceQuestionKeys.length, `${row.subcategoryId}: question identity coverage`);
  assert(views.has(row.sourceWorkflowId), `${row.subcategoryId}: source workflow is unknown`);
  assert(knownModels.has(row.defaultModelId), `${row.subcategoryId}: default model is unknown`);

  const candidateModels = row.candidateModelIds ?? [row.defaultModelId];
  const options = row.workflowOptionsByModel ?? {};
  const candidateViews = candidateModels.map(modelId => {
    assert(knownModels.has(modelId), `${row.subcategoryId}: candidate model ${modelId} unknown`);
    const workflowIds = options[modelId] ?? (modelId === row.defaultModelId ? [row.sourceWorkflowId] : []);
    assert(workflowIds.length, `${row.subcategoryId}: model ${modelId} lacks explicit workflow options`);
    for (const id of workflowIds) {
      assert(views.has(id), `${row.subcategoryId}: candidate workflow ${id} unknown`);
      assert(views.get(id).modelIds.includes(modelId), `${row.subcategoryId}: ${id} incompatible with ${modelId}`);
      candidateReferenceCount++;
    }
    return {
      modelId,
      selection: 'Candidate only. Select the actual offering/method and satisfy its guard; do not activate all candidates.',
      workflowViews: workflowIds.map(viewReference),
    };
  });

  const effectiveBindings = (row.bindings ?? []).map(binding => {
    assert(knownModels.has(binding.modelId), `${row.subcategoryId}: binding model ${binding.modelId} unknown`);
    assert(Number.isInteger(binding.bindingIndex), `${row.subcategoryId}: binding identity missing`);
    bindingCount++;
    return {
      bindingIndex: binding.bindingIndex,
      modelId: binding.modelId,
      composition: binding.composition,
      condition: binding.condition,
      requiredQuestionIds: binding.requiredQuestionIds,
      requiresOfferingSelection: binding.requiresOfferingSelection,
      requiresSetupAndAuthority: binding.requiresSetupAndAuthority,
      selectionPolicy: binding.selectionPolicy,
      note: binding.note,
      createsWork: false,
    };
  });
  assert.equal(new Set(effectiveBindings.map(binding => binding.bindingIndex)).size, effectiveBindings.length, `${row.subcategoryId}: duplicate binding index`);
  const rules = (row.rules ?? []).map(rule => {
    validateRuleModels(rule, row.subcategoryId);
    assert.equal(rule.createsWork, false, rule.id);
    ruleCount++;
    return {
      id: rule.id,
      scope: rule.scope,
      condition: rule.condition,
      effects: rule.effects,
      requiredQuestionIds: rule.requiredQuestionIds,
      note: rule.note,
      createsWork: false,
    };
  });
  assert.equal(new Set(rules.map(rule => rule.id)).size, rules.length, `${row.subcategoryId}: duplicate rule identity`);
  const old = vocabularyRows.get(row.subcategoryId);
  return {
    id: `WORK_${row.subcategoryId}`,
    status: 'DESIGN_ONLY_NOT_RUNTIME_ACCEPTANCE',
    categoryId: row.categoryId,
    categoryName: original.categoryName,
    subcategoryId: row.subcategoryId,
    specialtyName: original.name,
    sourceName: row.name,
    sourceProfileId: row.sourceProfileId,
    sourceWorkflowId: row.sourceWorkflowId,
    defaultModelId: row.defaultModelId,
    vocabulary: old?.vocabulary ?? { workSingular: views.get(row.sourceWorkflowId).workNoun },
    vocabularySourcePolicy: 'Older profile vocabulary only. No older conditional rule effects are copied or executed.',
    specialtyNeeds: row.specialtyNeeds,
    sourceQuestionKeys: row.sourceQuestionKeys,
    sourceQuestionIds: row.sourceQuestionIds,
    enablementGuard: row.enablementGuard,
    basePolicy: row.basePolicy,
    candidateModels,
    candidateViews,
    effectiveBindings,
    effectiveRules: rules,
    sourceReadiness: row.candidateDataClassPolicy,
    selectedOfferingPolicy: 'Actual selected offering/model/method plus current scoped answers determine the Work graph. Missing or contradictory setup stays unresolved; no arbitrary appointment/order fallback.',
    confirmationPolicy: {
      normal: 'AUTOMATIC_AUTHORITATIVE_SOURCE_CONFIRMATION',
      reference: '../order-confirmation.md',
      sourcePrecedence: 'Later explicit user correction overrides older AcceptOrder/merchant-approval default wording retained in reconciliation snapshots.',
      orderStockAvailable: 'Confirm automatically using native/API/webhook authority and reuse the confirmed stock allocation.',
      orderStockUnavailable: 'Show unavailable/customer alternatives; do not create generic merchant review.',
      orderStockUnknown: 'System confirmation pending/unavailable with source recovery; not a merchant acceptance task.',
      humanReview: 'Only a named enabled supported exception that matches the actual work, has a reason/actor and requires human judgment. A category alone cannot create it.',
    },
    actionPolicy: 'Only current workflow/version actions allowed by the record owner, viewer scope and actual record state. Read-only external work displays the source and permitted source destination; local simulation is labelled sample.',
    linkedWorkPolicy: 'Show parent/root identity and actual linked executions; do not instantiate work, reserve capacity or create charges from configuration alone.',
    runtimeEnabled: false,
    createsWork: false,
  };
});

const categoryNames = unique(profiles.map(profile => profile.categoryId)).map(categoryId => ({
  categoryId,
  categoryName: profiles.find(profile => profile.categoryId === categoryId).categoryName,
  specialtyCount: profiles.filter(profile => profile.categoryId === categoryId).length,
}));
const inputProvenance = Object.fromEntries(Object.entries(files).map(([key, filename]) => [key, { path: relative(filename), sha256: hash(filename) }]));
const output = {
  version: catalogue.version ?? '1.0.0-proposed',
  date: '2026-10-31',
  status: 'WORK_ADAPTATION_DESIGN_ONLY',
  sourceManifestStatus: sourceManifest.status,
  sourcePrecedence: 'Current reconciled selected-offering bindings and rules; later user automatic-confirmation policy wins over older manual-acceptance wording. Original taxonomy identities remain unchanged.',
  sourceProfileCount: profiles.length,
  sourceCategoryCount: categoryNames.length,
  viewFamilyCount: views.size,
  categoryNames,
  inputProvenance,
  displayNameDiscrepancies,
  profiles,
};
write('profiles-128.json', output);

const text = value => String(value ?? '').replaceAll('|', '/').replaceAll('\n', ' ');
const fieldText = value => typeof value === 'string' ? value : value.label ?? value.key ?? value.id ?? JSON.stringify(value);
const shortFields = values => (values ?? []).map(fieldText).map(text).join(', ');
const md = [
  '# Work screen adaptation for all 128 specialties',
  '',
  'Date: 31 October 2026. This is the explicit design review matrix, not runtime acceptance. One Work shell consumes selected-offering workflow views; categories do not create 128 separate applications.',
  '',
  'Current reconciled bindings determine eligible models and workflow variants. Later automatic-confirmation policy governs normal stock/resource-backed work. Named exceptional human review is conditional, never a generic order approval queue.',
  '',
  'Full guards, current rule identities, required questions, candidate source policies, view stages/actions and source hashes are in profiles-128.json. Workflow view references resolve through workflow-view-catalog.json. All candidates require actual selection and setup.',
  '',
];
for (const category of categoryNames) {
  md.push(`## ${category.categoryName}`, '', `${category.specialtyCount} specialties.`, '',
    '| Specialty and work vocabulary | Default / eligible model views | Core queue fields | Stage/action references | Specialty behavior |',
    '| --- | --- | --- | --- | --- |');
  for (const p of profiles.filter(profile => profile.categoryId === category.categoryId)) {
    const primary = views.get(p.sourceWorkflowId);
    const eligible = p.candidateViews.map(model => `${model.modelId}: ${model.workflowViews.map(view => view.workflowId).join(', ')}`).join('; ');
    const reference = `workflow-view-catalog.json#${p.sourceWorkflowId}`;
    md.push(`| ${text(p.specialtyName)}; ${text(p.vocabulary.workSingular)} | ${text(p.defaultModelId)}; ${text(eligible)} | ${shortFields(primary.queueFields)} | [${p.sourceWorkflowId}](${reference}); ${shortFields(primary.stageLabels)}; actions: ${shortFields(primary.primaryActions)} | ${text(p.specialtyNeeds)} |`);
  }
  md.push('');
}
md.push('## Shared conditional behavior', '',
  'Resolve effectiveBindings and effectiveRules before rendering the selected offering. Missing setup or contradictory answers produce an explained configuration state. Optional activities remain separate; parent/child work shares identities and resources. Human review is enabled only by an explicit matching exception. The machine-confirmed ACCEPTED state is not a merchant Accept button.', '',
  'Images illustrate two configured populated states only. They do not validate all record actions, source contracts, accessibility or all 128 runtime journeys.', '');
fs.writeFileSync(path.join(directory, 'profiles-128.md'), md.join('\n'));

const artifacts = Object.fromEntries(['profiles-128.json', 'profiles-128.md'].map(name => [name, hash(path.join(directory, name))]));
const report = {
  date: '2026-10-31',
  status: 'WORK_ADAPTATION_DESIGN_CHECKS_PASSED',
  scope: 'Identity, source-field, selected-model binding, rule-model and workflow-view reference checks only. No application, connector, workflow execution or runtime merchant acceptance tested.',
  counts: {
    categories: categoryNames.length,
    subcategories: profiles.length,
    effectiveWorkflowViews: views.size,
    candidateWorkflowReferences: candidateReferenceCount,
    effectiveBindings: bindingCount,
    effectiveRules: ruleCount,
    ruleModelReferences: ruleModelReferenceCount,
    displayNameDiscrepancies: displayNameDiscrepancies.length,
  },
  safeguards: {
    originalIdentitiesPreserved: true,
    exactSourceFieldsPreserved: true,
    onlyReconciledConditionalRulesUsed: true,
    categoryDefaultsDoNotActivateWork: true,
    genericAcceptOrderPrimaryActionsAbsent: true,
    laterAutomaticConfirmationPolicyApplied: true,
    runtimeRemainsUnverified: true,
  },
  inputProvenance,
  displayNameDiscrepancies,
  artifacts,
  runtimeStatus: 'NOT_IMPLEMENTED_NOT_VERIFIED_BY_THIS_PLAN',
  command: 'node docs/merchant-portal-plan/work-adaptation/generate-work-matrix.mjs',
};
write('verification.json', report);
console.log(JSON.stringify({ status: report.status, ...report.counts }, null, 2));
