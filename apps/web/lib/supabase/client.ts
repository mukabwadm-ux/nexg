'use client';

import type { Database } from '@nexg/db';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Supabase client for the browser. Anon key only; RLS does the rest. */
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
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
