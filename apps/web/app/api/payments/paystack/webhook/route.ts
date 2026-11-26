import { NextResponse } from 'next/server';

import { dedupeKey, paystackConfigured, signatureValid } from '@/lib/paystack';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Paystack tells us what happened.
 *
 * This is the only thing that moves an order to paid. A guest who
 * pays and closes the tab has still paid; one who reaches the
 * success page through the back button has not. The browser's
 * claim is worth nothing and this is worth everything, so it is
 * the one that writes.
 *
 * Order of operations is deliberate:
 *
 *   1. Read the body as raw text. The signature is over bytes, and
 *      parsing then re-serialising changes them.
 *   2. Verify the HMAC. Everything before this point is
 *      attacker-controlled.
 *   3. Hand it to the database *including* whether the signature
 *      verified, so a run of forged attempts is visible rather
 *      than silently dropped.
 *
 * It answers 200 to almost everything. Paystack retries on any
 * other status, and retrying a body we have already stored and
 * rejected achieves nothing but noise — the failure is recorded,
 * not broadcast back.
 */
export async function POST(request: Request) {
  if (!paystackConfigured()) {
    /* 503 rather than 200: this is the one case where a retry is
       worth having, because the keys may be minutes away. */
    return NextResponse.json({ ok: false, reason: 'no_provider_configured' }, { status: 503 });
  }

  const raw = await request.text();
  const ok = signatureValid(raw, request.headers.get('x-paystack-signature'));

  let body: {
    event?: string;
    data?: {
      reference?: string;
      id?: number | string;
      amount?: number;
      channel?: string;
      status?: string;
      gateway_response?: string;
    };
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: 'unreadable' }, { status: 200 });
  }

  const event = body.event ?? 'unknown';
  const reference = body.data?.reference ?? null;

  if (!reference) {
    return NextResponse.json({ ok: false, reason: 'no_reference' }, { status: 200 });
  }

  /*
   * The service client, and only here. The RPC trusts p_signature_ok,
   * so it must not be callable with the public anon key: anyone could
   * call it directly, name their own payment's reference and claim a
   * verified success. The database grants it to service_role only.
   */
  let client;
  try {
    client = createServiceClient();
  } catch {
    /* Misconfigured server: let Paystack retry once it is fixed. */
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }
  const { data, error } = await client.rpc('rpc_payment_webhook', {
    p_event: event,
    p_reference: reference,
    /* The RPC's arguments all default to null; passing undefined
       omits them, where an explicit null would be rejected by the
       generated types. */
    p_provider_ref: body.data?.id ? String(body.data.id) : undefined,
    p_paid: event === 'charge.success' && body.data?.status === 'success',
    p_amount_cents: typeof body.data?.amount === 'number' ? body.data.amount : undefined,
    p_channel: body.data?.channel ?? undefined,
    p_payload: body as never,
    p_signature_ok: ok,
    p_dedupe_key: dedupeKey(raw),
  });

  if (error) {
    /* Our fault, so a retry is genuinely worth something. */
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data }, { status: 200 });
}

/** Paystack checks the endpoint exists before it will send to it. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'paystack webhook',
    configured: paystackConfigured(),
  });
}
