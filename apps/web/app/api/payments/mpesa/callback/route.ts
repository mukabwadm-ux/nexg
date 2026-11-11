import { NextResponse } from 'next/server';

import { callbackSecretValid } from '@/lib/daraja';
import { createPublicClient } from '@/lib/supabase/public';

type Item = {
  Name: string;
  Value?: string | number;
};

/**
 * Safaricom's result callback. It is unsigned, so authenticity rests on the
 * secret token in the URL. The database checks that token again before
 * looking up the recorded CheckoutRequestID and verifying the amount.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const accepted = NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  const tokenOk = Boolean(token && callbackSecretValid(token));

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

  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID || typeof cb.ResultCode !== 'number') return accepted;

  /* A callback for one of our prompts that arrives without the right token
     changes nothing, but it is written down: a callback address that has
     lost its token is otherwise invisible until payments stop settling. */
  if (!tokenOk) {
    await (
      createPublicClient().rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<unknown>
    )('rpc_payment_mpesa_callback_rejected', {
      p_checkout_request_id: cb.CheckoutRequestID.slice(0, 120),
      p_reason: token ? 'wrong_token' : 'missing_token',
    });
    return accepted;
  }

  const items = cb.CallbackMetadata?.Item ?? [];
  const pick = (name: string) => items.find((i) => i.Name === name)?.Value;
  const amount = pick('Amount');
  const receipt = pick('MpesaReceiptNumber');
  const phone = pick('PhoneNumber');

  const { error } = await createPublicClient().rpc('rpc_payment_mpesa_callback', {
    p_checkout_request_id: cb.CheckoutRequestID,
    p_result_code: cb.ResultCode,
    p_result_desc: cb.ResultDesc ?? '',
    p_callback_secret: token ?? '',
    p_payload: body,
    p_amount_kes: amount === undefined ? undefined : Number(amount),
    p_receipt: receipt === undefined ? undefined : String(receipt),
    p_phone: phone === undefined ? undefined : String(phone),
  });

  /* Our fault: let Safaricom retry. */
  if (error) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Retry' }, { status: 500 });
  return accepted;
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'mpesa callback' });
}
