/**
 * GET /v1/offerings
 *
 * What the key's merchant sells as bookings (transfers, tours, rentals,
 * appointments), from the booking engine: each with its price, whether it
 * takes bookings, its version, and the departures of a tour or class that
 * have not ended. A test key reads the same setup.
 */
import { withErrorEnvelope } from '@/lib/http';
import { engineWrite, setupList } from '@/lib/reservation-routes';
import { ApiOffering, OfferingCreate } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorEnvelope(async (request: Request) =>
  setupList(request, '/v1/platform/offerings', ApiOffering, 'offerings'),
);

/**
 * POST /v1/offerings: a new offering, on NexG's standard terms (customers pay
 * through NexG before a booking confirms; changes before it starts). A live
 * key with catalogue_write and an Idempotency-Key. Answers 201.
 */
export const POST = withErrorEnvelope(async (request: Request) =>
  engineWrite(request, {
    scope: 'catalogue_write',
    path: '/v1/platform/offerings',
    body: OfferingCreate,
    result: ApiOffering,
    name: 'offering',
    status: 201,
    notFound: 'A resource it names was not found.',
  }),
);
