/**
 * POST /v1/reservations/[id]/reschedule
 *
 * Moves a reservation to another time before it starts, under the same
 * rules as the merchant console: the new time must be free, and a time that
 * costs more than was paid is refused (409). Needs expected_version and an
 * Idempotency-Key. reservation.updated goes to your endpoints.
 */
import { withErrorEnvelope } from '@/lib/http';
import { reservationAction } from '@/lib/reservation-routes';
import { ReservationReschedule } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    reservationAction(request, params.id, 'reschedule', ReservationReschedule),
);
