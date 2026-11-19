import { appBookingSession, savedCustomerToken } from '@/lib/booking/app-session';
import { problem } from '@/lib/booking/bridge';
import { simulateEngineBookingPayment } from '@/lib/booking/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/*
 * POST /api/public/booking/simulate-payment, with the app's
 * `Authorization: Bearer`, body { merchantId, bookingId }.
 *
 * While no payment provider is connected, the customer "pays" for their own
 * held app booking with a test payment: the engine confirms it and marks it
 * `simulated` (no money collected). Then read the booking again
 * (GET .../bookings/<id>) for its status and booking code.
 *
 * Only when NEXG_SIMULATED_PAYMENTS=1 on the website (and
 * BOOKING_SIMULATED_PAYMENTS=1 on the engine). Otherwise 404.
 */
export async function POST(request: Request) {
  if (process.env.NEXG_SIMULATED_PAYMENTS !== '1')
    return problem(404, 'Test payments are switched off.', 'simulated_payments_off');
  const app = await appBookingSession(request);
  if (app.kind !== 'signed_in') return problem(401, 'Sign in first.', 'sign_in_required');
  const body = (await request.json().catch(() => null)) as {
    merchantId?: unknown;
    bookingId?: unknown;
  } | null;
  const merchantId = typeof body?.merchantId === 'string' ? body.merchantId : '';
  const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : '';
  if (!ID.test(merchantId) || !ID.test(bookingId))
    return problem(422, 'Send the booking to pay for.', 'invalid_input');
  // Only the customer's own saved booking: its private token proves it.
  if (!(await savedCustomerToken(app.client, merchantId, bookingId)))
    return problem(404, 'That booking is not yours.', 'not_found');
  const result = await simulateEngineBookingPayment(merchantId, bookingId);
  if (!result.ok)
    return problem(
      result.status >= 400 && result.status < 600 ? result.status : 502,
      result.code === 'hold_expired'
        ? 'The hold ran out. Book again.'
        : result.code === 'simulated_payments_off'
          ? 'Test payments are switched off.'
          : 'The test payment could not be made.',
      result.code,
    );
  const booking = result.value as { status?: unknown; paymentState?: unknown } | null;
  return Response.json(
    { ok: true, simulated: true, status: booking?.status, paymentState: booking?.paymentState },
    { headers: { 'cache-control': 'no-store' } },
  );
}
