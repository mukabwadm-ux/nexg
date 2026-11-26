import { NextResponse } from 'next/server';

import { paystackConfigured, signatureMode } from '@/lib/paystack';
import { loadPaystackKeys, refreshPaystackKeys } from '@/lib/paystack-keys';
import { createPublicClient } from '@/lib/supabase/public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Paystack's webhook, the one thing that says an order was paid. Paystack
 * signs the raw body with the secret key (x-paystack-signature). The route
 * checks it, then the database checks it again against Vault, so neither a
 * forged call nor a leaked anon key can mark anything paid. Set this address
 * as the Test (and later Live) Webhook URL in Paystack's dashboard.
 */
export async function POST(request: Request) {
  await loadPaystackKeys();
  if (!paystackConfigured()) return notConfigured();

  const raw = await request.text();
  const signature = request.headers.get('x-paystack-signature');
  if (!signatureMode(raw, signature)) {
    /* The key may just have been changed in the console. */
    await refreshPaystackKeys();
    if (!paystackConfigured()) return notConfigured();
    if (!signatureMode(raw, signature)) {
      return NextResponse.json({ ok: false, reason: 'bad_signature' }, { status: 401 });
    }
  }

  const client = createPublicClient() as unknown as { rpc: Rpc };
  const { data, error } = await client.rpc('rpc_payment_paystack_webhook', {
    p_raw_body: raw,
    p_signature: signature,
  });
  if (error) {
    /* Our side failed, so a retry is worth having. */
    return NextResponse.json({ ok: false, reason: 'verification_unavailable' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data }, { status: 200 });
}

export async function GET() {
  await loadPaystackKeys();
  return NextResponse.json({
    ok: true,
    endpoint: 'paystack webhook',
    configured: paystackConfigured(),
  });
}

/* 503, so Paystack retries: the keys may be minutes away. */
function notConfigured() {
  return NextResponse.json({ ok: false, reason: 'no_provider_configured' }, { status: 503 });
}
