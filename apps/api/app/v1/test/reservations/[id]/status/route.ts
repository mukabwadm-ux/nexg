/**
 * POST /v1/test/reservations/[id]/status
 *
 * Moves a test reservation to a later status with a test key: confirmed (as
 * if the customer had paid), in_progress, completed, or cancelled before it
 * is completed. Sends reservation.status_changed to the merchant's test
 * endpoints.
 */
import { jsonError, withErrorEnvelope } from '@/lib/http';
import {
  SANDBOX,
  answer,
  authorize,
  jsonBody,
  sandbox,
  sandboxRefusal,
  sandboxReservation,
} from '@/lib/reservation-routes';
import { TestReservationMove } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) => {
    const auth = await authorize(
      request,
      'merchant_write',
      'merchant_write',
      'move test reservations',
    );
    if (auth instanceof Response) return auth;
    const { credential, rate } = auth;
    if (credential.environment !== 'test') {
      return jsonError(
        'not_found',
        'Only a test key moves test reservations. Real ones move as the business works on them.',
        { status: 403 },
      );
    }
    if (!UUID.test(params.id)) return jsonError('not_found', 'Reservation not found');
    const body = await jsonBody(request, TestReservationMove);
    if (body instanceof Response) return body;

    const { data, error } = await sandbox().rpc(SANDBOX.move, {
      p_api_key: credential.rawKey,
      p_id: params.id,
      p_status: body.status,
    });
    if (error) return sandboxRefusal(error);
    const moved = sandboxReservation(data);
    const previous = (Array.isArray(data) ? data[0] : data) as { previous_status?: unknown } | null;
    if (!moved.success || typeof previous?.previous_status !== 'string') {
      return jsonError('internal_error', 'The test reservation could not be read back.', {
        detail: moved.success ? previous : moved.error.issues,
      });
    }
    return answer(
      { reservation: moved.data, previous_status: previous.previous_status },
      rate,
      credential,
    );
  },
);
