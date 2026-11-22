import {
  isObject,
  MAX_REQUEST_BYTES,
  parseRouteRequest,
  readBoundedJson,
  ROUTE_WINDOW_MS,
} from './contract.ts';
import { computeGoogleRoute } from './google.ts';

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_AUTH_RESPONSE_BYTES = 65_536;
const MAX_QUOTA_RESPONSE_BYTES = 1_024;
const MAX_RETRY_SECONDS = 86_400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Config = {
  enabled?: string;
  googleApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

type Options = {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

const errorStatuses = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  /* A guest (temporary session) used their one free Explore plan: sign in, or
     pay for an order, to plan more (owner, 22 Nov 2026). */
  sign_in_required: 403,
  method_not_allowed: 405,
  rate_limited: 429,
  unavailable: 503,
} as const;
type ErrorCode = keyof typeof errorStatuses;

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return Response.json(
    { contractVersion: '1', ...body },
    {
      status,
      headers: { 'cache-control': 'no-store', ...headers },
    },
  );
}

function errorResponse(code: ErrorCode, requestId?: string, headers?: Record<string, string>) {
  return json({ code, requestId }, errorStatuses[code], headers);
}

function useSupabase(
  fetcher: typeof fetch,
  base: URL,
  authorization: string,
  apikey: string,
  signal: AbortSignal,
) {
  return (path: string, body?: Record<string, string>) =>
    fetcher(new URL(path, base), {
      method: body ? 'POST' : 'GET',
      headers: { apikey, authorization, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal,
    });
}

function cancelBody(response: Response) {
  void response.body?.cancel().catch(() => {});
}

export function createRoutesHandler(config: Config, options: Options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const googleApiKey = config.googleApiKey?.trim();
  const supabaseAnonKey = config.supabaseAnonKey?.trim();
  let supabaseUrl: URL | undefined;
  if (config.supabaseUrl) {
    try {
      const url = new URL(config.supabaseUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') supabaseUrl = url;
    } catch {
      // An invalid deployment URL leaves the integration unavailable.
    }
  }

  return async function mapsRoutes(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', undefined, { allow: 'POST' });
    }
    if (config.enabled !== 'true' || !googleApiKey || !supabaseAnonKey || !supabaseUrl) {
      return errorResponse('unavailable');
    }
    const authorization = request.headers.get('authorization');
    if (
      !authorization ||
      authorization.length > 8_192 ||
      !/^Bearer [\w.-]+$/i.test(authorization)
    ) {
      return errorResponse('unauthenticated');
    }
    if (
      request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    ) {
      return errorResponse('invalid_request');
    }

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
    let rawInput: unknown;
    try {
      rawInput = await readBoundedJson(request, MAX_REQUEST_BYTES, signal);
    } catch {
      return errorResponse(signal.aborted ? 'unavailable' : 'invalid_request');
    }
    const input = parseRouteRequest(rawInput);
    if (!input) return errorResponse('invalid_request');
    const { requestId, contextId, travelMode } = input;
    const supabase = useSupabase(fetcher, supabaseUrl, authorization, supabaseAnonKey, signal);

    try {
      const auth = await supabase('/auth/v1/user');
      if (!auth.ok) {
        cancelBody(auth);
        return errorResponse(
          auth.status === 401 || auth.status === 403 ? 'unauthenticated' : 'unavailable',
          requestId,
        );
      }
      const user = await readBoundedJson(auth, MAX_AUTH_RESPONSE_BYTES, signal);
      if (!isObject(user) || typeof user.id !== 'string' || !UUID.test(user.id)) {
        return errorResponse('unavailable', requestId);
      }
      /* A temporary (guest) session is allowed: rpc_maps_route_budget gives it
         one complete Explore plan, then asks it to sign in. */
      const accountId = user.id;

      const budget = await supabase('/rest/v1/rpc/rpc_maps_route_budget', {
        p_context_id: contextId,
      });
      if (!budget.ok) {
        cancelBody(budget);
        if (budget.status === 401) return errorResponse('unauthenticated', requestId);
        return errorResponse(budget.status === 403 ? 'forbidden' : 'unavailable', requestId);
      }
      const quota = await readBoundedJson(budget, MAX_QUOTA_RESPONSE_BYTES, signal);
      if (!isObject(quota) || quota.accountId !== accountId) {
        return errorResponse('unavailable', requestId);
      }
      if (quota.allowed === false && quota.reason === 'sign_in_required') {
        return errorResponse('sign_in_required', requestId);
      }
      if (quota.allowed === false) {
        const retryAfter = quota.retryAfterSeconds;
        if (
          typeof retryAfter !== 'number' ||
          !Number.isInteger(retryAfter) ||
          retryAfter < 1 ||
          retryAfter > MAX_RETRY_SECONDS
        ) {
          return errorResponse('unavailable', requestId);
        }
        return errorResponse('rate_limited', requestId, { 'retry-after': String(retryAfter) });
      }
      if (quota.allowed !== true) return errorResponse('unavailable', requestId);

      signal.throwIfAborted();
      const route = await computeGoogleRoute(fetcher, googleApiKey, input, signal);
      signal.throwIfAborted();
      const computedAt = now();
      return json(
        {
          requestId,
          accountId,
          provider: 'google-routes',
          travelMode,
          computedAt: new Date(computedAt).toISOString(),
          expiresAt: new Date(computedAt + ROUTE_WINDOW_MS).toISOString(),
          ...route,
        },
        200,
      );
    } catch {
      return errorResponse('unavailable', requestId);
    }
  };
}
