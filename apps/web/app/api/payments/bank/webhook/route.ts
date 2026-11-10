import { NextResponse } from 'next/server';

import {
  BANK_SIGNATURE_HEADER,
  bankProvider,
  bankWebhookSecret,
  verifyBankSignature,
} from '@/lib/bank';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * Where the bank sends signed collection events.
 *
 * The signature is checked here to turn away noise quickly, and again in the
 * database, which is what decides. Responses tell the bank whether to retry:
 * 2xx for anything handled or permanently refused, 5xx when a retry could help.
 */
export async function POST(request: Request) {
  const provider = bankProvider();
  const secret = bankWebhookSecret();
  if (!provider || !secret) {
    return NextResponse.json({ ok: false, reason: 'no_bank_configured' }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get(BANK_SIGNATURE_HEADER);
  if (!verifyBankSignature(raw, signature, secret)) {
    return NextResponse.json({ ok: false, reason: 'bad_signature' }, { status: 400 });
  }

  /* Not in the generated types until they are regenerated with this RPC. */
  const { data, error } = await (
    createPublicClient().rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  )('rpc_payment_bank_webhook', {
    p_provider: provider.id,
    p_raw_body: raw,
    p_signature_header: signature,
  });

  if (error) {
    return NextResponse.json({ ok: false, reason: 'not_recorded' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}

/** Lets the bank (or a person) check the endpoint is there. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'bank webhook',
    configured: bankProvider() !== null,
  });
}
