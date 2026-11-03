// Regenerate only the versioned SQL projection of the existing booking registry.
import { readFile, writeFile } from 'node:fs/promises';
const migration = new URL('../supabase/migrations/20261102000100_merchant_application.sql', import.meta.url);
const registry = JSON.parse(await readFile(new URL('../packages/booking-config/src/data/registry.json', import.meta.url), 'utf8'));
const legacySql = await readFile(new URL('../supabase/migrations/20260101021002_merchant_taxonomy_onboarding_rules.sql', import.meta.url), 'utf8');
const taxonomy = {};
const profileQuestions = {};
for (const profile of registry.profiles) {
  if (Object.hasOwn(profileQuestions, profile.subcategoryId)) throw new Error('Duplicate source specialty ID.');
  (taxonomy[profile.categoryId] ??= []).push(profile.subcategoryId);
  profileQuestions[profile.subcategoryId] = [...new Set(profile.sourceQuestionKeys)].sort();
}
for (const ids of Object.values(taxonomy)) ids.sort();
const schemas = Object.fromEntries(registry.questions.map(q => [q.key, q.schema]));
if (Object.keys(schemas).length !== registry.questions.length) throw new Error('Duplicate source question key.');
if (Object.values(profileQuestions).some(keys => keys.some(key => !Object.hasOwn(schemas, key)))) throw new Error('Source specialty refers to an unknown question key.');
const legacyCategories = Object.fromEntries([...legacySql.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map(m => [m[1], m[2]]));
if (Object.keys(legacyCategories).length !== 7) throw new Error('Inspect the changed legacy category compatibility mapping.');
const sqlJson = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const seed = `-- BEGIN GENERATED REGISTRY
-- Source packages/booking-config/src/data/registry.json; regenerate with this script.
-- Legacy aliases are metadata for explicit legacy adapters. New payloads require canonical IDs.
insert into public.merchant_application_registry
  (revision,taxonomy,profile_questions,question_schemas,legacy_categories,legacy_compatibility_revision)
values ('${registry.revision}',${sqlJson(taxonomy)},${sqlJson(profileQuestions)},${sqlJson(schemas)},${sqlJson(legacyCategories)},'merchant-category-aliases-20260101021002.v1');
-- END GENERATED REGISTRY`;
const original = await readFile(migration, 'utf8');
const next = original.replace(/-- BEGIN GENERATED REGISTRY[\s\S]*?-- END GENERATED REGISTRY|-- REGISTRY_SEED/, seed);
if (next === original && !original.includes(seed)) throw new Error('Missing generated registry markers.');
if (process.argv.includes('--check')) {
  if (next !== original) throw new Error('Application SQL registry projection is stale.');
} else await writeFile(migration, next);
console.log(`Application registry ${registry.revision}: ${Object.keys(taxonomy).length} categories, ${registry.profiles.length} profiles, ${Object.keys(schemas).length} schemas.`);
