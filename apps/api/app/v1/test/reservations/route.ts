/**
 * POST /v1/test/reservations
 *
 * Makes a test reservation with a test key: a transfer for tomorrow under the
 * name Test Guest unless the body says otherwise. It sends reservation.created
 * to the merchant's test endpoints, and GET /v1/reservations with the test key
 * lists it. Nothing real is booked or charged.
 */
import { jsonError, withErrorEnvelope } from '@/lib/http';
import {
  SANDBOX,
  authorize,
  jsonBody,
  sandbox,
  sandboxRefusal,
  sandboxReservation,
} from '@/lib/reservation-routes';
import { privateHeaders } from '@/lib/cache';
import { TestReservationRequest } from '@nexg/contracts/api';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(async (request: Request) => {
  const auth = await authorize(
    request,
    'merchant_write',
    'merchant_write',
    'make test reservations',
  );
  if (auth instanceof Response) return auth;
  const { credential, rate } = auth;
  if (credential.environment !== 'test') {
    return jsonError('not_found', 'Only a test key makes test reservations.', { status: 403 });
  }
  const body = await jsonBody(request, TestReservationRequest);
  if (body instanceof Response) return body;

  // A trip always has all four fields, as the live shape does.
  const reservation = body.trip
    ? {
        ...body,
        trip: {
          pickup_area: body.trip.pickup_area ?? null,
          pickup_address: body.trip.pickup_address ?? null,
          dropoff_area: body.trip.dropoff_area ?? null,
          dropoff_address: body.trip.dropoff_address ?? null,
        },
      }
    : body;

  const { data, error } = await sandbox().rpc(SANDBOX.create, {
    p_api_key: credential.rawKey,
    p_reservation: reservation,
  });
  if (error) return sandboxRefusal(error);
  const made = sandboxReservation(data);
  if (!made.success) {
    return jsonError('internal_error', 'The test reservation could not be read back.', {
      detail: made.error.issues,
    });
  }
  return NextResponse.json(
    { ok: true, data: { reservation: made.data }, meta: { api_version: 'v1' as const } },
    { status: 201, headers: privateHeaders(rate, credential) },
  );
});
