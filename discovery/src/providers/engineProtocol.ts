import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import document from './engineContract/ENGINE_V1.openapi.json';
import type { EngineSchemas } from './DiscoveryProvider';
import { ProviderReadError } from './readState';

function schema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'discriminator').map(([key, value]) => [key,
    key === '$ref' && typeof value === 'string' ? value.replace('#/components/schemas/', '#/$defs/') : schema(value)]));
}
const ajv = new Ajv2020({ strictTypes: false, strictRequired: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
addFormats(ajv);
ajv.addSchema({ $id: 'urn:nexg:browser:v1', $schema: document.jsonSchemaDialect, $defs: schema(document.components.schemas) });
const validators = new Map<string, ValidateFunction>();
export function parseEngine<K extends keyof EngineSchemas>(name: K, value: unknown): EngineSchemas[K] {
  let validate = validators.get(name);
  if (!validate) { validate = ajv.compile({ $ref: `urn:nexg:browser:v1#/$defs/${name}` }); validators.set(name, validate); }
  if (!validate(value)) throw new ProviderReadError({ kind: 'unavailable' });
  return value as EngineSchemas[K];
}
