/**
 * GET /v1/services
 *
 * The services a merchant can book through the API.
 *
 * Public, because a developer needs to know what is bookable before
 * they have a key, and a developer who cannot find the list will not
 * build the integration.
 */
import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase';
import { jsonError } from '@/lib/http';
import { ApiService } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET() {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('api_service')
    .select('code, label, kind, unit_label, active')
    .eq('active', true)
    .order('code', { ascending: true });

  if (error) {
    console.error('services error:', error);
    return jsonError('internal_error', 'Failed to fetch services', { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        items: (data ?? []).map((service) => ApiService.parse(service)),
        next_cursor: null,
      },
      meta: { api_version: 'v1' as const, limit: 100 },
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    },
  );
}