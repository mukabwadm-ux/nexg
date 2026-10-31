import { bootstrapMerchantBooking, forwardBookingRequest, problem } from '@/lib/booking/bridge';
import { merchantBookingIdentity } from '@/lib/booking/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function route(request: Request, context: { params: { path: string[] } }) {
  const identity = await merchantBookingIdentity();
  if (!identity)
    return problem(401, 'Sign in with an authorized merchant account.', 'unauthenticated');
  if (request.method === 'GET' && context.params.path.join('/') === 'workspace') {
    try {
      await bootstrapMerchantBooking(identity);
    } catch {
      return problem(
        503,
        'Your existing onboarding details could not be loaded. Please retry; booking setup has not been replaced.',
        'onboarding_import_unavailable',
      );
    }
  }
  return forwardBookingRequest(request, context.params.path, identity, 'merchant');
}
export { route as GET, route as POST, route as PUT, route as PATCH, route as DELETE };
