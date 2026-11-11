import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { default as addFormatsModule } from 'ajv-formats';
import type { components } from './owner.generated.js';

export type CatalogProjection = components['schemas']['CatalogProjection'];
export type CatalogProjectionPage = components['schemas']['CatalogProjectionPage'];

function schema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'discriminator').map(([key, item]) => [key,
    key === '$ref' && typeof item === 'string' ? item.replace('#/components/schemas/', '#/$defs/') : schema(item)]));
}
const document = JSON.parse(readFileSync(new URL('../../../docs/contracts/WORKFLOW_V1.openapi.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strictTypes: false, strictRequired: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
(addFormatsModule as unknown as (validator: Ajv2020) => void)(ajv);
ajv.addSchema({ $id: 'urn:nexg:owner:projection:v1', $schema: document.jsonSchemaDialect, $defs: schema(document.components.schemas) });
const validate = ajv.compile<CatalogProjection>({ $ref: 'urn:nexg:owner:projection:v1#/$defs/CatalogProjection' });

/** Validate the existing owner contract; no independent fact schema or coercion. */
export function parseCatalogProjection(value: unknown): CatalogProjection {
  if (!validate(value)) throw new Error('INVALID_CATALOG_PROJECTION');
  return structuredClone(value);
}
