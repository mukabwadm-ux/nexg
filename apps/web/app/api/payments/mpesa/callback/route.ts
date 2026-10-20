import { NextResponse } from 'next/server';

import { callbackSecretValid } from '@/lib/daraja';
import { createPublicClient } from '@/lib/supabase/public';

interface Item {
  Name: string;
  Value?: string | number;
}

/**
 * Safaricom's result callback. It is unsigned, so authenticity rests on the
 * secret token in the URL plus the database only acting on a CheckoutRequestID
 * we stored and an amount we asked for. Always answers 200 so Safaricom does
 * not retry what we have already recorded.
 */
export async function POST(request: Request) {
  const ok = callbackSecretValid(new URL(request.url).searchParams.get('token'));
  const accepted = NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  let body: {
    Body?: {
      stkCallback?: {
        CheckoutRequestID?: string;
        ResultCode?: number;
        ResultDesc?: string;
        CallbackMetadata?: { Item?: Item[] };
      };
    };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return accepted;
  }

  const cb = body.Body?.stkCallback;
  if (!cb?.CheckoutRequestID || typeof cb.ResultCode !== 'number') return accepted;

  const items = cb.CallbackMetadata?.Item ?? [];
  const pick = (name: string) => items.find((i) => i.Name === name)?.Value;
  const amount = pick('Amount');
  const receipt = pick('MpesaReceiptNumber');
  const phone = pick('PhoneNumber');

  const client = createPublicClient();
  const { error } = (await client.rpc(
    'rpc_payment_mpesa_callback' as never,
    {
      p_checkout_request_id: cb.CheckoutRequestID,
      p_result_code: cb.ResultCode,
      p_result_desc: cb.ResultDesc ?? '',
      p_secret_ok: ok,
      p_payload: body,
      p_amount_kes: amount === undefined ? null : Number(amount),
      p_receipt: receipt === undefined ? null : String(receipt),
      p_phone: phone === undefined ? null : String(phone),
    } as never,
  )) as unknown as { error: { message: string } | null };

  /* Our fault: let Safaricom retry. */
  if (error) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Retry' }, { status: 500 });
  return accepted;
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'mpesa callback' });
}
