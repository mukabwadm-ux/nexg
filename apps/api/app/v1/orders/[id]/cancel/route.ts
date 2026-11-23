/**
 * POST /v1/orders/{id}/cancel
 *
 * Cancels one of the key's merchant's API bookings, free of charge, until a
 * rider is assigned. After that NexG answers 409 conflict: the rider is on
 * the way, and NexG support handles the cancellation. A test key cancels a
 * sandbox booking under the same rule.
 *
 * The database holds every rule (`rpc_order_cancel_api`): merchant_write,
 * the key's own merchant, bookings made through the API only (a customer's
 * website order is never reachable), and the rider check. Cancelling a
 * booking that is already cancelled answers 200 with cancelled false, so a
 * retry is safe.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import { CANCEL_FUNCTION, orderCanceller } from '@/lib/orders';
import { Uuid } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CancelRequest = z
  .object({
    reason: z.string().max(500, 'Up to 500 characters.').optional(),
  })
  .strict();

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

    if (credential.merchantId === null) {
      return jsonError('not_found', 'This key is not bound to a merchant, so it has no bookings.', {
        status: 403,
      });
    }

    if (!Uuid.safeParse(params.id).success) {
      return jsonError('invalid_request', 'Invalid order ID', {
        fields: { id: 'An order id is a UUID: the order_id from POST /v1/orders.' },
      });
    }

    // The body is optional: an empty one cancels without a reason.
    const text = await request.text();
    let body: unknown = {};
    if (text.trim() !== '') {
      try {
        body = JSON.parse(text);
      } catch {
        return jsonError('invalid_request', 'The body must be a JSON object, or empty.', {
          fields: { body: 'Send nothing, or {"reason": "…"}.' },
        });
      }
    }
    const cancel = CancelRequest.safeParse(body);
    if (!cancel.success) {
      const fields: Record<string, string> = {};
      for (const issue of cancel.error.issues) {
        if (issue.code === 'unrecognized_keys') {
          for (const key of issue.keys)
            fields[key] = 'Not a field this endpoint takes: only reason.';
        } else {
          fields[issue.path.join('.') || 'body'] = issue.message;
        }
      }
      return jsonError('invalid_request', 'Send nothing, or a reason of up to 500 characters.', {
        fields,
      });
    }

    const { data, error } = await orderCanceller().rpc(CANCEL_FUNCTION, {
      p_api_key: credential.rawKey,
      p_order_id: params.id,
      p_reason: cancel.data.reason ?? null,
    });

    if (error) {
      // P0002: not this merchant's API booking, or no such booking.
      if (error.code === 'P0002') return jsonError('not_found', 'Order not found');
      // P0004: too late, a rider has it or it is under way; the message says which.
      if (error.code === 'P0004') return jsonError('conflict', error.message);
      if (error.code === '22023') return jsonError('invalid_request', error.message);
      if (error.code === '42501') {
        const keyRefused = error.message.startsWith('That API key is not valid');
        return jsonError('not_found', error.message, { status: keyRefused ? 401 : 403 });
      }
      return jsonError('internal_error', 'The booking could not be cancelled.', { detail: error });
    }

    const result = (Array.isArray(data) ? data[0] : data) as {
      ok?: boolean;
      cancelled?: unknown;
      order?: unknown;
      previous_status?: unknown;
    } | null;
    if (
      result?.ok !== true ||
      typeof result.cancelled !== 'boolean' ||
      !result.order ||
      typeof result.previous_status !== 'string'
    ) {
      return jsonError('internal_error', 'The booking could not be read back.', { detail: result });
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          order: result.order,
          cancelled: result.cancelled,
          previous_status: result.previous_status,
        },
        meta: { api_version: 'v1' as const },
      },
      { headers: privateHeaders(rate, credential) },
    );
  },
);
