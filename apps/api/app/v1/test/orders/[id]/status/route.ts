/**
 * POST /v1/test/orders/[id]/status
 *
 * Sandbox only: move a test booking to a later status or stage, so a
 * developer can watch booking.status_changed and booking.stage_changed
 * arrive at their test endpoint. Real bookings move as the merchant, NexG
 * and the rider work on them, so there is no live twin.
 *
 * The database holds every rule (`rpc_order_status_api_test` for a status,
 * `rpc_order_stage_api_test` for a stage): a test key with merchant_write,
 * bound to a merchant; the key decides the merchant, so another merchant's
 * booking answers like one that does not exist; and a booking only moves
 * forward, or to cancelled, until it is completed or cancelled.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { privateHeaders } from '@/lib/cache';
import { SANDBOX_MOVE_FUNCTION, SANDBOX_STAGE_FUNCTION, sandboxMover } from '@/lib/orders';
import { TEST_STAGES, TEST_STATUSES } from '@/lib/sandbox';
import { sandboxCaller, sandboxError } from '@/lib/sandbox-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_HELP = 'One of confirmed, in_progress, completed or cancelled.';
const STAGE_HELP =
  'One of confirmed, preparing, ready, picked_up, arriving, delivered or cancelled.';

const Move = z
  .object({
    status: z.enum(TEST_STATUSES, { errorMap: () => ({ message: STATUS_HELP }) }).optional(),
    stage: z.enum(TEST_STAGES, { errorMap: () => ({ message: STAGE_HELP }) }).optional(),
  })
  .strict()
  .refine((move) => (move.status === undefined) !== (move.stage === undefined), {
    message: 'Send status or stage, one of them.',
  });

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) => {
    const caller = await sandboxCaller(request, params.id);
    if (!caller.ok) return caller.response;
    const { credential, rate } = caller;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('invalid_request', 'The body must be a JSON object.', {
        fields: { body: 'Send status or stage, as JSON.' },
      });
    }

    const move = Move.safeParse(body);
    if (!move.success) {
      const fields: Record<string, string> = {};
      for (const issue of move.error.issues) {
        if (issue.code === 'unrecognized_keys') {
          for (const key of issue.keys) fields[key] = 'Not a field this endpoint takes.';
        } else {
          fields[issue.path.join('.') || 'body'] = issue.message;
        }
      }
      return jsonError(
        'invalid_request',
        'Send the status (confirmed, in_progress, completed or cancelled) or the stage to move the booking to.',
        { fields },
      );
    }

    const { data, error } = move.data.stage
      ? await sandboxMover().rpc(SANDBOX_STAGE_FUNCTION, {
          p_api_key: credential.rawKey,
          p_order_id: params.id,
          p_stage: move.data.stage,
        })
      : await sandboxMover().rpc(SANDBOX_MOVE_FUNCTION, {
          p_api_key: credential.rawKey,
          p_order_id: params.id,
          p_status: move.data.status,
        });
    if (error) return sandboxError(error, 'The test booking could not be moved.');

    const result = (Array.isArray(data) ? data[0] : data) as {
      ok?: boolean;
      order?: unknown;
      previous_status?: unknown;
      previous_stage?: unknown;
    } | null;
    if (result?.ok !== true || !result.order || typeof result.previous_status !== 'string') {
      return jsonError('internal_error', 'The test booking could not be read back.', {
        detail: result,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          order: result.order,
          previous_status: result.previous_status,
          ...(typeof result.previous_stage === 'string'
            ? { previous_stage: result.previous_stage }
            : {}),
        },
        meta: { api_version: 'v1' as const },
      },
      { headers: privateHeaders(rate, credential) },
    );
  },
);
