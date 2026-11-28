/**
 * GET /v1/reservations
 *
 * The key's merchant's reservations: tour seats, transfers, rentals,
 * appointments and requests, from NexG's booking engine (lib/booking-engine.ts).
 * Oldest change first, so a system can page forward with next_cursor and keep
 * the last `updated_at` it saw for `updated_after` next time.
 *
 * - The key decides the merchant; the request never names one.
 * - A test key reads its test reservations (POST /v1/test/reservations).
 * - Each item is checked against the contract before it is sent, so a field
 *   the engine adds by mistake never reaches a client.
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
import { BookingEngineUnavailable, engineDetail, engineGet } from '@/lib/booking-engine';
import {
  SANDBOX,
  checkReservation,
  engineWrite,
  sandbox,
  sandboxRefusal,
} from '@/lib/reservation-routes';
import { ApiReservation, ReservationCreate, ReservationListRequest } from '@nexg/contracts/api';

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
      'This key is not bound to a merchant, so it cannot read its reservations.',
      { status: 403 },
    );
  }

  const query = parseQuery(ReservationListRequest, new URL(request.url).searchParams);
  if (!query.ok) return query.error;
  const { limit, cursor, updated_after } = query.data;

  const page = (items: unknown[], nextCursor: string | null) =>
    NextResponse.json(
      {
        ok: true,
        data: { items, next_cursor: nextCursor },
        meta: { api_version: 'v1' as const, limit },
      },
      { headers: privateHeaders(rate, credential) },
    );

  if (credential.environment === 'test') {
    // A test key reads its sandbox reservations (POST /v1/test/reservations).
    const after = cursor ? decodeKeysetCursor(cursor) : null;
    if (cursor && !after) return invalidCursor();
    const { data, error } = await sandbox().rpc(SANDBOX.read, {
      p_api_key: credential.rawKey,
      p_limit: limit,
      p_cursor_updated_at: after?.at ?? null,
      p_cursor_id: after?.id ?? null,
      p_updated_after: updated_after ?? null,
    });
    if (error) return sandboxRefusal(error);
    const result = (Array.isArray(data) ? data[0] : data) as {
      items?: unknown;
      next_cursor?: { updated_at: string; id: string } | null;
    } | null;
    const tested = Array.isArray(result?.items)
      ? result.items.map((item) => checkReservation(item))
      : null;
    if (!tested || tested.some((entry) => !entry.success)) {
      return jsonError('internal_error', 'The test reservations could not be read.', {
        detail: tested?.find((entry) => !entry.success),
      });
    }
    return page(
      tested.map((entry) => (entry.success ? entry.data : null)),
      result?.next_cursor
        ? encodeCursor(result.next_cursor.updated_at, result.next_cursor.id)
        : null,
    );
  }

  const search = new URLSearchParams({ limit: String(limit) });
  if (cursor) search.set('cursor', cursor);
  if (updated_after) search.set('updated_after', updated_after);

  let answer;
  try {
    answer = await engineGet(
      `/v1/platform/reservations?${search.toString()}`,
      credential.merchantId,
      credential.keyId,
    );
  } catch (e) {
    if (e instanceof BookingEngineUnavailable) {
      return jsonError(
        'internal_error',
        'Reservations cannot be read right now. Try again shortly.',
        {
          status: 503,
          detail: e.message,
        },
      );
    }
    throw e;
  }

  if (answer.status === 400) {
    // A cursor this endpoint did not issue: the engine's message says which.
    return jsonError('invalid_request', engineDetail(answer.body) ?? 'That request was refused.', {
      fields: { cursor: 'Pass back the next_cursor from the previous page, unchanged.' },
    });
  }
  if (answer.status !== 200) {
    return jsonError(
      'internal_error',
      'Reservations cannot be read right now. Try again shortly.',
      {
        status: 503,
        detail: { engine_status: answer.status, engine: engineDetail(answer.body) },
      },
    );
  }

  const body = answer.body as { items?: unknown; next_cursor?: unknown } | null;
  const items = Array.isArray(body?.items) ? body.items : null;
  const checked = items?.map((item) => checkReservation(item));
  if (!checked || checked.some((result) => !result.success)) {
    return jsonError('internal_error', 'The reservations could not be read.', {
      detail: checked?.find((result) => !result.success),
    });
  }
  const nextCursor = typeof body?.next_cursor === 'string' ? body.next_cursor : null;
  return page(
    checked.map((result) => (result.success ? result.data : null)),
    nextCursor,
  );
});

/**
 * POST /v1/reservations: a booking your team took elsewhere (by phone, at
 * the desk), so NexG's calendar holds the time and nobody books it twice. It
 * needs the guest's email or phone, kept for your business only and never
 * returned. A live key with merchant_write and an Idempotency-Key. Answers 201.
 */
export const POST = withErrorEnvelope(async (request: Request) =>
  engineWrite(request, {
    scope: 'merchant_write',
    path: '/v1/platform/reservations',
    body: ReservationCreate,
    result: ApiReservation,
    name: 'reservation',
    status: 201,
    testRefusal: 'With a test key, make test reservations with POST /v1/test/reservations.',
    notFound: 'The offering was not found.',
  }),
);
