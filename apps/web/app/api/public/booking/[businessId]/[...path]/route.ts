import {
  appBookingSession,
  appBookingUserId,
  recordAppBooking,
  savedCustomerToken,
} from '@/lib/booking/app-session';
import { bookingCustomerSession, forwardBookingRequest, problem } from '@/lib/booking/bridge';
import { publicMerchantBookingAccess } from '@/lib/booking/public-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function route(
  request: Request,
  context: { params: { businessId: string; path: string[] } },
) {
  const businessId = context.params.businessId;
  const parts = context.params.path;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(businessId))
    return problem(404, 'This booking page does not exist.', 'not_found');
  // Catalog, slot and create calls open new intake. Existing booking tokens
  // still authorize reads and changes if legacy resources are later restored.
  const access = await publicMerchantBookingAccess(request, businessId, parts.length === 1);
  if (access === 'not_found') return problem(404, 'This booking page does not exist.', 'not_found');
  if (access !== 'available')
    return problem(
      503,
      'This merchant booking page could not be checked.',
      'publication_unavailable',
    );
  const secret = process.env.BOOKING_BRIDGE_SECRET;
  if (!secret || secret.length < 32)
    return problem(
      503,
      'The booking connection has not been configured.',
      'connection_setup_required',
    );

  // The Consumer app: its Supabase session as a bearer token, never a cookie.
  const app = await appBookingSession(request);
  if (app.kind === 'invalid')
    return problem(401, 'Your sign-in has expired. Sign in again.', 'sign_in_required');
  if (app.kind === 'signed_in') {
    const creating = request.method === 'POST' && parts.length === 1 && parts[0] === 'bookings';
    // Same rule as bookings on the main database: a temporary session may look
    // and price, but booking needs an account.
    if (creating && app.anonymous) return problem(401, 'Sign in to book.', 'account_required');
    const bookingId = parts[0] === 'bookings' && parts[1] ? parts[1] : null;
    const customerToken = bookingId
      ? await savedCustomerToken(app.client, businessId, bookingId)
      : null;
    const response = await forwardBookingRequest(
      request,
      parts,
      { businessId, userId: appBookingUserId(app), role: 'customer' },
      'customer',
      { appSession: true, customerToken },
    );
    if (response.ok && !app.anonymous && parts[0] === 'bookings') {
      const item = new URL(request.url).searchParams.get('catalogueItemId');
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      await recordAppBooking(
        app.client,
        businessId,
        parts,
        request.method,
        body,
        item && UUID.test(item) ? item : null,
      );
    }
    return response;
  }

  const session = bookingCustomerSession(request.headers.get('cookie'), secret);
  const response = await forwardBookingRequest(
    request,
    parts,
    { businessId, userId: session.userId, role: 'customer' },
    'customer',
  );
  if (session.created)
    response.headers.append(
      'set-cookie',
      `nexg_booking_session=${session.cookieValue}; Path=/api/public/booking; Max-Age=2592000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
  return response;
}
export { route as GET, route as POST };
