import { createClient } from '../supabase/server';
import { requireMerchantWorkspaceOperations } from '../merchant-access';

import type { BookingIdentity } from './bridge';

// These flags authorize this proxy request only. They are never signed into
// the booking-engine identity header or copied into application capture.
const activation = new WeakMap<
  BookingIdentity,
  { legacy: boolean; live: boolean; revision?: number | null }
>();

/** Internal request metadata; application details never become signed engine claims. */
export function merchantBookingBootstrapAccess(identity: BookingIdentity) {
  const permission = activation.get(identity);
  if (!permission) return null;
  return { legacy: permission.legacy, revision: permission.revision };
}

export function merchantBookingWorkAllowed(
  identity: BookingIdentity,
  method: string,
  path: string[],
) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  if (['configuration', 'resources', 'offerings', 'bootstrap'].includes(path[0] ?? '')) return true;
  const permission = activation.get(identity);
  return permission?.legacy === true || permission?.live === true;
}

/** Resolve merchant membership through the existing account. No request-supplied tenant. */
export async function merchantBookingIdentity(): Promise<BookingIdentity | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    return null;
  const client = createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.is_anonymous) return null;
  const { data: home, error: homeError } = await client.rpc('fn_partner_home');
  const partner = home as unknown as { kind?: string; id?: string; name?: string } | null;
  if (homeError || partner?.kind !== 'merchant' || !partner.id) return null;
  const access = await requireMerchantWorkspaceOperations(client, partner.id);
  const { data: membership, error: membershipError } = await client
    .from('merchant_user')
    .select('merchant_id,role,branches')
    .eq('user_id', auth.user.id)
    .eq('merchant_id', partner.id)
    .maybeSingle();
  if (membershipError || !membership || !['owner', 'manager'].includes(membership.role))
    return null;
  const merchantQuery =
    access.state === 'legacy'
      ? client.from('merchant').select('subcategory,answers,status')
      : client.from('merchant').select('subcategory,status');
  const { data: merchant, error: merchantError } = await merchantQuery
    .eq('id', partner.id)
    .maybeSingle();
  if (
    merchantError ||
    !merchant ||
    !['applied', 'documents_pending', 'under_review', 'live', 'paused'].includes(merchant.status)
  )
    return null;
  const legacyAnswers = 'answers' in merchant ? merchant.answers : undefined;
  const identity: BookingIdentity = {
    businessId: membership.merchant_id,
    userId: auth.user.id,
    role: membership.role,
    branches: membership.branches,
    businessName: partner.name,
    subcategoryId: merchant.subcategory ?? undefined,
    ...(access.state === 'legacy'
      ? {
          answers:
            legacyAnswers && typeof legacyAnswers === 'object' && !Array.isArray(legacyAnswers)
              ? (legacyAnswers as Record<string, unknown>)
              : {},
        }
      : {}),
    businessStatus: merchant.status,
  };
  activation.set(identity, {
    legacy: access.state === 'legacy',
    live: merchant.status === 'live',
    revision: access.revision,
  });
  return identity;
}
