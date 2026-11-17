'use server';

import { z } from 'zod';

import { listConsoleKeys, type ConsoleKey } from '@/lib/keys';
import { listDeveloperMerchants } from '@/lib/merchants';
import { createClient } from '@/lib/session';

/**
 * Revoking a key from the developer console. rpc_api_key_revoke decides who
 * may: a member of the key's merchant, or whoever issued a key that has no
 * merchant, in a current session. A revoked key stops working at once.
 */

export type RevokeResult =
  | { ok: true; keys: ConsoleKey[]; message: string }
  | { ok: false; message: string };

export async function revokeApiKey(keyId: string, reason?: string): Promise<RevokeResult> {
  if (!z.string().uuid().safeParse(keyId).success) return { ok: false, message: 'No such key.' };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in to revoke a key.' };

  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc('rpc_api_key_revoke', {
    p_key_id: keyId,
    p_reason: reason?.trim().slice(0, 200) || null,
  });
  if (error) return { ok: false, message: error.message };

  const merchants = await listDeveloperMerchants(supabase);
  const list = await listConsoleKeys(
    supabase,
    user.id,
    merchants.map((m) => m.id),
  );
  if (!list.ok) return { ok: false, message: list.message };
  return {
    ok: true,
    keys: list.keys,
    message:
      data === false
        ? 'That key was already revoked.'
        : 'Revoked. Anything still using that key is refused from now on.',
  };
}
