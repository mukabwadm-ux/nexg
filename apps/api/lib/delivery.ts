import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

import { noStoreFetch } from './no-store';

/**
 * "Can you deliver here?" (POST /v1/delivery/check).
 *
 * The database answers it (rpc_delivery_check), with the functions checkout
 * uses: where NexG delivers and collects, zone pauses, the maximum distance
 * and the rate card. This module only names the function and gives it a
 * client that never caches, because a zone can be paused at any minute.
 */
export const DELIVERY_CHECK_FUNCTION = 'rpc_delivery_check';

type RpcResult = Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

/**
 * The anonymous key: the function is granted to anon, because everything it
 * returns is public (coverage, live zone names, pause notices and the rate
 * card). Server only all the same, like every client in this app.
 */
export function deliveryClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } },
  ) as unknown as {
    rpc: (name: typeof DELIVERY_CHECK_FUNCTION, args: Record<string, unknown>) => RpcResult;
  };
}
