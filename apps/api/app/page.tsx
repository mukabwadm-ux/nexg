import { NextResponse } from 'next/server';

/**
 * API version and base URL information.
 *
 * Stage 1 provides read-only access to:
 * - /v1/catalog/merchants — cursor-paginated merchant list
 * - /v1/catalog/merchants/{id} — single merchant with catalogue items
 * - /v1/zones — delivery zones with bounds
 * - /v1/experiences — upcoming events
 */
export async function GET() {
  return NextResponse.json(
    {
      api_version: 'v1',
      name: 'NexG Public API',
      description: 'Read-only endpoints for public consumers',
      documentation: 'https://docs.nexgapp.com/api',
      endpoints: {
        catalog: {
          merchants: '/v1/catalog/merchants',
          merchant_detail: '/v1/catalog/merchants/{id}',
        },
        zones: '/v1/zones',
        experiences: '/v1/experiences',
      },
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}