import openapiTS, { astToString } from 'openapi-typescript';
import { readFile, writeFile } from 'node:fs/promises';

function preserveConstTags(value) {
  if (Array.isArray(value)) return value.map(preserveConstTags);
  if (!value || typeof value !== 'object') return value;
  const schema = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'discriminator').map(([key, child]) => [key, preserveConstTags(child)]));
  if (schema.type === 'object' && Array.isArray(schema.anyOf)
    && schema.anyOf.every(branch => branch && Object.keys(branch).length === 1 && Array.isArray(branch.required))) {
    const { anyOf, ...base } = schema;
    return { anyOf: anyOf.map(branch => ({ ...base, required: [...new Set([...(base.required ?? []), ...branch.required])] })) };
  }
  return schema;
}
// Implicit OpenAPI discriminator names must not replace the schema's const values.
for (const [name, target] of [['ENGINE_V1', 'wire'], ['WORKFLOW_V1', 'owner']]) {
  const input = new URL(`../docs/contracts/${name}.openapi.json`, import.meta.url);
  const output = new URL(`../src/contracts/${target}.generated.ts`, import.meta.url);
  const document = preserveConstTags(JSON.parse(await readFile(input, 'utf8')));
  const generated = `// Generated from ${name}.openapi.json. Run npm run generate; do not edit.\n` + astToString(await openapiTS(document));
  if (process.argv.includes('--check')) {
    if (await readFile(output, 'utf8') !== generated) throw new Error(`Generated ${name} types differ. Run npm run generate.`);
    console.log(`Generated types match the unchanged ${name} OpenAPI.`);
  } else {
    await writeFile(output, generated);
    console.log(`Generated ${name} types.`);
  }
}
