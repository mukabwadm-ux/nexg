import { NextResponse } from 'next/server';

import { callbackSecretValid } from '@/lib/daraja';
import { createPublicClient } from '@/lib/supabase/public';

type Param = { Key?: string; Value?: string | number };

/**
 * Safaricom's final word on a refund sent by M-Pesa (B2C result). Unsigned,
 * like every Daraja callback, so the token in the URL is checked here and
 * again in the database before the refund is touched.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const accepted = NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  if (!token || !callbackSecretValid(token)) return accepted;

  let body: {
    Result?: {
      ResultCode?: number | string;
      ResultDesc?: string;
      OriginatorConversationID?: string;
      ConversationID?: string;
      TransactionID?: string;
      ResultParameters?: { ResultParameter?: Param[] | Param };
    };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return accepted;
  }
  const result = body?.Result;
  const code = Number(result?.ResultCode);
  if (!result?.OriginatorConversationID || !Number.isInteger(code)) return accepted;

  const raw = result.ResultParameters?.ResultParameter;
  const params = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const pick = (key: string) => params.find((p) => p.Key === key)?.Value;
  const amount = pick('TransactionAmount');
  const receipt = pick('TransactionReceipt') ?? result.TransactionID;

  const { error } = await (
    createPublicClient().rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>
  )('rpc_mpesa_payout_result', {
    p_callback_secret: token,
    p_originator_id: result.OriginatorConversationID,
    p_conversation_id: result.ConversationID ?? null,
    p_result_code: code,
    p_result_desc: result.ResultDesc ?? '',
    p_receipt: receipt === undefined ? null : String(receipt),
    p_amount_kes: amount === undefined ? null : Number(amount),
    /* What Safaricom said, without the receiver's name. */
    p_payload: {
      ResultCode: code,
      ResultDesc: result.ResultDesc ?? '',
      OriginatorConversationID: result.OriginatorConversationID,
      ConversationID: result.ConversationID ?? null,
      TransactionID: result.TransactionID ?? null,
      TransactionAmount: amount ?? null,
    },
  });

  if (error) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Retry' }, { status: 500 });
  return accepted;
}
