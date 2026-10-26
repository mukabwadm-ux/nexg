/**
 * GET /v1/orders
 * GET /v1/orders/{id}
 *
 * A merchant reads their bookings through the API.
 *
 * Without a path param: a cursor-paginated list of orders, newest first.
 * With a path param: a single order by ID.
 *
 * The key decides the merchant. The caller never names one, so a key
 * cannot read another merchant's orders by guessing a UUID.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

import { jsonError, parseQuery } from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { ListRequest } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: { id?: string } },
) {
  let credential;
  try {
    credential = await authenticate(request);
    requireScope(credential, API_SCOPES.merchant_read);
    await enforceRateLimit(credential);
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status });
    }
    return jsonError('internal_error', 'Something went wrong on our side.', { status: 500 });
  }

  if (credential.merchantId === null) {
    return jsonError(
      'not_found',
      'This key is not bound to a merchant, so it cannot read its orders.',
      { status: 403 },
    );
  }

  const supabase = serviceRoleClient();
  const id = params?.id;

  if (id) {
    // Single order by ID
    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
      }
    ).rpc('rpc_order_read_api', {
      p_api_key: credential.rawKey,
      p_order_id: id,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      const badRequest = code === '22023';
      const refused = code === '42501';

      return jsonError(
        refused ? 'not_found' : badRequest ? 'invalid_request' : 'internal_error',
        error.message,
        { status: refused ? 403 : badRequest ? 400 : 500 },
      );
    }

    const result = (Array.isArray(data) ? data[0] : data) as
      | { ok: boolean; items: unknown; next_cursor: unknown }
      | null;

    if (!result || !result.ok) {
      return jsonError('internal_error', 'The order could not be read.');
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          items: Array.isArray(result.items) ? result.items : [result.items],
        },
        meta: { api_version: 'v1' as const },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      },
    );
  }

  // List of orders, with pagination
  const url = new URL(request.url);
  const queryResult = parseQuery(ListRequest, url.searchParams);

  if (!queryResult.ok) {
    return queryResult.error;
  }

  const { cursor, limit: rawLimit } = queryResult.data;
  const limit = Math.min(Math.max(rawLimit ?? 25, 1), 100);

  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;

  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const parts = decoded.split('|');
      if (parts.length === 2) {
        cursorCreatedAt = parts[0] ?? null;
        cursorId = parts[1] ?? null;
      }
    } catch {
      // Invalid cursor, treat as if not provided
    }
  }

  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    }
  ).rpc('rpc_order_read_api', {
    p_api_key: credential.rawKey,
    p_limit: limit,
    p_cursor_created_at: cursorCreatedAt,
    p_cursor_id: cursorId,
  });

  if (error) {
    const refused = (error as { code?: string }).code === '42501';
    return jsonError(
      refused ? 'not_found' : 'internal_error',
      error.message,
      { status: refused ? 403 : 500 },
    );
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; items: unknown[]; next_cursor: { created_at: string; id: string } | null }
    | null;

  if (!result || !result.ok) {
    return jsonError('internal_error', 'The orders could not be read.');
  }

  let nextCursor: string | null = null;
  if (result.next_cursor) {
    nextCursor = Buffer.from(
      `${result.next_cursor.created_at}|${result.next_cursor.id}`,
    ).toString('base64url');
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        items: result.items ?? [],
        next_cursor: nextCursor,
      },
      meta: {
        api_version: 'v1' as const,
        limit,
      },
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    },
  );
}