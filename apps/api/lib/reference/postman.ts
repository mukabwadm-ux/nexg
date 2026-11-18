import { ENDPOINTS } from './endpoints';
import { HOSTS, type EndpointDoc } from './types';

/**
 * A Postman collection (v2.1) for the NexG API, built from the same registry
 * as the reference pages. Served at /postman.json; import it, set the apiKey
 * variable to a test key from the developer console, and every endpoint is
 * one click away.
 *
 * The collection holds a placeholder, never a key: this repository and the
 * file are public.
 */

export const POSTMAN_KEY_PLACEHOLDER = 'nexg_test_paste_your_test_key_here';

type Json = Record<string, unknown>;

function request(endpoint: EndpointDoc): Json {
  const segments = endpoint.path
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/^\{(\w+)\}$/, ':$1'));
  const pathVariables = endpoint.params
    .filter((param) => param.in === 'path')
    .map((param) => ({
      key: param.name,
      value: endpoint.example.path?.[param.name] ?? '',
      description: param.description,
    }));
  const query = Object.entries(endpoint.example.query ?? {}).map(([key, value]) => ({
    key,
    value,
  }));
  const takesIdempotencyKey = endpoint.params.some((param) => param.name === 'Idempotency-Key');
  const hasBody = endpoint.example.body !== undefined;
  const queryString = query.length ? `?${query.map((q) => `${q.key}=${q.value}`).join('&')}` : '';

  return {
    name: endpoint.title,
    request: {
      method: endpoint.method,
      description: [endpoint.summary, ...endpoint.description].join('\n\n'),
      ...(endpoint.auth.kind === 'key' || endpoint.auth.kind === 'optional_key'
        ? {}
        : { auth: { type: 'noauth' } }),
      header: [
        ...(hasBody ? [{ key: 'Content-Type', value: 'application/json' }] : []),
        ...(takesIdempotencyKey
          ? [
              {
                key: 'Idempotency-Key',
                value: '{{$guid}}',
                description: 'New for each booking. Reuse it only to retry the same one.',
              },
            ]
          : []),
      ],
      url: {
        raw: `{{baseUrl}}/${segments.join('/')}${queryString}`,
        host: ['{{baseUrl}}'],
        path: segments,
        ...(pathVariables.length ? { variable: pathVariables } : {}),
        ...(query.length ? { query } : {}),
      },
      ...(hasBody
        ? {
            body: {
              mode: 'raw',
              raw: JSON.stringify(endpoint.example.body, null, 2),
              options: { raw: { language: 'json' } },
            },
          }
        : {}),
    },
  };
}

export function buildPostmanCollection(): Json {
  // The API's own endpoints. Callbacks to NexG (the bank webhook) are signed
  // by a bank, not called with a key, so they are not in the collection.
  const endpoints = ENDPOINTS.filter(
    (endpoint) => endpoint.host === 'api' && endpoint.status !== 'coming_soon',
  );
  const groups = [...new Set(endpoints.map((endpoint) => endpoint.group))];

  return {
    info: {
      name: 'NexG API',
      description:
        'Every NexG API endpoint, from the reference at https://api.nexgapp.com/docs. Set apiKey to a test key (nexg_test_…) from the developer console; a test key never touches real orders or prices.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'apikey',
      apikey: [
        { key: 'key', value: 'X-Api-Key', type: 'string' },
        { key: 'value', value: '{{apiKey}}', type: 'string' },
        { key: 'in', value: 'header', type: 'string' },
      ],
    },
    variable: [
      { key: 'baseUrl', value: HOSTS.api },
      { key: 'apiKey', value: POSTMAN_KEY_PLACEHOLDER },
    ],
    item: groups.map((group) => ({
      name: group,
      item: endpoints.filter((endpoint) => endpoint.group === group).map(request),
    })),
  };
}
