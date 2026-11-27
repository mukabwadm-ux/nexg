/**
 * POST /v1/resources/[id]/closures
 *
 * Marks a vehicle, room or guide as busy or closed for a time, so NexG takes
 * no booking for it then: a booking on your own website, maintenance, time
 * off. It cannot cover a booking already accepted (409). Needs the version you
 * read and an Idempotency-Key; a live key with catalogue_write.
 */
import { withErrorEnvelope } from '@/lib/http';
import { setupChange } from '@/lib/reservation-routes';
import { ApiResource, ClosureRequest } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    setupChange(request, {
      method: 'POST',
      path: `/v1/platform/resources/${encodeURIComponent(params.id)}/closures`,
      id: params.id,
      body: ClosureRequest,
      result: ApiResource,
      name: 'resource',
    }),
);
