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
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { ApiService } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET(request: Request) {
  try {
    const credential = await authenticate(request);
    requireScope(credential, API_SCOPES.public_read);
    await enforceRateLimit(credential, request);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.code, error.message, {
        status: error.status,
        retryAfter: error.retryAfter,
      });
    }
    return jsonError('internal_error', 'The API is temporarily unavailable.', { status: 503 });
  }
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
