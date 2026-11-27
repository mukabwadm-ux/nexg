/**
 * GET /v1/reservations/[id]
 *
 * One of the key's merchant's reservations, by its id (from a list or from a
 * reservation.* event), with what the event leaves out: the name it is under,
 * the trip's addresses and the notes. A reservation of another business is
 * answered exactly like one that does not exist.
 */
import { NextResponse } from 'next/server';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import { BookingEngineUnavailable, engineDetail, engineGet } from '@/lib/booking-engine';
import { ApiReservation } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The booking engine's id characters (apps/web/lib/booking/bridge.ts). */
const RESERVATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

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
        'This key is not bound to a merchant, so it cannot read its reservations.',
        { status: 403 },
      );
    }

    if (!RESERVATION_ID.test(params.id)) {
      return jsonError('invalid_request', 'Invalid reservation ID', {
        fields: { id: 'A reservation id is the id from a reservation or a reservation event.' },
      });
    }

    // The sandbox has no reservations yet.
    if (credential.environment === 'test') return jsonError('not_found', 'Reservation not found');

    let answer;
    try {
      answer = await engineGet(
        `/v1/platform/reservations/${encodeURIComponent(params.id)}`,
        credential.merchantId,
        credential.keyId,
      );
    } catch (e) {
      if (e instanceof BookingEngineUnavailable) {
        return jsonError(
          'internal_error',
          'Reservations cannot be read right now. Try again shortly.',
          { status: 503, detail: e.message },
        );
      }
      throw e;
    }

    if (answer.status === 404) return jsonError('not_found', 'Reservation not found');
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

    const reservation = ApiReservation.safeParse(answer.body);
    if (!reservation.success) {
      return jsonError('internal_error', 'The reservation could not be read.', {
        detail: reservation.error.issues,
      });
    }

    return NextResponse.json(
      { ok: true, data: { reservation: reservation.data }, meta: { api_version: 'v1' as const } },
      { headers: privateHeaders(rate, credential) },
    );
  },
);
