import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

import { localBookingSandboxEnabled } from './bridge';

const MERCHANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public booking requires the existing anonymously visible live merchant. */
export async function publicMerchantBookingAccess(
  request: Request,
  businessId: string,
): Promise<'available' | 'not_found' | 'unavailable'> {
  const source = new URL(request.url);
  const host = request.headers.get('host');
  if (
    businessId === 'local-booking-business' &&
    (!host || host.toLowerCase() === source.host.toLowerCase()) &&
    localBookingSandboxEnabled(source.hostname, process.env)
  )
    return 'available';
  if (!MERCHANT_UUID.test(businessId)) return 'not_found';
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
    return data?.id === businessId ? 'available' : 'not_found';
  } catch {
    return 'unavailable';
  }
}
