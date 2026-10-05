import type { Database } from '@nexg/db';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Supabase client for server components, route handlers and server actions.
 *
 * Always the anon key: every read and write goes through row-level security,
 * which is where the rules from spec section 3.4 actually live. The service
 * role key is never used here — it bypasses RLS and has no business in a
 * request handler.
 */
/*
 * The return type is written out rather than inferred.
 *
 * The generated `Database` type is large enough that TypeScript
 * refuses to serialise the inferred client type ("exceeds the
 * maximum length the compiler will serialize"), and the error
 * lands here rather than anywhere near the schema that grew. An
 * explicit annotation costs nothing and keeps it from coming back
 * every time a table is added.
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
            // Called from a server component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
