import { bookingCustomerSession, forwardBookingRequest, problem } from '@/lib/booking/bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function route(
  request: Request,
  context: { params: { businessId: string; path: string[] } },
) {
  const businessId = context.params.businessId;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(businessId))
    return problem(404, 'This booking page does not exist.', 'not_found');
  const secret = process.env.BOOKING_BRIDGE_SECRET;
  if (!secret || secret.length < 32)
    return problem(
      503,
      'The booking connection has not been configured.',
      'connection_setup_required',
    );
  const session = bookingCustomerSession(request.headers.get('cookie'), secret);
  const response = await forwardBookingRequest(
    request,
    context.params.path,
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
