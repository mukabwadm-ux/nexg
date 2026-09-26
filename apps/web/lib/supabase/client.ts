'use client';

import type { Database } from '@nexg/db';
import { createBrowserClient } from '@supabase/ssr';

/** Supabase client for the browser. Anon key only; RLS does the rest. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
