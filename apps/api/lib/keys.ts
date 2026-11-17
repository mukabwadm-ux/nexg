import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * The API keys a signed-in developer may see and revoke in the console: the
 * keys of the merchants they belong to, and the platform keys (no merchant)
 * they issued themselves. Row-level security returns nothing else, and the
 * filter keeps a NexG staff member's console to their own keys too.
 *
 * Only what a person needs to recognise a key is read: never the key, which
 * is not stored, and not its hash.
 */

const Row = z.object({
  id: z.string(),
  merchant_id: z.string().nullable(),
  key_prefix: z.string(),
  environment: z.string().nullable().optional(),
  scopes: z.array(z.string()).nullable(),
  state: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});

export interface ConsoleKey {
  id: string;
  merchantId: string | null;
  prefix: string;
  environment: 'live' | 'test';
  scopes: string[];
  state: 'active' | 'expired' | 'revoked';
  createdAt: string;
  lastUsedAt: string | null;
}

export type KeyList = { ok: true; keys: ConsoleKey[] } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listConsoleKeys(
  supabase: SupabaseClient,
  userId: string,
  merchantIds: string[],
): Promise<KeyList> {
  if (!UUID.test(userId)) return { ok: false, message: 'Your keys could not be read.' };
  const own = `and(merchant_id.is.null,created_by_user.eq.${userId})`;
  const ids = merchantIds.filter((id) => UUID.test(id));
  const { data, error } = await supabase
    .from('api_key')
    .select(
      'id, merchant_id, key_prefix, environment, scopes, state, created_at, last_used_at, expires_at',
    )
    .or(ids.length ? `merchant_id.in.(${ids.join(',')}),${own}` : own)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { ok: false, message: 'Your keys could not be read.' };
  const rows = z.array(Row).safeParse(data ?? []);
  if (!rows.success) return { ok: false, message: 'Your keys could not be read.' };
  const now = Date.now();
  return {
    ok: true,
    keys: rows.data.map((k) => ({
      id: k.id,
      merchantId: k.merchant_id,
      prefix: k.key_prefix,
      environment: k.environment === 'test' ? 'test' : 'live',
      scopes: k.scopes ?? [],
      state:
        k.state !== 'active'
          ? 'revoked'
          : k.expires_at && Date.parse(k.expires_at) <= now
            ? 'expired'
            : 'active',
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
    })),
  };
}
