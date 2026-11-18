import { ERROR_CODES } from '@nexg/contracts/api';

import { ENDPOINTS } from './endpoints';
import { HOSTS, type EndpointDoc, type FieldDoc, type ResourceDoc } from './types';

/**
 * The OpenAPI 3.1 description of the NexG API, built from the same registry
 * as the reference pages, so the two cannot disagree. Served at
 * /openapi.json; `tests/developer-kit.test.ts` keeps it in step.
 *
 * Every live and sandbox endpoint is in it, with its scope, parameters,
 * examples, success schema and each documented error. Objects named in the
 * registry (ApiOrder, CatalogueItem and the rest) are component schemas.
 */

type Schema = Record<string, unknown>;

const PRIMITIVES: Record<string, Schema> = {
  string: { type: 'string' },
  uuid: { type: 'string', format: 'uuid' },
  boolean: { type: 'boolean' },
  integer: { type: 'integer' },
  number: { type: 'number' },
  timestamp: { type: 'string', format: 'date-time' },
  array: { type: 'array' },
  object: { type: 'object' },
};

/** A registry type ("uuid", "string | null", "'a' | 'b'") as a JSON Schema. */
export function schemaForType(type: string, nullable = false): Schema {
  const parts = type.split('|').map((part) => part.trim());
  const isNull = nullable || parts.includes('null');
  const rest = parts.filter((part) => part !== 'null');
  let base: Schema;
  if (rest.length > 0 && rest.every((part) => /^'[^']*'$/.test(part))) {
    base = { type: 'string', enum: rest.map((part) => part.slice(1, -1)) };
  } else if (rest.length === 1 && PRIMITIVES[rest[0]!]) {
    base = { ...PRIMITIVES[rest[0]!] };
  } else {
    base = {};
  }
  if (!isNull) return base;
  if (typeof base.type === 'string') {
    return {
      ...base,
      type: [base.type, 'null'],
      ...(Array.isArray(base.enum) ? { enum: [...(base.enum as unknown[]), null] } : {}),
    };
  }
  return base;
}

function objectSchema(fields: FieldDoc[]): Schema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      fields.map((field) => [
        field.name,
        { ...schemaForType(field.type, field.nullable), description: field.description },
      ]),
    ),
  };
}

function resourceSchema(resource: ResourceDoc): Schema {
  return resource.schema
    ? { $ref: `#/components/schemas/${resource.schema}` }
    : objectSchema(resource.fields);
}

/** The `data` object of a success answer, from where each resource sits (`data.items[]`). */
function dataSchema(resources: ResourceDoc[]): Schema {
  const data: Schema = { type: 'object', properties: {} as Record<string, Schema> };
  for (const resource of resources) {
    const path = resource.at.split('.').slice(1);
    if (path.length === 0) {
      Object.assign(
        data.properties as Record<string, Schema>,
        objectSchema(resource.fields).properties,
      );
      continue;
    }
    let node = data;
    path.forEach((segment, index) => {
      const array = segment.endsWith('[]');
      const name = array ? segment.slice(0, -2) : segment;
      const last = index === path.length - 1;
      const properties = (node.properties ?? (node.properties = {})) as Record<string, Schema>;
      if (last) {
        properties[name] = array
          ? { type: 'array', items: resourceSchema(resource) }
          : resourceSchema(resource);
      } else {
        const next = (properties[name] ??= { type: 'object', properties: {} });
        node = array ? ((next.items as Schema) ??= { type: 'object', properties: {} }) : next;
      }
    });
  }
  return data;
}

function responseCode(status: string): string {
  return status.split(' ')[0] ?? '200';
}

function operation(endpoint: EndpointDoc): Schema {
  const params = endpoint.params.filter(
    (param) => param.in !== 'header' || !SKIPPED_HEADERS.has(param.name),
  );
  const security =
    endpoint.auth.kind === 'key'
      ? [{ apiKey: [] }, { bearer: [] }]
      : endpoint.auth.kind === 'optional_key'
        ? [{}, { apiKey: [] }, { bearer: [] }]
        : [];

  const errors = new Map<string, string[]>();
  for (const error of endpoint.errors) {
    const code = String(error.status);
    errors.set(code, [...(errors.get(code) ?? []), error.when]);
  }

  const body = endpoint.requestResources?.find((resource) => resource.at === 'body');

  return {
    operationId: endpoint.slug,
    summary: endpoint.title,
    description: endpoint.description.join('\n\n'),
    tags: [endpoint.group],
    security,
    'x-nexg-scope': 'scope' in endpoint.auth ? endpoint.auth.scope : null,
    'x-nexg-status': endpoint.status,
    'x-nexg-rate-cost': endpoint.rateCost,
    parameters: params.map((param) => ({
      name: param.name,
      in: param.in,
      required: param.in === 'path' ? true : param.required,
      description: param.description,
      schema: schemaForType(param.type),
    })),
    ...(body || endpoint.example.body !== undefined
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: body ? resourceSchema(body) : { type: 'object' },
                ...(endpoint.example.body !== undefined ? { example: endpoint.example.body } : {}),
              },
            },
          },
        }
      : {}),
    responses: {
      [responseCode(endpoint.responseStatus)]: {
        description: endpoint.summary,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                ok: { const: true },
                data: dataSchema(endpoint.responseResources),
                meta: { type: 'object' },
              },
              required: ['ok', 'data', 'meta'],
            },
            example: endpoint.responseExample,
          },
        },
      },
      ...Object.fromEntries(
        [...errors.entries()].map(([code, whens]) => [
          code,
          {
            description: whens.join(' Or: '),
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
            },
          },
        ]),
      ),
    },
  };
}

/** The key goes in security, and the JSON body says its own type. */
const SKIPPED_HEADERS = new Set(['X-Api-Key', 'Authorization', 'Content-Type']);

export function buildOpenApi(): Schema {
  const endpoints = ENDPOINTS.filter((endpoint) => endpoint.status !== 'coming_soon');

  const schemas: Record<string, Schema> = {
    ErrorEnvelope: {
      type: 'object',
      properties: {
        ok: { const: false },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', enum: Object.keys(ERROR_CODES) },
            message: { type: 'string' },
            fields: { type: 'object', additionalProperties: { type: 'string' } },
          },
          required: ['code', 'message'],
        },
        meta: { type: 'object' },
      },
      required: ['ok', 'error'],
    },
  };
  for (const endpoint of endpoints) {
    for (const resource of [...(endpoint.requestResources ?? []), ...endpoint.responseResources]) {
      if (resource.schema && !schemas[resource.schema]) {
        schemas[resource.schema] = { ...objectSchema(resource.fields), title: resource.title };
      }
    }
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of endpoints) {
    const item = (paths[endpoint.path] ??= {});
    item[endpoint.method.toLowerCase()] = operation(endpoint);
    if (endpoint.host !== 'api') item.servers = [{ url: HOSTS[endpoint.host] }];
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'NexG API',
      version: 'v1',
      description:
        'Read NexG’s catalogue and your merchant’s orders, book services, update your catalogue, and test it all in the sandbox with a test key (nexg_test_…). Guides: https://api.nexgapp.com/docs.',
    },
    servers: [
      {
        url: HOSTS.api,
        description: 'Live and test keys use the same URL: the key decides where a request goes.',
      },
    ],
    externalDocs: { url: `${HOSTS.api}/docs`, description: 'Guides and reference' },
    tags: [...new Set(endpoints.map((endpoint) => endpoint.group))].map((name) => ({ name })),
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        bearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'The same API key, as a bearer token.',
        },
      },
      schemas,
    },
    paths,
  };
}
