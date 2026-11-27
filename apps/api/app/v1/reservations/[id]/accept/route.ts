/**
 * POST /v1/reservations/[id]/accept
 *
 * Confirms a reservation that is waiting for the business, or accepts a work
 * request. Needs the version you read (expected_version) and an
 * Idempotency-Key. A customer booking on NexG confirms itself once paid, so
 * one still waiting for payment is refused (409). With a test key it accepts a
 * test reservation. See lib/reservation-routes.ts.
 */
import { withErrorEnvelope } from '@/lib/http';
import { reservationAction } from '@/lib/reservation-routes';
import { ReservationAccept } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    reservationAction(request, params.id, 'accept', ReservationAccept),
);
