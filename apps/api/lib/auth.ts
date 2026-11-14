import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

export const API_SCOPES = {
  public_read: 'public_read',
  merchant_read: 'merchant_read',
  merchant_write: 'merchant_write',
  internal_read: 'internal_read',
  internal_write: 'internal_write',
} as const;

export type ApiScope = (typeof API_SCOPES)[keyof typeof API_SCOPES];
export type ApiOperation = 'public_read' | 'merchant_read' | 'merchant_write';

/**
 * live: real data, and a booking is a real order. test: a sandbox key
 * (`nexg_test_...`); its bookings and order reads go to the sandbox
 * functions, never to real orders. A request without a key is live.
 */
export type ApiEnvironment = 'live' | 'test';

export interface ApiCredential {
  keyId: string;
  /** Kept only for the request and forwarded to the existing owned RPC. Never log it. */
  rawKey: string;
  merchantId: string | null;
  scopes: ApiScope[];
  rateLimit: number;
  anonymous: boolean;
  environment: ApiEnvironment;
}

export interface RateLimitResult {
  /** Whole tokens left in the bucket after this request, when the database reports it. */
  remaining: number | null;
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_request' | 'not_found' | 'rate_limited' | 'internal_error',
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

function apiClient(privileged = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = privileged
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new ApiAuthError('The API is temporarily unavailable.', 'internal_error', 503);
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }>;
  };
}

/** Resolve an API key independently of a browser login or human session. */
export async function authenticate(request: Request): Promise<ApiCredential> {
  const header = request.headers.get('x-api-key');
  const authorization = request.headers.get('authorization');
  if (header !== null && authorization !== null) {
    throw new ApiAuthError('Supply one API credential.', 'invalid_request', 400);
  }
  if (authorization !== null && !authorization.startsWith('Bearer ')) {
    throw new ApiAuthError('Use X-Api-Key or a Bearer API key.', 'invalid_request', 400);
  }
  const raw = header ?? (authorization === null ? null : authorization.slice(7));
  if (raw === null) {
    return {
      keyId: '',
      rawKey: '',
      merchantId: null,
      scopes: [API_SCOPES.public_read],
      rateLimit: 120,
      anonymous: true,
      environment: 'live',
    };
  }
  if (!raw || raw.length > 256 || /\s/.test(raw)) {
    throw new ApiAuthError('That API key is not valid.', 'not_found', 401);
  }

  const { data, error } = await apiClient().rpc('fn_api_key_lookup', { p_raw_key: raw });
  if (error) {
    throw new ApiAuthError('The API key could not be checked.', 'internal_error', 503);
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    key_id?: unknown;
    merchant_id?: unknown;
    scopes?: unknown;
    rate_limit?: unknown;
    environment?: unknown;
  } | null;
  if (!row) {
    // Unknown, revoked, expired and access-restricted credentials share one response.
    throw new ApiAuthError('That API key is not valid.', 'not_found', 401);
  }
  if (
    typeof row.key_id !== 'string' ||
    !row.key_id ||
    !(row.merchant_id === null || typeof row.merchant_id === 'string') ||
    !Array.isArray(row.scopes) ||
    !row.scopes.length ||
    row.scopes.some((scope) => !Object.values(API_SCOPES).includes(scope as ApiScope)) ||
    typeof row.rate_limit !== 'number' ||
    !Number.isInteger(row.rate_limit) ||
    row.rate_limit < 1 ||
    // Absent only before the test-keys migration (20261217000100) runs: then every key is live.
    !(row.environment === undefined || row.environment === 'live' || row.environment === 'test')
  ) {
    throw new ApiAuthError('The API key could not be checked.', 'internal_error', 503);
  }
  return {
    keyId: row.key_id,
    rawKey: raw,
    merchantId: row.merchant_id,
    scopes: row.scopes as ApiScope[],
    rateLimit: Math.min(row.rate_limit, 600),
    anonymous: false,
    environment: row.environment === 'test' ? 'test' : 'live',
  };
}

export function requireScope(credential: ApiCredential, scope: ApiScope): void {
  if (credential.scopes.includes(scope)) return;
  throw new ApiAuthError('This credential does not have the scope for that.', 'not_found', 403);
}

/**
 * Only an explicitly configured ingress may supply an IP. The ingress must
 * remove the incoming header and set exactly one verified address. Lists,
 * malformed values and absent configuration use the shared anonymous bucket.
 */
export function trustedAnonymousIp(request: Request): string | null {
  const name = process.env.API_TRUSTED_PROXY_IP_HEADER;
  if (!name || !/^[a-z0-9-]{1,64}$/.test(name)) return null;
  const value = request.headers.get(name)?.trim();
  if (!value || !isIP(value)) return null;
  return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value;
}

/** Fleet-wide PostgreSQL token bucket; the database derives and locks the principal. */
export async function enforceRateLimit(
  credential: ApiCredential,
  request: Request,
  operation: ApiOperation = 'public_read',
): Promise<RateLimitResult> {
  const { data, error } = await apiClient(true).rpc('fn_api_request_spend', {
    p_raw_key: credential.anonymous ? null : credential.rawKey,
    p_anonymous_ip: credential.anonymous ? trustedAnonymousIp(request) : null,
    p_operation: operation,
  });
  if (error) {
    if (error.code === '42501') {
      throw new ApiAuthError('That API key is not valid.', 'not_found', 401);
    }
    throw new ApiAuthError('The rate limit could not be checked.', 'internal_error', 503);
  }
  const result = (Array.isArray(data) ? data[0] : data) as {
    allowed?: unknown;
    retry_after?: unknown;
    remaining?: unknown;
  } | null;
  if (
    !result ||
    typeof result.allowed !== 'boolean' ||
    typeof result.retry_after !== 'number' ||
    !Number.isFinite(result.retry_after) ||
    result.retry_after < 0 ||
    result.retry_after > 3600
  ) {
    throw new ApiAuthError('The rate limit could not be checked.', 'internal_error', 503);
  }
  if (!result.allowed) {
    throw new ApiAuthError(
      'Too many requests. Try again later.',
      'rate_limited',
      429,
      Math.max(1, Math.ceil(result.retry_after)),
    );
  }
  const remaining =
    typeof result.remaining === 'number' &&
    Number.isInteger(result.remaining) &&
    result.remaining >= 0
      ? result.remaining
      : null;
  return { remaining };
}
