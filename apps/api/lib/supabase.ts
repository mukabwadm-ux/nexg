/**
 * A Supabase client for the API, with no cookies attached.
 *
 * The API is read-only and serves public data — no session needed.
 * Uses the anon key, which is safe because every table the API reads
 * either has a public view (merchant_public, catalogue_public, etc.)
 * or an RLS policy that allows anon SELECT.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

export function createPublicClient(): ReturnType<typeof createSupabaseClient<Database>> {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}