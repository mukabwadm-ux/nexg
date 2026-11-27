import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

import {
  bookingEngineEnabledForMerchant,
  localBookingSandboxEnabled,
  MERCHANT_BOOKING_ID,
} from './bridge';

/** Public booking requires the existing anonymously visible live merchant. */
export async function publicMerchantBookingAccess(
  request: Request,
  businessId: string,
  checkLegacyInventory = true,
): Promise<'available' | 'not_found' | 'unavailable'> {
  const source = new URL(request.url);
  const host = request.headers.get('host');
  if (
    businessId === 'local-booking-business' &&
    (!host || host.toLowerCase() === source.host.toLowerCase()) &&
    localBookingSandboxEnabled(source.hostname, process.env)
  )
    return 'available';
  if (!MERCHANT_BOOKING_ID.test(businessId)) return 'not_found';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return 'unavailable';
  try {
    // No incoming cookies or user token. An owner's private draft visibility
    // must never turn their own public booking page into a published merchant.
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    });
    // merchant_public is the existing anon projection. Its database definition
    // admits only merchant.status='live'; anon cannot read the private table.
    const { data, error } = await client
      .from('merchant_public')
      .select('id')
      .eq('id', businessId)
      .maybeSingle();
    if (error) return 'unavailable';
    if (data?.id !== businessId) {
      const tenant = await testTenantAccess(request, url, key, businessId);
      if (tenant !== 'available') return tenant;
    }
    if (
      checkLegacyInventory &&
      process.env.NODE_ENV === 'production' &&
      bookingEngineEnabledForMerchant(businessId, process.env)
    ) {
      const { data: resources, error: resourceError } = await client
        .from('bookable_resource')
        .select('id')
        .eq('merchant_id', businessId)
        .eq('active', true)
        .limit(1);
      if (resourceError || !resources) return 'unavailable';
      if (resources.length > 0) return 'not_found';
    }
    return 'available';
  } catch {
    return 'unavailable';
  }
}

/**
 * A test tenant (a review shop, 20270228000300) is hidden from anon, so the
 * lookup above misses it. Reading its booking catalogue and free times is
 * allowed for anyone who has its id (rpc_booking_test_tenant_open,
 * 20270336000100): the app reads them without a sign-in, and reading moves no
 * money. Anything else (creating, quoting, changing a booking) needs the
 * caller's own token to see the shop in merchant_public: staff and accounts in
 * payment_reviewer.
 */
async function testTenantAccess(
  request: Request,
  url: string,
  key: string,
  businessId: string,
): Promise<'available' | 'not_found' | 'unavailable'> {
  const reading = request.method === 'GET' || request.method === 'HEAD';
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const options = (token?: string) => ({
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    },
  });
  if (bearer) {
    const caller = createClient<Database>(url, key, options(bearer));
    const { data, error } = await caller
      .from('merchant_public')
      .select('id')
      .eq('id', businessId)
      .maybeSingle();
    if (!error && data?.id === businessId) return 'available';
  }
  if (!reading) return 'not_found';
  const anon = createClient<Database>(url, key, options());
  /* Newer than the generated types. */
  const { data, error } = await (
    anon.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
  )('rpc_booking_test_tenant_open', { p_merchant_id: businessId });
  if (error) return 'unavailable';
  return data === true ? 'available' : 'not_found';
}
