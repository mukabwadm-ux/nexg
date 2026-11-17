/**
 * POST /v1/test/orders/[id]/status
 *
 * Sandbox only: move a test booking to a later status, so a developer can
 * watch booking.status_changed arrive at their test endpoint. Real bookings
 * move as the merchant and NexG work on them, so there is no live twin.
 *
 * The database holds every rule (`rpc_order_status_api_test`): a test key
 * with merchant_write, bound to a merchant; the key decides the merchant, so
 * another merchant's booking answers like one that does not exist; and a
 * booking only moves forward, or to cancelled, until it is completed or
 * cancelled.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import { SANDBOX_MOVE_FUNCTION, sandboxMover } from '@/lib/orders';
import { TEST_STATUSES } from '@/lib/sandbox';
import { Uuid } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_HELP = 'One of confirmed, in_progress, completed or cancelled.';

const StatusChange = z
  .object({ status: z.enum(TEST_STATUSES, { errorMap: () => ({ message: STATUS_HELP }) }) })
  .strict();

/** The database refusals a caller can act on, and everything else as a 500. */
function moveError(error: { message: string; code?: string }) {
  // P0002: no test booking with that id for this key's merchant.
  if (error.code === 'P0002') return jsonError('not_found', 'Order not found');
  // 22023: the booking cannot move there; the message says why.
  if (error.code === '22023') return jsonError('invalid_request', error.message);
  // 42501: refused (the key, its kind or its scope).
  if (error.code === '42501') {
    const keyRefused = error.message.startsWith('That API key is not valid');
    return jsonError('not_found', error.message, { status: keyRefused ? 401 : 403 });
  }
  return jsonError('internal_error', 'The test booking could not be moved.', { detail: error });
}

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) => {
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

    if (credential.environment !== 'test') {
      return jsonError(
        'not_found',
        'Only a test key (nexg_test_…) moves bookings. Real bookings move as the merchant and NexG work on them.',
        { status: 403 },
      );
    }

    if (credential.merchantId === null) {
      return jsonError(
        'not_found',
        'This key is not bound to a merchant, so it has no test bookings to move.',
        { status: 403 },
      );
    }

    if (!Uuid.safeParse(params.id).success) {
      return jsonError('invalid_request', 'Invalid order ID', {
        fields: { id: 'An order id is a UUID: the order_id of a test booking.' },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('invalid_request', 'The body must be a JSON object.', {
        fields: { status: STATUS_HELP },
      });
    }

    const change = StatusChange.safeParse(body);
    if (!change.success) {
      const fields = Object.fromEntries(
        change.error.issues.map((issue) => [
          issue.path.join('.') ||
            (issue.code === 'unrecognized_keys' ? issue.keys.join(', ') : 'status'),
          issue.code === 'unrecognized_keys' ? 'Not a field this endpoint takes.' : issue.message,
        ]),
      );
      return jsonError(
        'invalid_request',
        'Send the status to move the booking to: confirmed, in_progress, completed or cancelled.',
        { fields },
      );
    }

    const { data, error } = await sandboxMover().rpc(SANDBOX_MOVE_FUNCTION, {
      p_api_key: credential.rawKey,
      p_order_id: params.id,
      p_status: change.data.status,
    });
    if (error) return moveError(error);

    const result = (Array.isArray(data) ? data[0] : data) as {
      ok?: boolean;
      order?: unknown;
      previous_status?: unknown;
    } | null;
    if (result?.ok !== true || !result.order || typeof result.previous_status !== 'string') {
      return jsonError('internal_error', 'The test booking could not be read back.', {
        detail: result,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        data: { order: result.order, previous_status: result.previous_status },
        meta: { api_version: 'v1' as const },
      },
      { headers: privateHeaders(rate, credential) },
    );
  },
);
