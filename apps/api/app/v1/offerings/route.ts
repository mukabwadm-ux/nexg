/**
 * GET /v1/offerings
 *
 * What the key's merchant sells as bookings (transfers, tours, rentals,
 * appointments), from the booking engine: each with its price, whether it
 * takes bookings, its version, and the departures of a tour or class that
 * have not ended. A test key reads the same setup.
 */
import { withErrorEnvelope } from '@/lib/http';
import { setupList } from '@/lib/reservation-routes';
import { ApiOffering } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorEnvelope(async (request: Request) =>
  setupList(request, '/v1/platform/offerings', ApiOffering, 'offerings'),
);
