import { createClient } from '@/lib/supabase/server';

import type { BookingIdentity } from './bridge';

/** Resolve merchant membership through the existing account. No request-supplied tenant. */
export async function merchantBookingIdentity(): Promise<BookingIdentity | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    return null;
  const client = createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return null;
  const { data: home, error: homeError } = await client.rpc('fn_partner_home');
  const partner = home as unknown as { kind?: string; id?: string; name?: string } | null;
  if (homeError || partner?.kind !== 'merchant' || !partner.id) return null;
  const { data: membership, error: membershipError } = await client
    .from('merchant_user')
    .select('merchant_id,role,branches')
    .eq('user_id', auth.user.id)
    .eq('merchant_id', partner.id)
    .maybeSingle();
  if (membershipError || !membership || !['owner', 'manager'].includes(membership.role))
    return null;
  const { data: merchant, error: merchantError } = await client
    .from('merchant')
    .select('subcategory,answers,status')
    .eq('id', partner.id)
    .maybeSingle();
  if (
    merchantError ||
    !merchant ||
    ['suspended', 'delisted', 'offboarded'].includes(merchant.status)
  )
    return null;
  return {
    businessId: membership.merchant_id,
    userId: auth.user.id,
    role: membership.role,
    branches: membership.branches,
    businessName: partner.name,
    subcategoryId: merchant.subcategory ?? undefined,
    answers:
      merchant.answers && typeof merchant.answers === 'object' && !Array.isArray(merchant.answers)
        ? (merchant.answers as Record<string, unknown>)
        : {},
    businessStatus: merchant.status,
  };
}
