import { appBookingSession } from '@/lib/booking/app-session';
import { problem } from '@/lib/booking/bridge';
import { forgetEngineCustomer } from '@/lib/booking/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * POST /api/public/booking/forget, with the app's `Authorization: Bearer`.
 *
 * The app calls this just before it deletes the customer's account
 * (rpc_my_account_deletion_request). For every business the customer booked
 * through the app, the booking engine drops the name reserved under and the
 * customer's reference. Each business that answers is marked forgotten_at on
 * the customer's saved bookings; any that does not is queued for the website
 * to retry when the account is deleted (engine_booking_erasure).
 *
 * Answers { forgotten: <businesses>, remaining: <businesses still queued> }.
 */
export async function POST(request: Request) {
  const app = await appBookingSession(request);
  if (app.kind === 'none') return problem(401, 'Sign in first.', 'sign_in_required');
  if (app.kind === 'invalid')
    return problem(401, 'Your sign-in has expired. Sign in again.', 'sign_in_required');

  const { data, error } = await app.client
    .from('customer_engine_booking')
    .select('merchant_id, customer_ref')
    .is('forgotten_at', null);
  if (error)
    return problem(503, 'Your bookings could not be read. Try again.', 'service_unavailable');

  const pairs = new Map<string, { merchantId: string; ref: string }>();
  for (const row of (data ?? []) as { merchant_id: string; customer_ref: string | null }[]) {
    const ref = row.customer_ref ?? `account_${app.userId}`;
    pairs.set(`${row.merchant_id} ${ref}`, { merchantId: row.merchant_id, ref });
  }

  let forgotten = 0;
  for (const { merchantId, ref } of pairs.values()) {
    const result = await forgetEngineCustomer(merchantId, ref);
    if (!result.ok) continue;
    const marked = await app.client
      .from('customer_engine_booking')
      .update({ forgotten_at: new Date().toISOString() })
      .eq('merchant_id', merchantId)
      .is('forgotten_at', null);
    if (!marked.error) forgotten++;
  }
  return Response.json(
    { forgotten, remaining: pairs.size - forgotten },
    { headers: { 'cache-control': 'no-store' } },
  );
}
