import { readFile, writeFile } from 'node:fs/promises';

// Build the preview's small, versioned adaptation registry from the reviewed plan.
const base = new URL('../', import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, base), 'utf8'));
const [plan, coverage, offerings] = await Promise.all([
  read('docs/merchant-portal-plan/money-concept/descriptors.json'),
  read('docs/merchant-portal-plan/money-concept/profiles-128.json'),
  read('apps/web/components/merchant/offerings/config.json'),
]);
const descriptors = plan.descriptors.map(
  ({ schemaId, modelId, workflowIds, title, billingBasis, invariant, headlineMetricIds }) => ({
    schemaId,
    modelId,
    workflowIds,
    title,
    billingBasis,
    invariant,
    headlineMetricIds,
  }),
);
const profiles = coverage.profiles.map(
  ({
    subcategoryId,
    categoryId,
    categoryName,
    vocabulary,
    specialtyNeeds,
    categoryRefinement,
  }) => ({
    subcategoryId,
    categoryId,
    categoryName,
    vocabulary,
    specialtyNeeds,
    categoryRefinement,
  }),
);
const ids = new Set(profiles.map((p) => p.subcategoryId));
if (
  ids.size !== profiles.length ||
  offerings.profiles.length !== profiles.length ||
  offerings.profiles.some((p) => !ids.has(p.id))
) {
  throw new Error(
    'The Money profile plan and current Offerings catalogue differ; reconcile before syncing.',
  );
}
if (
  !descriptors.length ||
  new Set(descriptors.map((d) => d.schemaId)).size !== descriptors.length ||
  descriptors.some((d) => !d.modelId || !d.workflowIds.length)
)
  throw new Error('Each Money descriptor needs a unique schema, registered model and workflow.');
await writeFile(
  new URL('apps/web/components/merchant/money/config.json', base),
  JSON.stringify({ version: 1, descriptors, profiles }, null, 2) + '\n',
);
console.log(
  `Money preview config synced: ${profiles.length} specialties, ${descriptors.length} descriptors.`,
);
