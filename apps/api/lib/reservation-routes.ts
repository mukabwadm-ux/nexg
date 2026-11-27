/**
 * The plumbing the booking-engine routes share: the key and its scope, the
 * body and its Idempotency-Key, the engine's answers turned into the API's
 * envelope, and the sandbox for test keys.
 *
 * - Live keys reach the engine (lib/booking-engine.ts) for the key's merchant.
 *   A change runs as that business's manager under the key's id, so the
 *   engine's rules, audit and events are the merchant console's.
 * - Test keys reach the sandbox (api_test_reservation, 20270339000100) for
 *   reservations, and never change a real offering or resource.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { parse } from '@nexg/contracts';
import { ApiReservation, IdempotencyKey } from '@nexg/contracts/api';
import type { Database } from '@nexg/db';

import {
  authenticate,
  enforceRateLimit,
  requireScope,
  ApiAuthError,
  type ApiCredential,
  type ApiOperation,
  type ApiScope,
  type RateLimitResult,
} from './auth';
import {
  BookingEngineUnavailable,
  engineConfig,
  engineDetail,
  platformHeaders,
} from './booking-engine';
import { privateHeaders } from './cache';
import { jsonError } from './http';
import { noStoreFetch } from './no-store';

export interface Authorized {
  credential: ApiCredential & { merchantId: string };
  rate: RateLimitResult;
}

/** The key, its scope and its rate limit, for a merchant-bound key; or the error to send. */
export async function authorize(
  request: Request,
  scope: ApiScope,
  operation: ApiOperation,
  what: string,
): Promise<Authorized | Response> {
  let credential;
  let rate;
  try {
    credential = await authenticate(request);
    requireScope(credential, scope);
    rate = await enforceRateLimit(credential, request, operation);
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status, retryAfter: e.retryAfter });
    }
    return jsonError('internal_error', 'Something went wrong on our side.', { status: 500 });
  }
  if (credential.merchantId === null) {
    return jsonError('not_found', `This key is not bound to a merchant, so it cannot ${what}.`, {
      status: 403,
    });
  }
  return { credential: credential as Authorized['credential'], rate };
}

/** The Idempotency-Key a change carries, kept the same when it is retried. */
export function idempotencyKey(request: Request): string | Response {
  const key = IdempotencyKey.safeParse(request.headers.get('idempotency-key'));
  if (!key.success) {
    return jsonError(
      'invalid_request',
      'Every change needs an Idempotency-Key header: 16 to 128 characters, new for each change and the same when you retry it.',
      { fields: { 'Idempotency-Key': 'Required, 16 to 128 characters.' } },
    );
  }
  return key.data;
}

/** The JSON body, checked against its schema. */
export async function jsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.output<S> | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_request', 'The body must be a JSON object.', {
      fields: { body: 'Send JSON.' },
    });
  }
  const result = parse(schema, body);
  if (!result.ok) {
    return jsonError('invalid_request', result.failure.message, { fields: result.failure.fields });
  }
  return result.data;
}

/** A success in the API's envelope. */
export function answer(
  data: Record<string, unknown>,
  rate: RateLimitResult,
  credential: ApiCredential,
) {
  return NextResponse.json(
    { ok: true, data, meta: { api_version: 'v1' as const } },
    { headers: privateHeaders(rate, credential) },
  );
}

/** A reservation from the engine, against the contract. An engine without drivers yet sends none. */
export function checkReservation(value: unknown) {
  return ApiReservation.safeParse(
    value && typeof value === 'object' ? { driver: null, ...(value as object) } : value,
  );
}

/* ═══════════════════════════════════════════════════════ the engine */

export interface EngineResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Sends one request to the engine's platform routes for the key's merchant. */
export async function engineRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  credential: ApiCredential & { merchantId: string },
  options: { body?: unknown; idempotencyKey?: string } = {},
): Promise<EngineResult> {
  const config = engineConfig();
  if (!config) throw new BookingEngineUnavailable('The booking engine is not configured.');
  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method,
      headers: {
        ...platformHeaders(credential.merchantId, credential.keyId, config.secret),
        accept: 'application/json',
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        // Scoped to this key by the engine, so two keys can never share a change.
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new BookingEngineUnavailable(
      `The booking engine could not be reached: ${(error as Error)?.message ?? 'no answer'}`,
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

/**
 * An engine refusal in the API's words: its own message for what the caller
 * can fix (400 and 422 as invalid_request, 404, 409 as conflict, 429), and
 * 503 for anything that is NexG's to fix.
 */
export function engineRefusal(result: EngineResult, notFound: string): Response {
  const detail = engineDetail(result.body) ?? 'The booking engine refused the change.';
  if (result.status === 404) return jsonError('not_found', notFound);
  if (result.status === 409) return jsonError('conflict', detail);
  if (result.status === 400 || result.status === 422) return jsonError('invalid_request', detail);
  if (result.status === 429) {
    return jsonError('rate_limited', 'Too many changes at once. Wait a minute and try again.', {
      retryAfter: 60,
    });
  }
  return jsonError(
    'internal_error',
    'The booking engine cannot take this right now. Try again shortly.',
    {
      status: 503,
      detail: { engine_status: result.status, engine: detail },
    },
  );
}

/** The answer when the engine is not set up or not reachable. */
export function engineUnavailable(error: unknown): Response {
  if (error instanceof BookingEngineUnavailable) {
    return jsonError(
      'internal_error',
      'The booking engine cannot be reached right now. Try again shortly.',
      {
        status: 503,
        detail: error.message,
      },
    );
  }
  throw error;
}

/* ═══════════════════════════════════════════════════════ the sandbox */

export const SANDBOX = {
  create: 'rpc_reservation_create_api_test',
  read: 'rpc_reservation_read_api_test',
  act: 'rpc_reservation_act_api_test',
  move: 'rpc_reservation_move_api_test',
} as const;

type SandboxFunction = (typeof SANDBOX)[keyof typeof SANDBOX];

/**
 * The client for test reservations. Service role: the functions are granted
 * to service_role only. Each resolves the key, refuses a live one, checks the
 * scope and decides the merchant; this client decides nothing. Server only.
 */
export function sandbox() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } },
  ) as unknown as {
    rpc: (
      name: SandboxFunction,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
}

/** A sandbox refusal in the API's words. */
export function sandboxRefusal(error: { message: string; code?: string }): Response {
  if (error.code === 'P0002') return jsonError('not_found', 'Reservation not found');
  if (error.code === 'P0005') return jsonError('conflict', error.message);
  if (error.code === '22023') return jsonError('invalid_request', error.message);
  if (error.code === '42501') return jsonError('not_found', error.message, { status: 403 });
  return jsonError('internal_error', 'The test reservation could not be changed.', {
    detail: error,
  });
}

/** The booking engine's id characters (apps/web/lib/booking/bridge.ts). */
export const ENGINE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One sandbox reservation from a function's answer, against the contract. */
export function sandboxReservation(data: unknown) {
  const row = (Array.isArray(data) ? data[0] : data) as { reservation?: unknown } | null;
  return ApiReservation.safeParse(row?.reservation);
}

/**
 * POST /v1/reservations/{id}/accept, /decline and PUT /driver: the engine for
 * a live key, the sandbox for a test key. Every one carries the version read
 * and an Idempotency-Key.
 */
export async function reservationAction<S extends z.ZodTypeAny>(
  request: Request,
  id: string,
  action: 'accept' | 'decline' | 'driver',
  schema: S,
): Promise<Response> {
  const auth = await authorize(
    request,
    'merchant_write',
    'merchant_write',
    'change its reservations',
  );
  if (auth instanceof Response) return auth;
  const { credential, rate } = auth;
  if (!ENGINE_ID.test(id)) {
    return jsonError('invalid_request', 'Invalid reservation ID', {
      fields: { id: 'A reservation id is the id from a reservation or a reservation event.' },
    });
  }
  const key = idempotencyKey(request);
  if (key instanceof Response) return key;
  const body = await jsonBody(request, schema);
  if (body instanceof Response) return body;

  if (credential.environment === 'test') {
    if (!UUID.test(id)) return jsonError('not_found', 'Reservation not found');
    const { data, error } = await sandbox().rpc(SANDBOX.act, {
      p_api_key: credential.rawKey,
      p_id: id,
      p_action: action,
      p_input: body,
    });
    if (error) return sandboxRefusal(error);
    const reservation = sandboxReservation(data);
    if (!reservation.success) {
      return jsonError('internal_error', 'The test reservation could not be read back.', {
        detail: reservation.error.issues,
      });
    }
    return answer({ reservation: reservation.data }, rate, credential);
  }

  let result: EngineResult;
  try {
    result = await engineRequest(
      action === 'driver' ? 'PUT' : 'POST',
      `/v1/platform/reservations/${encodeURIComponent(id)}/${action}`,
      credential,
      { body, idempotencyKey: key },
    );
  } catch (error) {
    return engineUnavailable(error);
  }
  if (!result.ok) return engineRefusal(result, 'Reservation not found');
  const reservation = checkReservation(result.body);
  if (!reservation.success) {
    return jsonError('internal_error', 'The reservation could not be read back.', {
      detail: reservation.error.issues,
    });
  }
  return answer({ reservation: reservation.data }, rate, credential);
}

/**
 * A change to the business's offerings or resources: a live key only, with
 * catalogue_write and an Idempotency-Key, checked against the schema, then
 * sent to the engine; the answer is checked against `result`.
 */
export async function setupChange<S extends z.ZodTypeAny, R extends z.ZodTypeAny>(
  request: Request,
  options: {
    method: 'PATCH' | 'POST' | 'DELETE';
    path: string;
    id: string;
    body?: S;
    query?: Record<string, string>;
    result: R;
    name: 'offering' | 'resource';
  },
): Promise<Response> {
  const auth = await authorize(
    request,
    'catalogue_write',
    'catalogue_write',
    'change its booking setup',
  );
  if (auth instanceof Response) return auth;
  const { credential, rate } = auth;
  if (credential.environment === 'test') {
    return jsonError(
      'not_found',
      'A test key changes no offering or resource: the sandbox has none. Use a live key, or try reservations with POST /v1/test/reservations.',
      { status: 403 },
    );
  }
  if (!ENGINE_ID.test(options.id)) {
    return jsonError('invalid_request', `Invalid ${options.name} ID`, {
      fields: { id: `An ${options.name} id is the id from GET /v1/${options.name}s.` },
    });
  }
  const key = idempotencyKey(request);
  if (key instanceof Response) return key;
  let body: unknown;
  if (options.body) {
    const parsed = await jsonBody(request, options.body);
    if (parsed instanceof Response) return parsed;
    body = parsed;
  }
  const search = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';
  let result: EngineResult;
  try {
    result = await engineRequest(options.method, `${options.path}${search}`, credential, {
      ...(body !== undefined ? { body } : {}),
      idempotencyKey: key,
    });
  } catch (error) {
    return engineUnavailable(error);
  }
  if (!result.ok) {
    return engineRefusal(
      result,
      `${options.name === 'offering' ? 'Offering' : 'Resource'} not found`,
    );
  }
  const checked = options.result.safeParse(result.body);
  if (!checked.success) {
    return jsonError('internal_error', `The ${options.name} could not be read back.`, {
      detail: checked.error.issues,
    });
  }
  return answer({ [options.name]: checked.data }, rate, credential);
}

/** GET /v1/offerings and /v1/resources: the business's setup, from the engine. */
export async function setupList<R extends z.ZodTypeAny>(
  request: Request,
  path: string,
  item: R,
  what: string,
): Promise<Response> {
  const auth = await authorize(request, 'merchant_read', 'merchant_read', `read its ${what}`);
  if (auth instanceof Response) return auth;
  const { credential, rate } = auth;
  let result: EngineResult;
  try {
    result = await engineRequest('GET', path, credential);
  } catch (error) {
    return engineUnavailable(error);
  }
  if (!result.ok) return engineRefusal(result, 'Not found');
  const items = (result.body as { items?: unknown } | null)?.items;
  const checked = Array.isArray(items) ? items.map((entry) => item.safeParse(entry)) : null;
  if (!checked || checked.some((entry) => !entry.success)) {
    return jsonError('internal_error', `The ${what} could not be read.`, {
      detail: checked?.find((entry) => !entry.success),
    });
  }
  return answer(
    { items: checked.map((entry) => (entry.success ? entry.data : null)) },
    rate,
    credential,
  );
}
