import { forwardBookingRequest, localBookingSandboxEnabled, problem } from '@/lib/booking/bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function route(request: Request, context: { params: { path: string[] } }) {
  if (!localBookingSandboxEnabled(new URL(request.url).hostname, process.env))
    return problem(404, 'This workspace is not available.', 'not_found');
  return forwardBookingRequest(
    request,
    context.params.path,
    {
      businessId: 'local-booking-business',
      userId: 'local-developer',
      role: 'owner',
      branches: null,
      businessName: 'NEXG Local Workspace',
    },
    'merchant',
  );
}
export { route as GET, route as POST, route as PUT, route as PATCH, route as DELETE };
