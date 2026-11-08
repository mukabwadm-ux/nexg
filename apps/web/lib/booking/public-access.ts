import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

import { localBookingSandboxEnabled } from './bridge';

const MERCHANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * The development sandbox's businesses: the fixed workspace id and the ids the
 * acceptance scripts create (`local-space-acceptance-…`, `local-workflow-linked_windows-…`).
 * Nothing outside the sandbox gate below can ever match them as a real merchant.
 */
const LOCAL_SANDBOX_BUSINESS = /^local-[a-z0-9_-]{1,120}$/;

/** The hostname the browser addressed, from its Host header; null when absent or malformed. */
function requestedHostname(host: string | null): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

/** Public booking requires the existing anonymously visible live merchant. */
export async function publicMerchantBookingAccess(
  request: Request,
  businessId: string,
): Promise<'available' | 'not_found' | 'unavailable'> {
  const source = new URL(request.url);
  // Both the address the browser used and the one Next reports must be loopback.
  // They are compared for loopback-ness rather than equality: `next dev --hostname
  // 127.0.0.1` still reports `localhost` in `request.url`, which used to turn every
  // sandbox booking page into "This booking page does not exist".
  const requested = requestedHostname(request.headers.get('host')) ?? source.hostname;
  if (
    LOCAL_SANDBOX_BUSINESS.test(businessId) &&
    localBookingSandboxEnabled(requested, process.env) &&
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
