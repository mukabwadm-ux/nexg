import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

/**
 * The client that reads a merchant's orders for the API.
 *
 * Service role, because `rpc_order_read_api` is granted to service_role
 * only: it reads rows that row-level security keeps closed to the
 * anonymous key. The function itself resolves the API key, checks the
 * merchant_read scope and decides the merchant, so this client never
 * chooses whose orders are read. Server only.
 */
export function orderReader() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ) as unknown as {
    rpc: (
      name: 'rpc_order_read_api',
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
}
