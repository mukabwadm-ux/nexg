/**
 * POST /v1/delivery/check
 *
 * "Can you deliver here?" One call with a pickup and a drop-off answers
 * whether NexG can take the trip, and why not when it cannot; the city and
 * the zone at each end; the straight-line distance and the most NexG goes;
 * the drop-off zone's usual delivery time; and the fee from the rate card.
 *
 * The database decides all of it (`rpc_delivery_check`). Everything in the
 * answer is public, so it needs no key, like GET /v1/zones; a key with
 * public_read gets its own token bucket. It is a POST so that a customer's
 * address stays out of URLs and the logs that keep them. It changes nothing,
 * and its answer is never stored: a zone can be paused at any minute.
 */
import { NextResponse } from 'next/server';

import { DeliveryCheck, DeliveryCheckRequest } from '@nexg/contracts/api';

import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import { DELIVERY_CHECK_FUNCTION, deliveryClient } from '@/lib/delivery';
import { jsonError, withErrorEnvelope } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BODY_HELP =
  'Send pickup_lat, pickup_lng, dropoff_lat and dropoff_lng as numbers: latitudes from -90 to 90, longitudes from -180 to 180.';

export const POST = withErrorEnvelope(async (request: Request) => {
  let credential;
  let rate;
  try {
    credential = await authenticate(request);
    requireScope(credential, API_SCOPES.public_read);
    rate = await enforceRateLimit(credential, request);
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status, retryAfter: e.retryAfter });
    }
    return jsonError('internal_error', 'Something went wrong on our side.', { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_request', 'The body must be a JSON object.', {
      fields: { body: BODY_HELP },
    });
  }

  const trip = DeliveryCheckRequest.safeParse(body);
  if (!trip.success) {
    const fields: Record<string, string> = {};
    for (const issue of trip.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          fields[key] = 'Not a field this endpoint takes: only the four coordinates.';
        }
      } else {
        fields[issue.path.join('.') || 'body'] = issue.message;
      }
    }
    return jsonError('invalid_request', BODY_HELP, { fields });
  }

  const { data, error } = await deliveryClient().rpc(DELIVERY_CHECK_FUNCTION, {
    p_pickup_lat: trip.data.pickup_lat,
    p_pickup_lng: trip.data.pickup_lng,
    p_dropoff_lat: trip.data.dropoff_lat,
    p_dropoff_lng: trip.data.dropoff_lng,
  });
  if (error) {
    // 22023: the database refused a coordinate the schema let through.
    if (error.code === '22023') return jsonError('invalid_request', error.message);
    return jsonError('internal_error', 'NexG could not check that trip.', { detail: error });
  }

  const answer = DeliveryCheck.safeParse(Array.isArray(data) ? data[0] : data);
  if (!answer.success) {
    return jsonError('internal_error', 'NexG could not check that trip.', { detail: data });
  }

  return NextResponse.json(
    { ok: true, data: answer.data, meta: { api_version: 'v1' as const } },
    { headers: privateHeaders(rate, credential) },
  );
});
