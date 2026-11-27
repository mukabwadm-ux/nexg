/**
 * POST /v1/offerings/[id]/departures
 *
 * Adds a departure to a tour or class (starts_at, ends_at, capacity,
 * published), or changes or closes one (departure_id with its version;
 * published: false closes it to new bookings). Needs the offering's version
 * and an Idempotency-Key; a live key with catalogue_write. Answers the
 * offering with its departures.
 */
import { withErrorEnvelope } from '@/lib/http';
import { setupChange } from '@/lib/reservation-routes';
import { ApiOffering, DepartureRequest } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    setupChange(request, {
      method: 'POST',
      path: `/v1/platform/offerings/${encodeURIComponent(params.id)}/departures`,
      id: params.id,
      body: DepartureRequest,
      result: ApiOffering,
      name: 'offering',
    }),
);
