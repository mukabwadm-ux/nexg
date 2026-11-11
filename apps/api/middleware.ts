import { NextResponse, type NextRequest } from 'next/server';

import { allowHeader, matchV1Route } from '@/lib/routes';

/**
 * Every answer under /v1 is JSON.
 *
 * A path that is not an endpoint used to get Next.js's HTML 404 page, and a
 * method an endpoint does not serve got an empty 405. Both now answer with
 * the API's error envelope and an X-Request-Id; a 405 also says what the
 * endpoint accepts in Allow. HEAD and OPTIONS pass through, because Next.js
 * answers them from GET (OPTIONS with Allow, and no CORS headers: the API is
 * for servers, see /docs/auth#safety).
 *
 * This runs on the edge runtime, so it builds its small envelope itself
 * rather than importing lib/http.ts, which needs Node.
 */
export function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  const route = matchV1Route(pathname);
  if (!route) {
    return apiError(
      404,
      'not_found',
      `There is no endpoint at ${pathname}. Every endpoint is listed at ${origin}/docs/reference.`,
    );
  }

  const method = request.method.toUpperCase();
  if (method === 'OPTIONS' || (method === 'HEAD' && route.methods.includes('GET'))) {
    return NextResponse.next();
  }
  if (!(route.methods as readonly string[]).includes(method)) {
    const allow = allowHeader(route.methods);
    return apiError(
      405,
      'method_not_allowed',
      `${pathname} does not accept ${method}. It accepts ${allow}.`,
      { Allow: allow },
    );
  }
  return NextResponse.next();
}

function apiError(
  status: 404 | 405,
  code: 'not_found' | 'method_not_allowed',
  message: string,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(
    { ok: false, error: { code, message }, meta: { api_version: 'v1' } },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': crypto.randomUUID(),
        ...headers,
      },
    },
  );
}

export const config = { matcher: ['/v1', '/v1/:path*'] };
