'use server';

import { createPublicClient } from '@/lib/supabase/public';

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const TOKEN = /^[0-9a-f]{20}$/;

/**
 * Records the person's own "no" to NexG marketing, on every channel
 * (rpc_comms_unsubscribe, 20270331000100). Only the token from their message
 * is sent; it names nobody.
 */
export async function unsubscribe(token: string): Promise<{ ok: boolean }> {
  if (!TOKEN.test(token)) return { ok: false };
  const db = createPublicClient() as unknown as Untyped;
  const { data, error } = await db.rpc('rpc_comms_unsubscribe', { p_token: token });
  if (error) return { ok: false };
  return { ok: Boolean((data as { ok?: boolean } | null)?.ok) };
}
