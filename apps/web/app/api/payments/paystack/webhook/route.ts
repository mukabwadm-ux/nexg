import { NextResponse } from 'next/server';

import { paystackConfigured, signatureValid } from '@/lib/paystack';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * Paystack signs the raw body. Keep those bytes intact so the route
 * and the database can each verify them before recording a payment.
 */
export async function POST(request: Request) {
  if (!paystackConfigured()) {
    /* 503 rather than 200: this is the one case where a retry is
       worth having, because the keys may be minutes away. */
    return NextResponse.json({ ok: false, reason: 'no_provider_configured' }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get('x-paystack-signature');
  if (!signature || !signatureValid(raw, signature)) {
    return NextResponse.json({ ok: true, result: { ok: false, reason: 'bad_signature' } });
  }

  const { data, error } = await createPublicClient().rpc('rpc_payment_paystack_webhook', {
    p_raw_body: raw,
    p_signature: signature,
  });

  if (error) {
    /* Our fault, so a retry is genuinely worth something. */
    return NextResponse.json({ ok: false, reason: 'verification_unavailable' }, { status: 500 });
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
