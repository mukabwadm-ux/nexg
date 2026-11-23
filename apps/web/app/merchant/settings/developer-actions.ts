'use server';

import { z } from 'zod';

import { merchantActionClient } from '@/lib/merchant-action-access';
import { createClient } from '@/lib/supabase/server';

/**
 * What Settings › API & webhooks shows a real workspace: the business's API
 * keys and webhook endpoints. Keys and endpoints are created in the developer
 * console on api.nexgapp.com, where a key is shown once; the owner can
 * revoke a key here too (revokeDeveloperKey).
 *
 * Row-level security decides what comes back: members of the merchant read
 * its key records (never the key, and the hash is not selected); webhook
 * endpoints come from rpc_api_webhook_endpoints, which answers for the
 * merchants the person owns.
 */

export interface DeveloperKey {
  id: string;
  prefix: string;
  environment: 'live' | 'test';
  scopes: string[];
  state: 'active' | 'expired' | 'revoked';
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DeveloperEndpoint {
  id: string;
  url: string;
  environment: 'live' | 'test';
  enabled: boolean;
  lastDeliveryAt: string | null;
  lastDeliveryOk: boolean | null;
  lastStatusCode: number | null;
}

export type DeveloperAccess =
  | {
      ok: true;
      isOwner: boolean;
      keys: DeveloperKey[];
      /** Null when the endpoints could not be read; the keys still show. */
      endpoints: DeveloperEndpoint[] | null;
    }
  | { ok: false; message: string };

const KeyRow = z.object({
  id: z.string(),
  key_prefix: z.string(),
  environment: z.string().nullable().optional(),
  scopes: z.array(z.string()).nullable(),
  state: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});

const EndpointRow = z.object({
  id: z.string(),
  merchant_id: z.string(),
  url: z.string(),
  environment: z.enum(['live', 'test']),
  enabled: z.boolean(),
  last_delivery_at: z.string().nullable(),
  last_delivery_ok: z.boolean().nullable(),
  last_status_code: z.number().nullable(),
});

export async function loadDeveloperAccess(merchantId: string): Promise<DeveloperAccess> {
  if (!z.string().uuid().safeParse(merchantId).success) {
    return { ok: false, message: 'Developer access could not be loaded.' };
  }
  const supabase = createClient();
  // Only the current business: an owner of several sees one at a time.
  await merchantActionClient({ access: 'support', merchantId });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to see developer access.' };

  const [membership, keys, endpoints] = await Promise.all([
    supabase
      .from('merchant_user')
      .select('role')
      .eq('merchant_id', merchantId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('api_key')
      .select('id, key_prefix, environment, scopes, state, created_at, last_used_at, expires_at')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.rpc('rpc_api_webhook_endpoints'),
  ]);

  if (keys.error) return { ok: false, message: 'Developer access could not be loaded.' };
  const keyRows = z.array(KeyRow).safeParse(keys.data ?? []);
  if (!keyRows.success) return { ok: false, message: 'Developer access could not be loaded.' };

  const now = Date.now();
  const endpointRows = endpoints.error
    ? null
    : z.array(EndpointRow).safeParse(endpoints.data ?? []);

  return {
    ok: true,
    isOwner: (membership.data as { role?: string } | null)?.role === 'owner',
    keys: keyRows.data.map((k) => ({
      id: k.id,
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
    endpoints:
      endpointRows && endpointRows.success
        ? endpointRows.data
            .filter((e) => e.merchant_id === merchantId)
            .map((e) => ({
              id: e.id,
              url: e.url,
              environment: e.environment,
              enabled: e.enabled,
              lastDeliveryAt: e.last_delivery_at,
              lastDeliveryOk: e.last_delivery_ok,
              lastStatusCode: e.last_status_code,
            }))
        : null,
  };
}

export type RevokeOutcome =
  | { ok: true; message: string; access: DeveloperAccess }
  | { ok: false; message: string };

/**
 * Revokes one of the business's API keys. rpc_api_key_revoke decides who
 * may: the business owner, in a current session, as only the owner may
 * issue a key. The key stops working at once and cannot be switched back on.
 */
export async function revokeDeveloperKey(
  merchantId: string,
  keyId: string,
  reason?: string,
): Promise<RevokeOutcome> {
  const uuid = z.string().uuid();
  if (!uuid.safeParse(merchantId).success || !uuid.safeParse(keyId).success) {
    return { ok: false, message: 'No such key.' };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to revoke a key.' };
  await merchantActionClient({ access: 'support', merchantId });
  const { data: key, error: keyError } = await supabase
    .from('api_key')
    .select('id')
    .eq('id', keyId)
    .eq('merchant_id', merchantId)
    .maybeSingle();
  if (keyError || !key) return { ok: false, message: 'No such key.' };

  const why = reason?.trim().slice(0, 200);
  const { data, error } = await supabase.rpc('rpc_api_key_revoke', {
    p_key_id: keyId,
    ...(why ? { p_reason: why } : {}),
  });
  if (error) return { ok: false, message: error.message || 'The key could not be revoked.' };

  return {
    ok: true,
    message:
      data === false
        ? 'That key was already revoked.'
        : 'Revoked. Anything still using that key is refused from now on.',
    access: await loadDeveloperAccess(merchantId),
  };
}
