/**
 * PUT /v1/reservations/[id]/driver/location
 *
 * Where the reservation's driver is now: latitude, longitude and, optionally,
 * when they were there (at most 30 minutes ago). The customer sees it on
 * their booking while it is confirmed or under way; it changes no version and
 * sends no event. Needs a driver on the reservation first. Live keys only.
 */
import { withErrorEnvelope } from '@/lib/http';
import { driverLocation } from '@/lib/reservation-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) =>
    driverLocation(request, params.id),
);
