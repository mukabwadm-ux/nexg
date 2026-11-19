import {
  appBookingSession,
  appBookingUserId,
  recordAppBooking,
  savedCustomerToken,
} from '@/lib/booking/app-session';
import {
  MAX_BOOKING_BODY_BYTES,
  bookingCustomerSession,
  forwardBookingRequest,
  problem,
} from '@/lib/booking/bridge';
import { publicMerchantBookingAccess } from '@/lib/booking/public-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A new booking carries only the name to reserve under to the engine: any
 * email or phone the page or app sends stays here (Supabase holds the
 * customer's contact details). Owner's decision, 19 Nov 2026.
 */
async function withoutContactDetails(request: Request): Promise<Request | Response> {
  const text = await request.text();
  if (text.length > MAX_BOOKING_BODY_BYTES)
    return problem(413, 'The booking request is too large.', 'body_too_large');
  let body: unknown;
  try {
    body = JSON.parse(text || '{}');
  } catch {
    return problem(400, 'The booking details are not valid JSON.', 'invalid_json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return problem(400, 'Send the booking details as a JSON object.', 'invalid_json');
  const { customer, ...rest } = body as { customer?: { name?: unknown } };
  const name =
    customer && typeof customer === 'object' && typeof customer.name === 'string'
      ? customer.name
      : undefined;
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({ ...rest, customer: { name } }),
  });
}

async function route(
  incoming: Request,
  context: { params: { businessId: string; path: string[] } },
) {
  let request = incoming;
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

  const creating = request.method === 'POST' && parts.length === 1 && parts[0] === 'bookings';
  if (creating) {
    const cleaned = await withoutContactDetails(request);
    if (cleaned instanceof Response) return cleaned;
    request = cleaned;
  }

  // The Consumer app: its Supabase session as a bearer token, never a cookie.
  const app = await appBookingSession(request);
  if (app.kind === 'invalid')
    return problem(401, 'Your sign-in has expired. Sign in again.', 'sign_in_required');
  if (app.kind === 'signed_in') {
    // Accounts and guest (temporary) sessions both book (owner, 19 Nov 2026):
    // the engine holds the booking until it is paid, then confirms it.
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
    if (response.ok && parts[0] === 'bookings') {
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
        appBookingUserId(app),
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
