import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Rpc } from './service';

/*
 * The one place a customer request handler uses the service role, and why.
 *
 * Holding, paying for and cancelling seats on a connected cinema means asking
 * the cinema's own system and then writing down what it answered (its hold,
 * its booking reference). Those writes must come only from NexG's server after
 * the cinema has answered, never from a customer's token, or anyone could
 * record a hold the cinema never made. So the cinema_* recording functions
 * (20270317000100) and the sandbox cinema (20270317000200) are executable by
 * the service role alone.
 *
 * This client can call those functions and nothing else: no table reads, no
 * other rpc. Everything that depends on who is asking (which showings they may
 * see, whose hold it is) is still read with the customer's own token first.
 */
const ALLOWED = new Set([
  'cinema_showing_for_call',
  'cinema_record_snapshot',
  'cinema_record_hold',
  'cinema_record_paying',
  'cinema_record_hold_ended',
  'cinema_record_cancelled',
  'cinema_record_confirm',
  'cinema_record_confirm_failed',
  'cinema_record_cancel_requested',
  'cinema_record_cancel_failed',
  'cinema_hold_for_request',
  'cinema_active_holds',
  'cinema_hold_for_worker',
  'cinema_due_work',
  'cinema_sync_apply',
  'cinema_sync_failed',
  'sandbox_cinema',
  /* Full refunds of paid holds (20270320000200, service role only): open
     NexG's refund, then record Paystack's answer (lib/cinema/refund.ts). */
  'fn_cinema_refund_open',
  'fn_paystack_refund_answered_system',
]);

export function cinemaServerDb(): Rpc | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return async (fn, args = {}) => {
    if (!ALLOWED.has(fn)) throw new Error(`${fn} is not a cinema function`);
    const { data, error } = await client.rpc(fn as never, args as never);
    return {
      data,
      error: error ? { message: error.message, code: error.code, hint: error.hint } : null,
    };
  };
}
