import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@nexg/contracts/api';

import { GET as getOpenApi } from '../app/openapi.json/route';
import { GET as getPostman } from '../app/postman.json/route';
import { ENDPOINTS } from '../lib/reference/endpoints';
import { buildOpenApi, schemaForType } from '../lib/reference/openapi';
import { buildPostmanCollection, POSTMAN_KEY_PLACEHOLDER } from '../lib/reference/postman';

/*
 * The OpenAPI spec and the Postman collection are built from the reference
 * registry. These tests keep them complete and well formed, and make sure
 * neither ever carries something that looks like a real key.
 */

type Json = Record<string, any>;

const served = ENDPOINTS.filter((endpoint) => endpoint.status !== 'coming_soon');
const spec = buildOpenApi() as Json;
const collection = buildPostmanCollection() as Json;

describe('the OpenAPI spec', () => {
  it('is OpenAPI 3.1 for api.nexgapp.com', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0].url).toBe('https://api.nexgapp.com');
    expect(spec.components.securitySchemes.apiKey).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-Api-Key',
    });
  });

  it('has every served endpoint once, named by its reference slug', () => {
    const operations = Object.entries(spec.paths as Json).flatMap(([path, item]) =>
      Object.entries(item as Json)
        .filter(([method]) => method !== 'servers')
        .map(([method, op]) => ({
          path,
          method: method.toUpperCase(),
          id: (op as Json).operationId,
        })),
    );
    expect(operations.map((op) => op.id).sort()).toEqual(served.map((e) => e.slug).sort());
    for (const endpoint of served) {
      expect(operations).toContainEqual({
        path: endpoint.path,
        method: endpoint.method,
        id: endpoint.slug,
      });
    }
  });

  it('declares every path parameter, and needs a key where the reference says so', () => {
    for (const endpoint of served) {
      const op = spec.paths[endpoint.path][endpoint.method.toLowerCase()];
      for (const name of endpoint.path.match(/\{(\w+)\}/g) ?? []) {
        expect(op.parameters, endpoint.slug).toContainEqual(
          expect.objectContaining({ name: name.slice(1, -1), in: 'path', required: true }),
        );
      }
      if (endpoint.auth.kind === 'key') {
        expect(op.security, endpoint.slug).toEqual([{ apiKey: [] }, { bearer: [] }]);
        expect(op['x-nexg-scope']).toBe(endpoint.auth.scope);
      }
    }
  });

  it('carries the reference’s examples and errors', () => {
    for (const endpoint of served) {
      const op = spec.paths[endpoint.path][endpoint.method.toLowerCase()];
      const code = endpoint.responseStatus.split(' ')[0]!;
      expect(op.responses[code].content['application/json'].example, endpoint.slug).toEqual(
        endpoint.responseExample,
      );
      if (endpoint.example.body !== undefined) {
        expect(op.requestBody.content['application/json'].example).toEqual(endpoint.example.body);
      }
      for (const error of endpoint.errors) {
        expect(
          op.responses[String(error.status)],
          `${endpoint.slug} ${error.status}`,
        ).toBeDefined();
      }
    }
    expect(spec.components.schemas.ErrorEnvelope.properties.error.properties.code.enum).toEqual(
      Object.keys(ERROR_CODES),
    );
  });

  it('turns the reference’s types into JSON Schema', () => {
    expect(schemaForType('uuid')).toEqual({ type: 'string', format: 'uuid' });
    expect(schemaForType('string | null')).toEqual({ type: ['string', 'null'] });
    expect(schemaForType("'confirmed' | 'cancelled'")).toEqual({
      type: 'string',
      enum: ['confirmed', 'cancelled'],
    });
    expect(schemaForType('timestamp', true)).toEqual({
      type: ['string', 'null'],
      format: 'date-time',
    });
    expect(spec.components.schemas.ApiOrder.properties.order_id).toMatchObject({ format: 'uuid' });
  });
});

describe('the Postman collection', () => {
  const requests = (collection.item as Json[]).flatMap((folder) => folder.item as Json[]);

  it('has a request for every endpoint the API serves, by key', () => {
    const apiEndpoints = served.filter((endpoint) => endpoint.host === 'api');
    expect(requests.map((r) => r.name).sort()).toEqual(apiEndpoints.map((e) => e.title).sort());
    for (const r of requests) expect(r.request.url.raw).toMatch(/^\{\{baseUrl\}\}\/v1\//);
  });

  it('turns path parameters into Postman variables with the reference’s example', () => {
    const order = requests.find((r) => r.name === 'Get one order')!;
    expect(order.request.url.path).toEqual(['v1', 'orders', ':id']);
    expect(order.request.url.variable[0]).toMatchObject({
      key: 'id',
      value: '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b',
    });
    const booking = requests.find((r) => r.name === 'Book a service')!;
    expect(booking.request.header).toContainEqual(
      expect.objectContaining({ key: 'Idempotency-Key', value: '{{$guid}}' }),
    );
  });

  it('sends the key from a variable, holding only a placeholder', () => {
    expect(collection.auth.apikey).toContainEqual({
      key: 'value',
      value: '{{apiKey}}',
      type: 'string',
    });
    expect(collection.variable).toContainEqual({ key: 'apiKey', value: POSTMAN_KEY_PLACEHOLDER });
  });
});

describe('what is served', () => {
  it('serves both as JSON anyone may fetch', async () => {
    for (const res of [getOpenApi(), getPostman()]) {
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    }
    expect((await getOpenApi().json()).openapi).toBe('3.1.0');
    expect(getPostman().headers.get('content-disposition')).toContain(
      'nexg-api.postman_collection.json',
    );
  });

  it('never carries anything shaped like a real key', () => {
    const text = JSON.stringify(spec) + JSON.stringify(collection);
    expect(text).not.toMatch(/nexg_test_[0-9a-f]{32,}/);
    expect(text).not.toMatch(/whsec_[0-9a-f]{32,}/);
  });
});
