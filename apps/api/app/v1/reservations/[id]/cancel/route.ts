/**
 * POST /v1/reservations/[id]/cancel
 *
 * Cancels a reservation before it starts, paid or not, with a reason the
 * customer sees. When the customer has paid, NexG refunds them in full: the
 * reservation answers refund_state review_required while NexG Finance does it.
 * Needs expected_version and an Idempotency-Key.
 */
import { withErrorEnvelope } from '@/lib/http';
import { reservationAction } from '@/lib/reservation-routes';
import { ReservationCancel } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    reservationAction(request, params.id, 'cancel', ReservationCancel),
);
