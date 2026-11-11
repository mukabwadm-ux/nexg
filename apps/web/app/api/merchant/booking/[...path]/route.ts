import {
  bookingEngineConfigured,
  bookingEngineEnabledForMerchant,
  bootstrapMerchantBooking,
  forwardBookingRequest,
  problem,
  sameOriginMutation,
} from '../../../../../lib/booking/bridge';
import {
  merchantBookingIdentity,
  merchantBookingWorkAllowed,
} from '../../../../../lib/booking/identity';
import { merchantBookingBootstrapIdentity } from '../../../../../lib/booking/onboarding-bootstrap';
import { MerchantAccessError } from '../../../../../lib/merchant-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function route(request: Request, context: { params: { path: string[] } }) {
  let identity;
  try {
    identity = await merchantBookingIdentity();
  } catch (error) {
    if (error instanceof MerchantAccessError)
      return problem(
        error.status,
        error.message,
        error.status === 403 ? 'approval_required' : 'access_unavailable',
      );
    return problem(503, 'Your merchant account could not be checked.', 'access_unavailable');
  }
  if (!identity)
    return problem(401, 'Sign in with an authorized merchant account.', 'unauthenticated');
  if (
    bookingEngineConfigured(process.env) &&
    !bookingEngineEnabledForMerchant(identity.businessId, process.env)
  )
    return problem(404, 'The booking workspace is unavailable for this merchant.', 'not_found');
  if (!merchantBookingWorkAllowed(identity, request.method, context.params.path))
    return problem(
      403,
      'Activate this business before accepting or changing booking work.',
      'activation_required',
    );
  if (request.method === 'POST' && context.params.path.join('/') === 'bootstrap') {
    if (!sameOriginMutation(request))
      return problem(403, 'Use this site to initialize booking setup.', 'invalid_origin');
    try {
      const bootstrapIdentity = await merchantBookingBootstrapIdentity(identity);
      if (!bootstrapIdentity)
        return problem(
          403,
          'The business owner must import the saved application before booking setup can be initialized.',
          'owner_setup_required',
        );
      await bootstrapMerchantBooking(bootstrapIdentity);
    } catch {
      return problem(
        503,
        'Your existing onboarding details could not be loaded. Please retry; booking setup has not been replaced.',
        'onboarding_import_unavailable',
      );
    }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  return forwardBookingRequest(request, context.params.path, identity, 'merchant');
}
export { route as GET, route as POST, route as PUT, route as PATCH, route as DELETE };
