// Run from any directory: node <path-to-settings-concept>/verify-coverage.mjs
// Reads canonical source files; writes only verification.json beside this script.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);
const sourcePaths = {
  taxonomy: 'packages/contracts/src/taxonomy.ts',
  profiles: 'docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-profiles-128.json',
  screens: 'docs/merchant-portal-plan/offering-map/all-screens-and-workflows.json',
  approvedAdditions: 'docs/merchant-portal-plan/offering-map/approved-profile-additions.json',
  offeringCatalogue: 'docs/merchant-portal-plan/offering-map/catalogue.json',
  models: 'docs/merchant-portal-plan/payload-reserve-plan/models.json',
  workflows: 'docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-workflows.json',
  domains: 'docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-domain-registry.json',
  questions: 'docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-question-registry.json',
};
const groupLabels = {
  ACCOUNT_SECURITY: 'Account & security', NOTIFICATIONS: 'Notifications',
  PREFERENCES: 'Preferences', CONNECTIONS: 'Connections',
  API_WEBHOOKS: 'API & webhooks', DATA_PRIVACY: 'Data & privacy',
};
const report = {
  status: 'FAILED', runtimeEnabled: false, checkedAtUtc: new Date().toISOString(),
  command: 'node docs/merchant-portal-plan/settings-concept/verify-coverage.mjs',
  coverageMeaning: 'Independent structural comparison against canonical taxonomy, reconciled profiles, complete offering routes and approved design additions. No runtime activation is performed.',
  counts: {}, checks: [], sourceHashes: {},
  limits: [
    'Does not execute a settings resolver, save operation, identity flow, provider connection or message delivery.',
    'Does not prove authorization enforcement, accessibility conformance, usability or complete combinations of states.',
    'Operational model concerns and alert topics are proposed design decisions; source parity does not approve or implement them.',
    'Does not grant permissions, activate approved routes or prove provider/native/manual operation support.',
    'Rerun after source edits; a changed source hash requires explicit coverage review rather than automatic acceptance.',
    'Requires the existing project TypeScript development dependency; no dependencies are installed.',
  ],
};
const check = (name, fn) => {
  try { fn(); report.checks.push({ name, status: 'PASSED' }); }
  catch (error) { report.checks.push({ name, status: 'FAILED', reason: error.message }); }
};
const sorted = (values) => [...values].sort();
const routeKey = (r) => [r.subcategoryId, r.templateId, r.modelId].join('/');
const unique = (items, key, label) => assert.equal(new Set(items.map(key)).size, items.length, label);
const pointer = (object, value) => value.split('/').slice(1).reduce((v, part) => v?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], object);

// Parse only static identity/name properties from the real TypeScript AST.
// This avoids evaluating source code or trusting a generated coverage taxonomy.
function readTaxonomy(source, ts) {
  const file = ts.createSourceFile('taxonomy.ts', source, ts.ScriptTarget.Latest, true);
  assert.equal(file.parseDiagnostics.length, 0, 'Canonical taxonomy must parse');
  let array;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'MERCHANT_TAXONOMY') {
      array = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(array && ts.isArrayLiteralExpression(array), 'Static MERCHANT_TAXONOMY array required');
  const property = (node, name) => node.properties.find(p => p.name?.getText(file) === name)?.initializer;
  const text = (node, name) => {
    const value = property(node, name);
    assert.ok(value && ts.isStringLiteral(value), `Static ${name} required`);
    return value.text;
  };
  return array.elements.map(category => ({
    id: text(category, 'id'), name: text(category, 'name'),
    subcategories: property(category, 'subcategories').elements.map(sub => ({
      id: text(sub, 'id'), name: text(sub, 'name'), categoryId: text(sub, 'categoryId'),
    })),
  }));
}

try {
  const coverage = JSON.parse(await readFile(path.join(here, 'coverage.json'), 'utf8'));
  const sourceBytes = Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([key, file]) => [key, await readFile(path.join(root, file))])));
  const canonical = Object.fromEntries(Object.entries(sourceBytes).filter(([key]) => key !== 'taxonomy').map(([key, bytes]) => [key, JSON.parse(bytes)]));
  const taxonomy = readTaxonomy(sourceBytes.taxonomy.toString('utf8'), require('typescript'));
  const taxonomySubs = taxonomy.flatMap(c => c.subcategories);
  const profiles = canonical.profiles.rows;
  const screenRows = canonical.screens.specialtyScreenCoverage;
  const additions = canonical.approvedAdditions;
  const rows = coverage.subcategories;
  const fullRouteCount = screenRows.reduce((sum, row) => sum + row.offeringRoutes.reduce((n, offering) => n + offering.routes.length, 0), 0);
  const sourceOfferingCount = screenRows.reduce((sum, row) => sum + row.offeringRoutes.length, 0);
  report.counts = { categories: taxonomy.length, subcategories: taxonomySubs.length, sharedGroups: Object.keys(groupLabels).length, possibleOperationalModels: canonical.models.models.length, approvedAdditionalRoutes: additions.approval.routes.length, subcategoriesWithApprovedAdditions: additions.profiles.length, specialtyOfferingMappings: sourceOfferingCount, fullOfferingModelRoutes: fullRouteCount };

  check('Source identity and SHA-256 parity', () => {
    assert.deepEqual(sorted(Object.keys(coverage.sources)), sorted(Object.keys(sourcePaths)));
    for (const [key, file] of Object.entries(sourcePaths)) {
      const hash = createHash('sha256').update(sourceBytes[key]).digest('hex');
      report.sourceHashes[key] = { path: file, sha256: hash };
      assert.equal(coverage.sources[key].path, file, `${key}: source path`);
      assert.equal(coverage.sources[key].sha256, hash, `${key}: source changed`);
    }
  });
  check('Canonical scope and declared counts', () => {
    assert.equal(taxonomy.length, 21); assert.equal(taxonomySubs.length, 128);
    assert.equal(additions.approval.routes.length, 21);
    assert.deepEqual(coverage.counts, report.counts);
  });
  check('Unique exact category and subcategory identities', () => {
    unique(taxonomy, r => r.id, 'Canonical category IDs'); unique(taxonomySubs, r => r.id, 'Canonical subcategory IDs');
    unique(coverage.categories, r => r.categoryId, 'Coverage category IDs'); unique(rows, r => r.subcategoryId, 'Coverage subcategory IDs');
    assert.deepEqual(sorted(coverage.categories.map(r => r.categoryId)), sorted(taxonomy.map(r => r.id)));
    for (const sourceRows of [rows, profiles, screenRows]) assert.deepEqual(sorted(sourceRows.map(r => r.subcategoryId)), sorted(taxonomySubs.map(r => r.id)));
    for (const sub of taxonomySubs) {
      const row = rows.find(r => r.subcategoryId === sub.id);
      assert.equal(row.categoryId, sub.categoryId, `${sub.id}: category`); assert.equal(row.name, sub.name, `${sub.id}: label`);
    }
    for (const category of taxonomy) {
      const row = coverage.categories.find(r => r.categoryId === category.id);
      assert.equal(row.name, category.name); assert.equal(row.subcategoryCount, category.subcategories.length);
      assert.deepEqual(row.subcategoryIds, category.subcategories.map(r => r.id));
    }
  });
  check('Baseline profile guards, alternative bindings, rules and policies', () => {
    for (const row of rows) {
      const p = profiles.find(r => r.subcategoryId === row.subcategoryId);
      for (const [target, source] of Object.entries({ baselineCandidateModelIds: 'candidateModelIds', rawDefaultEnablementGuard: 'enablementGuard', rawBindings: 'bindings', rawRules: 'rules', sourceBasePolicy: 'basePolicy', baselineModelContracts: 'modelContracts', workflowOptionsByModel: 'workflowOptionsByModel', sourceQuestionKeys: 'sourceQuestionKeys', sourceQuestionIds: 'sourceQuestionIds', candidateDataClassPolicy: 'candidateDataClassPolicy' })) assert.deepEqual(row[target], p[source], `${row.subcategoryId}: ${target}`);
      assert.equal(row.sourceProfileId, p.sourceProfileId); assert.equal(row.sourceWorkflowId, p.sourceWorkflowId);
      assert.equal(row.sourceProfileName, p.name, `${row.subcategoryId}: exact source label provenance`);
      for (const id of row.baselineCandidateModelIds) assert.deepEqual(row.intakeByModel[id], p.intakeByModel[id], `${row.subcategoryId}: ${id} intake`);
    }
  });
  check('Exact source references resolve to the correct guarded row', () => {
    for (const row of rows) {
      const i = profiles.findIndex(r => r.subcategoryId === row.subcategoryId);
      assert.deepEqual(row.sourceGuardRef, { path: sourcePaths.profiles, jsonPointer: `/rows/${i}/enablementGuard` });
      assert.deepEqual(pointer(canonical.profiles, row.sourceGuardRef.jsonPointer), row.rawDefaultEnablementGuard);
      for (const [key, ref] of Object.entries(row.sourceRefs)) {
        if (ref === null) continue;
        const sourceKey = Object.keys(sourcePaths).find(k => sourcePaths[k] === ref.path);
        assert.ok(sourceKey, `${row.subcategoryId}: ${key} source`);
        assert.notEqual(pointer(canonical[sourceKey], ref.jsonPointer), undefined, `${row.subcategoryId}: ${key} pointer`);
      }
      assert.equal(pointer(canonical.profiles, row.sourceRefs.profile.jsonPointer).subcategoryId, row.subcategoryId);
    }
  });
  check('Full per-offering model, workflow, intake and approval route parity', () => {
    for (const row of rows) {
      const s = screenRows.find(r => r.subcategoryId === row.subcategoryId);
      assert.deepEqual(row.fullOfferingRoutes, s.offeringRoutes, `${row.subcategoryId}: all route fields`);
      const candidateIds = sorted(new Set(s.offeringRoutes.flatMap(o => o.routes.map(r => r.modelId))));
      assert.deepEqual(row.effectiveDesignCandidateModelIds, candidateIds, `${row.subcategoryId}: candidate union`);
      assert.deepEqual(row.conditionalSettingConcernIds, candidateIds, `${row.subcategoryId}: conditional concerns`);
    }
  });
  check('Separate approved additions and offering-specific attribution', () => {
    assert.deepEqual(coverage.approvedAdditions.approval, additions.approval);
    assert.deepEqual(coverage.approvedAdditions.profiles, additions.profiles);
    assert.deepEqual(coverage.approvedAdditions.interpretation, additions.interpretation);
    const actual = rows.flatMap(r => r.approvedAdditionalRoutes);
    unique(actual, routeKey, 'Approved route identity');
    assert.deepEqual(sorted(actual.map(routeKey)), sorted(additions.approval.routes.map(routeKey)));
    for (const route of actual) {
      assert.equal(route.sourceRef.path, sourcePaths.approvedAdditions);
      assert.equal(routeKey(pointer(additions, route.sourceRef.jsonPointer)), routeKey(route));
      const row = rows.find(r => r.subcategoryId === route.subcategoryId);
      const offering = row.fullOfferingRoutes.find(o => o.templateId === route.templateId);
      assert.ok(offering.routes.some(r => r.modelId === route.modelId && r.designApprovalRef === additions.approval.approvalId), routeKey(route));
    }
  });
  check('Shared labels and known model/data-class references', () => {
    assert.deepEqual(Object.fromEntries(coverage.sharedGroups.map(g => [g.id, g.label])), groupLabels);
    const modelIds = canonical.models.models.map(m => m.id);
    assert.deepEqual(sorted(coverage.operationalModelConcerns.map(m => m.id)), sorted(modelIds));
    const classIds = new Set(canonical.domains.dataClasses.map(d => d.id));
    for (const row of rows) assert.deepEqual(row.sharedGroupIds, Object.keys(groupLabels), `${row.subcategoryId}: shared groups`);
    for (const model of coverage.operationalModelConcerns) for (const id of [...model.alwaysDataClasses, ...model.possibleAdditionalDataClasses, ...model.financeClassesOnlyWhenEnabled]) assert.ok(classIds.has(id), `${model.id}: ${id}`);
  });
  check('No coverage runtime activation', () => {
    function visit(value, at = '') {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'runtimeEnabled') assert.equal(child, false, `${at}/${key}`);
        visit(child, `${at}/${key}`);
      }
    }
    assert.equal(coverage.runtimeEnabled, false); visit(coverage);
  });
} catch (error) {
  report.checks.push({ name: 'Read and parse independent canonical sources', status: 'FAILED', reason: error.message });
}
report.status = report.checks.every(c => c.status === 'PASSED') ? 'PASSED' : 'FAILED';
await writeFile(path.join(here, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASSED') process.exitCode = 1;
