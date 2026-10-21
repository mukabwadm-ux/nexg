/**
 * GET /v1/zones
 *
 * Returns active delivery zones with their bounding boxes.
 *
 * Zone bounds are used by the onboarding flow to show coverage.
 * The view is security_invoker (RLS policy `zone_read_public` allows anon
 * to read active zones).
 */
import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase';
import { jsonError } from '@/lib/http';
import { PublicZone } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300; // zones change rarely

export async function GET() {
  const supabase = createPublicClient();

  const { data: zones, error } = await supabase
    .from('zone_bounds')
    .select('id, city_id, name, tier, eta_min, eta_max, cod_allowed, west, south, east, north')
    .order('name', { ascending: true });

  if (error) {
    console.error('zones error:', error);
    return jsonError('internal_error', 'Failed to fetch zones');
  }

  const response = {
    ok: true,
    data: {
      items: (zones ?? []).map((zone) => PublicZone.parse(zone)),
      next_cursor: null, // no pagination for zones (small, stable set)
    },
    meta: {
      api_version: 'v1' as const,
      limit: 100,
    },
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}