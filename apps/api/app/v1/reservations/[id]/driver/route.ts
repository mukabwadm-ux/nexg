/**
 * PUT /v1/reservations/[id]/driver
 *
 * Sets who is coming for a reservation: the driver's first name, the vehicle
 * and its plate, shown to the customer on their booking. `driver: null`
 * clears it. Never a phone number. Needs expected_version and an
 * Idempotency-Key. With a test key it sets a test reservation's driver.
 */
import { withErrorEnvelope } from '@/lib/http';
import { reservationAction } from '@/lib/reservation-routes';
import { ReservationDriverRequest } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    reservationAction(request, params.id, 'driver', ReservationDriverRequest),
);
