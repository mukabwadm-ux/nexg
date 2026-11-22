/**
 * POST /v1/test/orders/[id]/rider
 *
 * Sandbox only: give a test ride or courier a test rider, as a real one gets
 * when a rider accepts its delivery job, so a developer can watch
 * booking.rider_assigned arrive at their test endpoint. Again for a new
 * rider. No body.
 *
 * The database holds the rules (`rpc_order_rider_api_test`): a test key with
 * merchant_write, bound to a merchant; a ride or a courier only; not once it
 * is completed or cancelled.
 */
import { NextResponse } from 'next/server';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { privateHeaders } from '@/lib/cache';
import { SANDBOX_RIDER_FUNCTION, sandboxMover } from '@/lib/orders';
import { sandboxCaller, sandboxError } from '@/lib/sandbox-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) => {
    const caller = await sandboxCaller(request, params.id);
    if (!caller.ok) return caller.response;
    const { credential, rate } = caller;

    const { data, error } = await sandboxMover().rpc(SANDBOX_RIDER_FUNCTION, {
      p_api_key: credential.rawKey,
      p_order_id: params.id,
    });
    if (error) return sandboxError(error, 'The test rider could not be assigned.');

    const result = (Array.isArray(data) ? data[0] : data) as {
      ok?: boolean;
      order?: unknown;
      assigned_at?: unknown;
    } | null;
    if (result?.ok !== true || !result.order || typeof result.assigned_at !== 'string') {
      return jsonError('internal_error', 'The test booking could not be read back.', {
        detail: result,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        data: { order: result.order, assigned_at: result.assigned_at },
        meta: { api_version: 'v1' as const },
      },
      { headers: privateHeaders(rate, credential) },
    );
  },
);
