import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

/**
 * A Supabase client for public reads, with no cookies attached.
 *
 * The cookie-based client in `server.ts` is what every page used, and reading
 * cookies makes a route dynamic in Next — so pages showing nothing but public
 * data were re-rendered and re-queried on every single request, and could
 * never be cached.
 *
 * Use this wherever the answer is the same for everyone: the homepage bands,
 * Explore, the marketing pages. Anything that depends on who is asking must
 * keep using the cookie client, because this one has no session and row-level
 * security will correctly show it nothing.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
