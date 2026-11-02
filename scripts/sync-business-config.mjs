import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const input = readFileSync(resolve(root, 'packages/booking-config/src/data/registry.json'), 'utf8');
const registry = JSON.parse(input);
const owner = (target) =>
  target.startsWith('catalog.') || target.startsWith('commerce.')
    ? 'offerings'
    : target.startsWith('availability.') || target.startsWith('booking.')
      ? 'availability'
      : target.startsWith('workflow.')
        ? 'work'
        : target.startsWith('integration.')
          ? 'settings'
          : 'business';
const fields = Object.fromEntries(
  registry.questions.map((q) => [
    q.id,
    {
      id: q.id,
      label: q.label,
      target: q.canonicalTarget,
      schema: q.schema,
      owner: owner(q.canonicalTarget),
    },
  ]),
);
const profiles = registry.profiles.map((p) => ({
  id: p.subcategoryId,
  categoryId: p.categoryId,
  categoryName: p.categoryName,
  name: p.name === 'CafÃƒÂ©' ? 'Café' : p.name,
  defaultModel: p.defaultModelId,
  models: p.candidateModelIds,
  needs: p.specialtyNeeds,
  questions: p.sourceQuestionIds,
  vocabulary: p.vocabulary,
}));
for (const p of profiles)
  for (const id of p.questions) if (!fields[id]) throw new Error(`Unknown question ${id}`);
const output = resolve(root, 'apps/web/components/merchant/business');
mkdirSync(output, { recursive: true });
writeFileSync(
  resolve(output, 'config.json'),
  JSON.stringify(
    {
      revision: registry.revision,
      sourceSha256: createHash('sha256').update(input).digest('hex'),
      profiles,
      fields,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Business config: ${profiles.length} profiles, ${Object.keys(fields).length} question definitions.`,
);
