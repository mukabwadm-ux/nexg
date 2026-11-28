/**
 * POST /v1/reservations/[id]/decline
 *
 * Declines a reservation that is still waiting and unpaid, with an optional
 * reason. A confirmed or paid booking is cancelled through NexG support, as
 * API orders are after a rider is assigned (409). Needs expected_version and
 * an Idempotency-Key. With a test key it declines a test reservation.
 */
import { withErrorEnvelope } from '@/lib/http';
import { reservationAction } from '@/lib/reservation-routes';
import { ReservationDecline } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    reservationAction(request, params.id, 'decline', ReservationDecline),
);
