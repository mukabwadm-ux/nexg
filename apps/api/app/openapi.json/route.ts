/**
 * GET /openapi.json: the OpenAPI 3.1 description of the NexG API, built from
 * the reference registry (`lib/reference/openapi.ts`). The same for every
 * caller, so it is built once and cached.
 */
import { NextResponse } from 'next/server';

import { buildOpenApi } from '@/lib/reference/openapi';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(buildOpenApi(), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      // Spec viewers and code generators fetch it from other origins.
      'Access-Control-Allow-Origin': '*',
    },
  });
}
