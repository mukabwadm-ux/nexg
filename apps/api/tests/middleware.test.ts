import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@nexg/contracts/api';

import { config, middleware } from '../middleware';
import { V1_ROUTES, allowHeader, matchV1Route } from '../lib/routes';

/*
 * Every answer under /v1 is JSON (2026-11-11): an unknown path is a JSON 404
 * and an unsupported method a JSON 405 with Allow, instead of Next.js's HTML
 * page and empty 405.
 */
const ID = '9b2f6c1e-4a7d-4c3b-8e21-5f0a7d3c9e14';
const run = (path: string, method = 'GET') =>
  middleware(new NextRequest(`https://api.test${path}`, { method }));
const passesThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';
const concrete = (path: string) => path.replace(/\{\w+\}/g, ID);

async function expectEnvelope(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = await res.json();
  expect(ApiError.safeParse(body).success).toBe(true);
  expect(body.error.code).toBe(code);
  expect(res.headers.get('x-request-id')).toBeTruthy();
  expect(res.headers.get('cache-control')).toBe('no-store');
  return body;
}

describe('the /v1 middleware', () => {
  it('runs only under /v1', () => {
    expect(config.matcher).toEqual(['/v1', '/v1/:path*']);
  });

  it.each(V1_ROUTES.flatMap((r) => r.methods.map((m) => [m, concrete(r.path)] as const)))(
    'lets %s %s through to its route',
    (method, path) => {
      expect(passesThrough(run(path, method))).toBe(true);
    },
  );

  it('lets HEAD and OPTIONS through for Next.js to answer', () => {
    expect(passesThrough(run('/v1/zones', 'HEAD'))).toBe(true);
    expect(passesThrough(run('/v1/zones', 'OPTIONS'))).toBe(true);
    expect(passesThrough(run(`/v1/orders/${ID}`, 'OPTIONS'))).toBe(true);
  });

  it.each(['/v1', '/v1/no-such-endpoint', '/v1/merchants', `/v1/catalog/merchants/${ID}/extra`])(
    'answers %s with a JSON 404',
    async (path) => {
      const body = await expectEnvelope(run(path), 404, 'not_found');
      expect(body.error.message).toContain('/docs/reference');
    },
  );

  it.each([
    ['DELETE', '/v1/orders', 'GET, POST, HEAD, OPTIONS'],
    ['PATCH', '/v1/orders', 'GET, POST, HEAD, OPTIONS'],
    ['DELETE', '/v1/zones', 'GET, HEAD, OPTIONS'],
    ['POST', '/v1/zones', 'GET, HEAD, OPTIONS'],
    ['PATCH', `/v1/catalog/merchants/${ID}`, 'GET, HEAD, OPTIONS'],
    ['PUT', `/v1/orders/${ID}`, 'GET, HEAD, OPTIONS'],
  ])('answers %s %s with a JSON 405 and Allow', async (method, path, allow) => {
    const res = run(path, method);
    await expectEnvelope(res, 405, 'method_not_allowed');
    expect(res.headers.get('allow')).toBe(allow);
  });
});

describe('the route table', () => {
  it('matches one segment for each {param}, with or without a trailing slash', () => {
    expect(matchV1Route(`/v1/orders/${ID}`)?.path).toBe('/v1/orders/{id}');
    expect(matchV1Route('/v1/zones/')?.path).toBe('/v1/zones');
    expect(matchV1Route(`/v1/orders/${ID}/items`)).toBeNull();
  });

  it('writes Allow the way Next.js does', () => {
    expect(allowHeader(['GET'])).toBe('GET, HEAD, OPTIONS');
    expect(allowHeader(['GET', 'POST'])).toBe('GET, POST, HEAD, OPTIONS');
    expect(allowHeader(['POST'])).toBe('POST, OPTIONS');
  });
});
