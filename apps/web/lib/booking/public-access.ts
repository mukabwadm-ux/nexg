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
    if (data?.id !== businessId) return 'not_found';
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
