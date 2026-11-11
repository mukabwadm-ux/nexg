/**
 * GET /v1/orders
 *
 * A merchant reads their bookings through the API.
 *
 * A cursor-paginated list of orders, newest first. One order by id is
 * GET /v1/orders/{id}, in ./[id]/route.ts.
 *
 * The key decides the merchant. The caller never names one, so a key
 * cannot read another merchant's orders by guessing a UUID.
 */
import { NextResponse } from 'next/server';

import {
  decodeKeysetCursor,
  encodeCursor,
  invalidCursor,
  jsonError,
  parseQuery,
  withErrorEnvelope,
} from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import { orderReader } from '@/lib/orders';
import { ListRequest } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorEnvelope(async (request: Request) => {
  let credential;
  let rate;
  try {
    credential = await authenticate(request);
    requireScope(credential, API_SCOPES.merchant_read);
    rate = await enforceRateLimit(credential, request, 'merchant_read');
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status, retryAfter: e.retryAfter });
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

  const url = new URL(request.url);
  const queryResult = parseQuery(ListRequest, url.searchParams);

  if (!queryResult.ok) {
    return queryResult.error;
  }

  const { cursor, limit } = queryResult.data;

  // The cursor is (created_at, id) of the last order on the previous page.
  const after = cursor ? decodeKeysetCursor(cursor) : null;
  if (cursor && !after) return invalidCursor();

  const { data, error } = await orderReader().rpc('rpc_order_read_api', {
    p_api_key: credential.rawKey,
    p_limit: limit,
    p_cursor_created_at: after?.at ?? null,
    p_cursor_id: after?.id ?? null,
  });

  if (error) {
    const refused = error.code === '42501';
    return refused
      ? jsonError('not_found', 'This credential cannot read orders.', { status: 403 })
      : jsonError('internal_error', 'The orders could not be read.', { detail: error });
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    ok: boolean;
    items: unknown[];
    next_cursor: { created_at: string; id: string } | null;
  } | null;

  if (!result || !result.ok) {
    return jsonError('internal_error', 'The orders could not be read.', { detail: result });
  }

  const nextCursor = result.next_cursor
    ? encodeCursor(result.next_cursor.created_at, result.next_cursor.id)
    : null;

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
    { headers: privateHeaders(rate) },
  );
});
