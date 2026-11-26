import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

/**
 * A service-role client for payment provider callbacks only.
 *
 * The Paystack webhook and M-Pesa callback verify the provider's signature or
 * secret here, in the route, and pass the result to the database. If those RPCs
 * were callable with the public anon key, anyone could call them directly and
 * claim a verified, successful payment. So the RPCs are granted to service_role
 * only, and the routes reach them through this client.
 *
 * Keep it to those routes. This key bypasses row-level security, so it has no
 * place anywhere that acts on behalf of a signed-in person.
 */
export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set, so payment callbacks cannot be recorded.');
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
