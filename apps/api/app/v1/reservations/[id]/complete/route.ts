/**
 * POST /v1/reservations/[id]/complete
 *
 * The trip or work is done, with a short note kept with the booking. A
 * rental is returned. Needs expected_version and an Idempotency-Key.
 * reservation.status_changed goes to your endpoints.
 */
import { withErrorEnvelope } from '@/lib/http';
import { reservationAction } from '@/lib/reservation-routes';
import { ReservationComplete } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    reservationAction(request, params.id, 'complete', ReservationComplete),
);
