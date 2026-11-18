/**
 * GET /postman.json: a Postman collection (v2.1) of every NexG API endpoint,
 * built from the reference registry (`lib/reference/postman.ts`). It holds
 * a key placeholder, never a key.
 */
import { NextResponse } from 'next/server';

import { buildPostmanCollection } from '@/lib/reference/postman';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(buildPostmanCollection(), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'Content-Disposition': 'attachment; filename="nexg-api.postman_collection.json"',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
