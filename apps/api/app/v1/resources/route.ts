/**
 * GET /v1/resources
 *
 * The key's merchant's vehicles, rooms, guides and pools of places, from the
 * booking engine: each with its hours, the closures that have not ended, and
 * its version. A test key reads the same setup.
 */
import { withErrorEnvelope } from '@/lib/http';
import { setupList } from '@/lib/reservation-routes';
import { ApiResource } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorEnvelope(async (request: Request) =>
  setupList(request, '/v1/platform/resources', ApiResource, 'resources'),
);
