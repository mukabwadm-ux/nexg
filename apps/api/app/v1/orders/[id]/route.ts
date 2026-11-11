/**
 * GET /v1/orders/[id]
 *
 * One of the merchant's orders, by its order_id.
 *
 * The same read as the list (`rpc_order_read_api`), so the order is the
 * same object a list item is. The key decides the merchant: an id that
 * belongs to another merchant is answered exactly like one that does not
 * exist, so a key cannot learn which order ids are real.
 */
import { NextResponse } from 'next/server';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import { orderReader } from '@/lib/orders';
import { Uuid } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) => {
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

    if (!Uuid.safeParse(params.id).success) {
      return jsonError('invalid_request', 'Invalid order ID', {
        fields: { id: 'An order id is a UUID: the order_id from an order.' },
      });
    }

    const { data, error } = await orderReader().rpc('rpc_order_read_api', {
      p_api_key: credential.rawKey,
      p_order_id: params.id,
    });

    if (error) {
      // 22023: no order with that id for this key's merchant.
      if (error.code === '22023') return jsonError('not_found', 'Order not found');
      if (error.code === '42501') {
        return jsonError('not_found', 'This credential cannot read orders.', { status: 403 });
      }
      return jsonError('internal_error', 'The order could not be read.', { detail: error });
    }

    const result = (Array.isArray(data) ? data[0] : data) as {
      ok: boolean;
      items: unknown;
    } | null;
    const order = result?.ok && Array.isArray(result.items) ? result.items[0] : undefined;

    if (!order) {
      return jsonError('internal_error', 'The order could not be read.', { detail: result });
    }

    return NextResponse.json(
      { ok: true, data: { order }, meta: { api_version: 'v1' as const } },
      { headers: privateHeaders(rate) },
    );
  },
);
