import fs from 'node:fs';
import path from 'node:path';

// Build a small, browser-safe projection. Never copy the legacy conditional rules.
const root = process.cwd();
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const coverage = read('docs/merchant-portal-plan/offerings-concept/coverage-128.json');
const registry = read(
  'docs/booking-engine/payload-reserve-plan/reconciliation/effective-question-registry.json',
);
const domain = read(
  'docs/booking-engine/payload-reserve-plan/reconciliation/effective-domain-registry.json',
);
const questions = new Map(registry.questions.map((q) => [q.questionId, q]));
const businessFields =
  /license|certif|fleet_size|physical_locations|platform|channels|service_area|order_acceptance|booking_required|home_service|membership_available|reservation/;
const profiles = coverage.rows.map((p) => ({
  categoryId: p.categoryId,
  id: p.subcategoryId,
  name: p.name,
  schema: p.primaryEditorSchemaId,
  models: p.effectiveOfferingModelIds,
  attributes: p.scopedQuestionBindings.flatMap((binding) => {
    const q = questions.get(binding.questionId);
    if (!q) throw new Error(`Unknown question ${binding.questionId}`);
    // Business/workflow answers remain inherited setup; listing descriptors are explicit overrides.
    if (!q.canonicalTarget.startsWith('catalog.attributes.') || businessFields.test(q.key))
      return [];
    return [
      {
        id: q.questionId,
        label: q.label,
        schema: q.valueSchema,
        options: q.source?.currentGeneratedQuestion?.options ?? [],
        target: q.canonicalTarget,
      },
    ];
  }),
}));
if (profiles.length !== 128 || new Set(profiles.map((p) => p.id)).size !== 128)
  throw new Error('Expected all 128 unique profiles');
const result = {
  revision: '2026-10-31-offerings-v1',
  profiles,
  registeredSchemas: domain.offeringSchemas.map((s) => s.id),
};
fs.mkdirSync(path.join(root, 'apps/web/components/merchant/offerings'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'apps/web/components/merchant/offerings/config.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  `Offerings configuration: ${profiles.length} profiles, ${result.registeredSchemas.length} registered editors. No backend changes.`,
);
