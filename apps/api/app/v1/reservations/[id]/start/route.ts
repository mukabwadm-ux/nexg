/**
 * POST /v1/reservations/[id]/start
 *
 * The trip or work has begun: the driver picked the guest up, the tour left.
 * A rental is handed over. Only a confirmed reservation starts, and one that
 * waits for payment is refused (409). Needs expected_version and an
 * Idempotency-Key. reservation.status_changed goes to your endpoints.
 */
import { withErrorEnvelope } from '@/lib/http';
import { reservationAction } from '@/lib/reservation-routes';
import { ReservationStart } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    reservationAction(request, params.id, 'start', ReservationStart),
);
