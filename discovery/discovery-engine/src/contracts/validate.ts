import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { default as addFormatsModule } from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { ContractError, type EngineRequest, type Schemas, type Selection } from './index.js';

// Discriminator is an OpenAPI optimization. The unchanged oneOf remains authoritative.
function jsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'discriminator').map(([key, child]) => [key,
    key === '$ref' && typeof child === 'string' ? child.replace('#/components/schemas/', '#/$defs/') : jsonSchema(child)]));
}

const document = JSON.parse(readFileSync(new URL('../../../docs/contracts/ENGINE_V1.openapi.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strictTypes: false, strictRequired: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
const addFormats = addFormatsModule as unknown as (validator: Ajv2020) => void;
addFormats(ajv);
ajv.addSchema({ $id: 'urn:nexg:engine:v1', $schema: document.jsonSchemaDialect, $defs: jsonSchema(document.components.schemas) });
const validators = new Map<keyof Schemas, ValidateFunction>();
for (const name of Object.keys(document.components.schemas) as (keyof Schemas)[]) {
  validators.set(name, ajv.compile({ $ref: `urn:nexg:engine:v1#/$defs/${name}` }));
}

export function assertSchema<K extends keyof Schemas>(name: K, value: unknown): asserts value is Schemas[K] {
  const validator = validators.get(name)!;
  if (!validator(value)) {
    throw new ContractError('INVALID_REQUEST', [...new Set((validator.errors ?? []).map(error => error.instancePath || '/'))].slice(0, 30));
  }
}

export function parseSchema<K extends keyof Schemas>(name: K, value: unknown): Schemas[K] {
  assertSchema(name, value);
  return structuredClone(value);
}

export interface SelectionAuthority {
  readonly releaseId: string;
  readonly nodes: readonly { readonly id: string; readonly kind: 'category' | 'subcategory' | 'option'; readonly parentId?: string }[];
}

export function validateSelection(selection: Selection, release: SelectionAuthority): void {
  const nodes = new Map(release.nodes.map(node => [node.id, node]));
  for (const [field, kind] of [['categoryId', 'category'], ['subcategoryId', 'subcategory'], ['optionId', 'option']] as const) {
    const id = selection[field];
    if (id && nodes.get(id)?.kind !== kind) throw new ContractError('INVALID_REQUEST', [`/selection/${field}`]);
  }
  if (selection.subcategoryId && (!selection.categoryId || nodes.get(selection.subcategoryId)?.parentId !== selection.categoryId)) {
    throw new ContractError('CONSTRAINT_CONFLICT', ['/selection/categoryId', '/selection/subcategoryId']);
  }
  if (selection.optionId && (!selection.subcategoryId || nodes.get(selection.optionId)?.parentId !== selection.subcategoryId)) {
    throw new ContractError('CONSTRAINT_CONFLICT', ['/selection/subcategoryId', '/selection/optionId']);
  }
}

function timezoneValid(timezone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); return true; } catch { return false; }
}

export function parseEngineRequest(value: unknown, release: SelectionAuthority): EngineRequest {
  const request = parseSchema('EngineRequest', value);
  if (request.discoveryReleaseId !== release.releaseId) throw new ContractError('RELEASE_INCOMPATIBLE', ['/discoveryReleaseId']);
  validateSelection(request.selection, release);
  if (request.sourceScope?.anchorRef) {
    const anchor = request.sourceScope.anchorRef;
    if ((anchor.kind === 'merchant' && anchor.id !== anchor.merchantId)
      || (request.sourceScope.merchantId && request.sourceScope.merchantId !== anchor.merchantId)) {
      throw new ContractError('CONSTRAINT_CONFLICT', ['/sourceScope']);
    }
  }
  for (const [index, filter] of request.filters.entries()) {
    const path = `/filters/${index}`;
    if (filter.kind === 'required_availability' && (!timezoneValid(filter.timezone)
      || (filter.end && Date.parse(filter.end) <= Date.parse(filter.start)))) throw new ContractError('INVALID_REQUEST', [path]);
    if (filter.kind === 'party' && filter.adults + (filter.children ?? 0) + (filter.infants ?? 0) === 0) throw new ContractError('INVALID_REQUEST', [path]);
    if (filter.kind === 'listed_price' && filter.min && filter.max
      && (filter.min.currency !== filter.max.currency || filter.min.minor > filter.max.minor)) throw new ContractError('CONSTRAINT_CONFLICT', [path]);
  }
  return request;
}

export function validateTaskRequest(value: unknown, release: SelectionAuthority): Schemas['TaskRequest'] {
  const task = parseSchema('TaskRequest', value);
  if (task.discoveryReleaseId !== release.releaseId) throw new ContractError('RELEASE_INCOMPATIBLE', ['/discoveryReleaseId']);
  if (task.components.filter(component => component.required).length > 3) throw new ContractError('LIMIT_EXCEEDED', ['/components']);
  if (new Set(task.components.map(component => component.componentId)).size !== task.components.length) throw new ContractError('INVALID_REQUEST', ['/components']);
  for (const component of task.components) parseEngineRequest(component.request, release);
  return task;
}
