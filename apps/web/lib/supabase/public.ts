import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
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
 *
 * Caching has to be chosen, because Next 14 caches a plain fetch, which is what
 * supabase-js makes, in the Data Cache with no expiry, and Vercel keeps that
 * cache across deploys. `dynamic = 'force-dynamic'` does not stop it: in
 * November 2026 /categories, /merchants, /stays and /hosts served the same
 * database response for a day and more. So:
 *   - a page that must show live data also exports
 *     `fetchCache = 'force-no-store'`;
 *   - a page that may be a little behind sets `revalidate`, or wraps the read
 *     in `unstable_cache` with one.
 */
/* Annotated for the same reason as the other two: the generated
   `Database` type is past what TypeScript will serialise. */
export function createPublicClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
