/**
 * GET /v1/orders and POST /v1/orders
 *
 * GET: a merchant reads their bookings through the API. A
 * cursor-paginated list of orders, newest first. One order by id is
 * GET /v1/orders/{id}, in ./[id]/route.ts.
 *
 * POST: a merchant books a service for its guests, such as an airport
 * transfer, a courier or a venue. See the POST handler below.
 *
 * The key decides the merchant. The caller never names one, so a key
 * cannot read another merchant's orders by guessing a UUID, and cannot
 * book on somebody else's account.
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
import { orderReader, orderWriter } from '@/lib/orders';
import { parse } from '@nexg/contracts';
import { BookingReceipt, IdempotencyKey, ListRequest, ServiceBooking } from '@nexg/contracts/api';

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

/*
 * The refusals the pricing function raises without a SQLSTATE of its own
 * (P0001). Both are about what can be booked, so the caller hears them; any
 * other P0001 is a fault on NexG's side and is logged instead.
 */
const PRICING_REFUSALS = ['That service is not priced yet', 'How many are we moving?'];

/** The database refusals a caller can act on, and everything else as a 500. */
function bookingError(error: { message: string; code?: string }) {
  const message = error.message || 'The booking could not be placed.';
  // 22023: the request itself is wrong (service, quantity, places, time).
  if (error.code === '22023') return jsonError('invalid_request', message);
  // 42501: refused (the key, its scope, or a merchant that is not live).
  if (error.code === '42501') {
    const keyRefused = message.startsWith('That API key is not valid');
    return jsonError('not_found', message, { status: keyRefused ? 401 : 403 });
  }
  if (error.code === 'P0001' && PRICING_REFUSALS.some((m) => message.startsWith(m))) {
    return jsonError('invalid_request', message);
  }
  return jsonError('internal_error', 'The booking could not be placed.', { detail: error });
}

/**
 * POST /v1/orders: a merchant books a service.
 *
 * - The key must carry `merchant_write` and be bound to a merchant. The
 *   key decides whose account the booking is charged to.
 * - Every booking needs an `Idempotency-Key`. The database stores it with
 *   the order in one transaction, so a retry gets the first answer back
 *   and never books a second airport transfer.
 * - The caller never states a price. The body is strict, so a price field
 *   is refused; the database prices the booking from NexG's fee settings
 *   for the merchant's city, and refuses a service not priced there yet.
 * - Only `on_account` payment for now (see ServiceBooking).
 *
 * Answers 201 with the receipt as `data.booking`, a `Location` header for
 * the full order, and the same answer again on a retry with the same key.
 */
export const POST = withErrorEnvelope(async (request: Request) => {
  let credential;
  let rate;
  try {
    credential = await authenticate(request);
    requireScope(credential, API_SCOPES.merchant_write);
    rate = await enforceRateLimit(credential, request, 'merchant_write');
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status, retryAfter: e.retryAfter });
    }
    return jsonError('internal_error', 'Something went wrong on our side.', { status: 500 });
  }

  if (credential.merchantId === null) {
    return jsonError(
      'not_found',
      'This key is not bound to a merchant, so it cannot book anything.',
      { status: 403 },
    );
  }

  const idempotencyKey = IdempotencyKey.safeParse(request.headers.get('idempotency-key'));
  if (!idempotencyKey.success) {
    return jsonError(
      'invalid_request',
      'Every booking needs an Idempotency-Key header: 16 to 128 characters, new for each booking.',
      { fields: { 'Idempotency-Key': 'Required, 16 to 128 characters.' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_request', 'The body must be a JSON object.', {
      fields: { body: 'Send the booking as JSON.' },
    });
  }

  const booking = parse(ServiceBooking, body);
  if (!booking.ok) {
    return jsonError('invalid_request', booking.failure.message, {
      fields: booking.failure.fields,
    });
  }

  const place = () =>
    orderWriter().rpc('rpc_order_place_api', {
      p_api_key: credential.rawKey,
      p_idempotency_key: idempotencyKey.data,
      p_payload: booking.data,
    });

  let { data, error } = await place();
  /*
   * Two requests with the same key at the same moment: the second one
   * loses the race on the key's unique index (23505) and its transaction,
   * order included, rolls back. Asking once more returns the first
   * request's stored answer, which is what a retry should get.
   */
  if (error?.code === '23505') ({ data, error } = await place());
  if (error) return bookingError(error);

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const { ok, ...fields } = row ?? {};
  const receipt = BookingReceipt.safeParse(fields);
  if (ok !== true || !receipt.success) {
    // Placed or not, retrying with the same Idempotency-Key cannot book twice.
    return jsonError(
      'internal_error',
      'NexG could not read the booking back. Retry with the same Idempotency-Key.',
      { detail: row },
    );
  }

  return NextResponse.json(
    { ok: true, data: { booking: receipt.data }, meta: { api_version: 'v1' as const } },
    {
      status: 201,
      headers: { ...privateHeaders(rate), Location: `/v1/orders/${receipt.data.order_id}` },
    },
  );
});
