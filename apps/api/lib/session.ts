import type { Database } from '@nexg/db';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Supabase client for the developer console: server components, route
 * handlers and server actions.
 *
 * Always the anon key. Every read and write goes through row-level
 * security, which is where the rules from spec section 3.4 actually
 * live. The service role key is never used here -- it bypasses RLS and
 * has no business in a request handler.
 *
 * The API app and the marketing site share one Supabase project, so one
 * account signs you in to both. The cookie domain decides which surface
 * the browser carries it to, which is why the sign-in on
 * api.nexgapp.com is its own page rather than a redirect to the site:
 * the console needs a session of its own to know whose merchant list
 * to show.
 */
export function createClient(): SupabaseClient<Database> {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* Called from a server component, where cookies are read-only.
               Middleware refreshes the session, so this is safe to ignore. */
          }
        },
      },
    },
  );
}