/**
 * GET /v1/resources
 *
 * The key's merchant's vehicles, rooms, guides and pools of places, from the
 * booking engine: each with its hours, the closures that have not ended, and
 * its version. A test key reads the same setup.
 */
import { withErrorEnvelope } from '@/lib/http';
import { engineWrite, setupList } from '@/lib/reservation-routes';
import { ApiResource, ResourceCreate } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorEnvelope(async (request: Request) =>
  setupList(request, '/v1/platform/resources', ApiResource, 'resources'),
);

/**
 * POST /v1/resources: a new vehicle, room, guide or pool of places, with its
 * working hours. A live key with catalogue_write and an Idempotency-Key.
 * Answers 201.
 */
export const POST = withErrorEnvelope(async (request: Request) =>
  engineWrite(request, {
    scope: 'catalogue_write',
    path: '/v1/platform/resources',
    body: ResourceCreate,
    result: ApiResource,
    name: 'resource',
    status: 201,
    notFound: 'Not found.',
  }),
);
