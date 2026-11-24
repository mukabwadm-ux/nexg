import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

import type { ApiEnvironment } from './auth';
import { noStoreFetch } from './no-store';

/**
 * Which database functions a key's orders go through.
 *
 * A live key books real orders and reads them; a test key books and reads
 * in the sandbox (api_test_order), never touching real orders. The
 * database holds the same line: each pair refuses the other kind of key.
 */
export const ORDER_FUNCTIONS = {
  live: { place: 'rpc_order_place_api', read: 'rpc_order_read_api' },
  test: { place: 'rpc_order_place_api_test', read: 'rpc_order_read_api_test' },
} as const satisfies Record<ApiEnvironment, { place: string; read: string }>;

type PlaceFunction = (typeof ORDER_FUNCTIONS)[ApiEnvironment]['place'];
type ReadFunction = (typeof ORDER_FUNCTIONS)[ApiEnvironment]['read'];
type RpcResult = Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

/**
 * The client that books a service for a merchant.
 *
 * Service role, because the booking functions are granted to service_role
 * only: a live booking creates a real order and money owed. The function
 * resolves the key, checks merchant_write, prices the booking and records
 * the idempotency key; this client decides nothing. Server only.
 */
export function orderWriter() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } },
  ) as unknown as { rpc: (name: PlaceFunction, args: Record<string, unknown>) => RpcResult };
}

/**
 * Cancels one of the key's merchant's API bookings, for
 * POST /v1/orders/{id}/cancel: the real order with a live key, the sandbox
 * booking with a test key.
 */
export const CANCEL_FUNCTION = 'rpc_order_cancel_api';

/**
 * The client that cancels a booking. Service role: the function is granted
 * to service_role only. It resolves the key, checks merchant_write, decides
 * the merchant and refuses once a rider is assigned; this client decides
 * nothing. Server only.
 */
export function orderCanceller() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } },
  ) as unknown as {
    rpc: (name: typeof CANCEL_FUNCTION, args: Record<string, unknown>) => RpcResult;
  };
}

/** Moves a test booking to a later status. There is no live twin. */
export const SANDBOX_MOVE_FUNCTION = 'rpc_order_status_api_test';
/** Moves a test booking to a later stage. */
export const SANDBOX_STAGE_FUNCTION = 'rpc_order_stage_api_test';
/** Gives a test ride or courier a test rider. */
export const SANDBOX_RIDER_FUNCTION = 'rpc_order_rider_api_test';

type SandboxFunction =
  | typeof SANDBOX_MOVE_FUNCTION
  | typeof SANDBOX_STAGE_FUNCTION
  | typeof SANDBOX_RIDER_FUNCTION;

/**
 * The client that moves a test booking, for POST /v1/test/orders/{id}/status.
 *
 * Service role, like the other sandbox functions: the function is granted
 * to service_role only. It resolves the key, refuses a live one, checks
 * merchant_write and decides the merchant; this client decides nothing.
 * Server only.
 */
export function sandboxMover() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } },
  ) as unknown as {
    rpc: (name: SandboxFunction, args: Record<string, unknown>) => RpcResult;
  };
}

/**
 * The client that reads a merchant's orders for the API.
 *
 * Service role, because the read functions are granted to service_role:
 * they read rows that row-level security keeps closed to the anonymous key.
 * The function resolves the API key, checks the merchant_read scope and
 * decides the merchant, so this client never chooses whose orders are read.
 * Server only.
 */
export function orderReader() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } },
  ) as unknown as { rpc: (name: ReadFunction, args: Record<string, unknown>) => RpcResult };
}
