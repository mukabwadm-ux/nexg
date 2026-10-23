import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

/**
 * API key authentication.
 *
 * A request arrives with `X-Api-Key: <key>`. The key is resolved to a
 * credential by hash, and the credential says two things: what it may do
 * (`scopes`) and whose records it may see (`merchant_id`).
 *
 * The API server authenticates to Supabase with the anon key, so the
 * lookup functions are the ones callable by anon. They are registered in
 * `wiring_anon_allow` with the reason.
 *
 * Anonymous access is not an error. Stage one is public catalog data and
 * the public site reads it with no key at all, so a request with no
 * credential is a request for public data, and the route decides whether
 * that is enough. A request with a *bad* key is an error, because a
 * client that thinks it is authorized and is not will build against a
 * shape that silently stops working.
 */

export const API_SCOPES = {
  public_read: 'public_read',
  merchant_read: 'merchant_read',
  merchant_write: 'merchant_write',
  internal_read: 'internal_read',
  internal_write: 'internal_write',
} as const;

export type ApiScope = (typeof API_SCOPES)[keyof typeof API_SCOPES];

export interface ApiCredential {
  keyId: string;
  /*
   * The key as it arrived. The write path passes it to the database
   * function that resolves the merchant, because that function does the
   * hashing itself -- and a key that is only ever kept as a hash
   * cannot be presented for a second lookup.
   */
  rawKey: string;
  merchantId: string | null;
  scopes: ApiScope[];
  rateLimit: number;
  /** True when the request carried no credential at all. */
  anonymous: boolean;
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_request' | 'not_found' | 'rate_limited' | 'internal_error',
    readonly status: number,
  ) {
    super(message);
  }
}

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Resolve the credential on a request, if there is one.
 *
 * Returns an anonymous credential when no key was supplied. Throws
 * `ApiAuthError` when a key was supplied but is not usable.
 */
export async function authenticate(request: Request): Promise<ApiCredential> {
  const header = request.headers.get('x-api-key');
  const bearer = request.headers.get('authorization');

  const raw = header ?? (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null);

  if (!raw) {
    return {
      keyId: '',
      rawKey: '',
      merchantId: null,
      scopes: [API_SCOPES.public_read],
      rateLimit: 0,
      anonymous: true,
    };
  }

  const supabase = adminClient();

  /*
   * The generated types describe the schema as it is today. These two
   * functions arrive with the API authentication migration, and until
   * the types are regenerated the client does not know their names.
   */
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc('fn_api_key_lookup', { p_raw_key: raw });

  if (error) {
    throw new ApiAuthError(
      'The API key could not be checked.',
      'internal_error',
      500,
    );
  }

  /*
   * The generated types do not know about this function until the
   * migration has been applied and the types regenerated, so the row is
   * read through a narrow local shape rather than through `any`.
   */
  const row = (Array.isArray(data) ? data[0] : data) as
    | { key_id: string; merchant_id: string | null; scopes: string[]; rate_limit: number }
    | null;

  if (!row) {
    /*
     * Unknown, revoked and expired all land here, and they land in the
     * same place on purpose. Telling a caller which of the three it was
     * tells them something about a key they do not have.
     */
    throw new ApiAuthError(
      'That API key is not valid.',
      'not_found',
      401,
    );
  }

  const scopes = (row.scopes ?? []) as ApiScope[];

  return {
    keyId: row.key_id,
    rawKey: raw,
    merchantId: row.merchant_id ?? null,
    scopes,
    rateLimit: row.rate_limit ?? 60,
    anonymous: false,
  };
}

/**
 * Check the credential may do the thing being asked of it.
 *
 * Throws rather than returning false, because every caller would have to
 * check the return value and one of them would forget.
 */
export function requireScope(
  credential: ApiCredential,
  scope: ApiScope,
): void {
  if (credential.scopes.includes(scope)) return;

  if (credential.anonymous && scope === API_SCOPES.public_read) return;

  throw new ApiAuthError(
    'This credential does not have the scope for that.',
    'not_found',
    403,
  );
}

/**
 * Count a request against the credential's rate limit.
 *
 * A credential with no limit is unlimited, which is what an anonymous
 * read gets in stage one: the catalog is cacheable and cheap, and a
 * limit that is never reached is not worth the round trip.
 */
export async function enforceRateLimit(credential: ApiCredential): Promise<void> {
  if (credential.anonymous || !credential.keyId || credential.rateLimit <= 0) {
    return;
  }

  const supabase = adminClient();

  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc('fn_api_key_spend', {
    p_key_id: credential.keyId,
    p_limit: credential.rateLimit,
  });

  if (error) {
    throw new ApiAuthError(
      'The request could not be counted against the rate limit.',
      'internal_error',
      500,
    );
  }

  const allowed = Array.isArray(data) ? data[0] : data;

  if (allowed === false) {
    throw new ApiAuthError(
      'Too many requests. Give it a moment.',
      'rate_limited',
      429,
    );
  }
}