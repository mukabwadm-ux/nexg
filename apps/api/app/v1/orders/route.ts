/**
 * POST /v1/orders
 *
 * A merchant books a service through the API: an airport transfer for
 * their visitors, a courier, a venue.
 *
 * Two things are required that a read does not need.
 *
 * **A scope.** The key must carry `merchant_write`. A read key cannot
 * book, and a key that is not bound to a merchant cannot book for
 * anybody.
 *
 * **An idempotency key.** The same key makes the same order. A machine
 * that retries after a timeout must not create a second airport
 * transfer, and the key is what tells the second attempt apart from the
 * first.
 *
 * The caller never states a price. It says how many and when; the price
 * comes from the fee settings, read inside the transaction, exactly as
 * it is for a guest checking out.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';
import { parse } from '@nexg/contracts';
import { ServiceBooking, IdempotencyKey } from '@nexg/contracts/api';

import { jsonError } from '@/lib/http';
import {
  authenticate,
  enforceRateLimit,
  requireScope,
  API_SCOPES,
  ApiAuthError,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceRoleClient() {
  /*
   * The booking RPC is granted to service_role and not to anon, because
   * booking a transfer moves money and creates a real order. The API
   * server holds the service role key; the browser never sees it.
   */
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(request: Request) {
  // ── the credential ──────────────────────────────────────────────────────
  let credential;
  try {
    credential = await authenticate(request);
    requireScope(credential, API_SCOPES.merchant_write);
    await enforceRateLimit(credential);
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status });
    }
    return jsonError('internal_error', 'Something went wrong on our side.', { status: 500 });
  }

  if (credential.merchantId === null) {
    return jsonError(
      'not_found',
      'This key is not bound to a merchant, so it cannot book anything.',
      { status: 403 },
    );
  }

  // ── the idempotency key ─────────────────────────────────────────────────
  const idempotencyKey = request.headers.get('idempotency-key');
  const keyCheck = IdempotencyKey.safeParse(idempotencyKey);

  if (!keyCheck.success) {
    return jsonError(
      'invalid_request',
      'An Idempotency-Key header is required: 16 to 128 characters.',
      {
        status: 400,
        fields: { 'idempotency-key': 'Required, 16 to 128 characters.' },
      },
    );
  }

  // ── the body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_request', 'That body was not JSON.', { status: 400 });
  }

  const parsed = parse(ServiceBooking, body);

  if (!parsed.ok) {
    return jsonError('invalid_request', parsed.failure.message, {
      status: 400,
      fields: parsed.failure.fields,
    });
  }

  // ── the booking ─────────────────────────────────────────────────────────
  const supabase = serviceRoleClient();

  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    }
  ).rpc('rpc_order_place_api', {
    p_api_key: credential.rawKey,
    p_idempotency_key: keyCheck.data,
    p_payload: parsed.data,
  });

  if (error) {
    /*
     * The RPC raises with a sentence meant for a person, because that
     * is how this system talks about its own rules. The status is
     * chosen from what the sentence is about: a bad request is the
     * caller's to fix, a refusal is not.
     */
    const message = error.message ?? 'The booking could not be placed.';
    /*
     * The SQLSTATE says what kind of failure this is, which is the only
     * thing about an error that a program can branch on. The sentence
     * is for the person reading it.
     *
     *   42501 -- refused. The key is wrong, or it cannot do this.
     *   22023 -- the request itself is wrong.
     */
    const code = (error as { code?: string }).code;
    const refused = code === '42501';
    const badRequest = code === '22023';

    return jsonError(
      refused ? 'not_found' : badRequest ? 'invalid_request' : 'internal_error',
      message,
      { status: refused ? 403 : badRequest ? 400 : 500 },
    );
  }

  const receipt = (Array.isArray(data) ? data[0] : data) as {
    ok: boolean;
    order_id: string;
    reference: string;
    service: string;
    quantity: number;
    total_cents: number;
    currency: string;
    payment_method: string;
    scheduled_for: string | null;
  };

  /*
   * A write is not cached. The answer depends on the credential and on
   * what has already been booked, so a shared cache would serve one
   * merchant's receipt to another.
   */
  return NextResponse.json(
    {
      ok: true,
      data: {
        order_id: receipt.order_id,
        reference: receipt.reference,
        service: receipt.service,
        quantity: receipt.quantity,
        total_cents: receipt.total_cents,
        currency: receipt.currency,
        payment_method: receipt.payment_method,
        scheduled_for: receipt.scheduled_for,
      },
      meta: { api_version: 'v1' as const },
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}