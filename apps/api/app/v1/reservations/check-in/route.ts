/**
 * POST /v1/reservations/check-in
 *
 * The customer shows their six-character booking code at your desk or to the
 * driver; with the name they give, NexG checks it and marks them arrived. The
 * answer is the reservation, never the code. Ten wrong codes or names in 15
 * minutes lock the key out for a while. A live key only; needs an
 * Idempotency-Key.
 */
import { withErrorEnvelope } from '@/lib/http';
import { engineWrite } from '@/lib/reservation-routes';
import { ApiReservation, ReservationCheckIn } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(async (request: Request) =>
  engineWrite(request, {
    scope: 'merchant_write',
    path: '/v1/platform/reservations/check-in',
    body: ReservationCheckIn,
    result: ApiReservation,
    name: 'reservation',
    status: 200,
    testRefusal: 'Test reservations have no booking codes: check-in needs a live key.',
    notFound: 'No booking with that code.',
  }),
);
