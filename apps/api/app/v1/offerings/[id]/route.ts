/**
 * PATCH /v1/offerings/[id]
 *
 * Changes an offering's price (price_cents), switches it off (active) or stops
 * new bookings (booking_enabled). Needs the version you read and an
 * Idempotency-Key; a live key with catalogue_write. Bookings already made keep
 * their price, and an offering with open bookings keeps its price until they
 * are done (409), as in the merchant console.
 */
import { withErrorEnvelope } from '@/lib/http';
import { setupChange } from '@/lib/reservation-routes';
import { ApiOffering, OfferingUpdate } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    setupChange(request, {
      method: 'PATCH',
      path: `/v1/platform/offerings/${encodeURIComponent(params.id)}`,
      id: params.id,
      body: OfferingUpdate,
      result: ApiOffering,
      name: 'offering',
    }),
);
