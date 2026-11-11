import { NextResponse } from 'next/server';

import { callbackSecretValid } from '@/lib/daraja';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * A payment made to the Paybill from the M-Pesa menu, without a prompt
 * (C2B confirmation). The customer typed an account number; when it is an
 * order number and the amount is what is owed, the order is paid. Anything
 * else is kept for Finance to match or refund. Unsigned like every Daraja
 * callback, so the token in the URL is checked here and in the database.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const accepted = NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  if (!token || !callbackSecretValid(token)) return accepted;

  let body: {
    TransactionType?: string;
    TransID?: string;
    TransTime?: string;
    TransAmount?: string | number;
    BusinessShortCode?: string | number;
    BillRefNumber?: string;
    MSISDN?: string | number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return accepted;
  }
  const amount = Number(body?.TransAmount);
  if (!body?.TransID || !Number.isFinite(amount)) return accepted;

  const { error } = await (
    createPublicClient().rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>
  )('rpc_payment_mpesa_paybill', {
    p_callback_secret: token,
    p_trans_id: String(body.TransID),
    p_amount_kes: amount,
    p_account: String(body.BillRefNumber ?? ''),
    p_msisdn: body.MSISDN === undefined ? null : String(body.MSISDN),
    /* What Safaricom said, without the payer's name. */
    p_payload: {
      TransactionType: body.TransactionType ?? null,
      TransID: body.TransID,
      TransTime: body.TransTime ?? null,
      TransAmount: amount,
      BusinessShortCode: body.BusinessShortCode ?? null,
      BillRefNumber: body.BillRefNumber ?? null,
    },
  });

  if (error) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Retry' }, { status: 500 });
  return accepted;
}
