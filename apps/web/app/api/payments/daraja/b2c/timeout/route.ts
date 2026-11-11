import { NextResponse } from 'next/server';

import { callbackSecretValid } from '@/lib/daraja';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * Safaricom gave up on a queued refund (B2C queue timeout). Whether money
 * moved is not certain, so the refund is marked for a person to check the
 * M-Pesa statement. Nothing is sent again on its own.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const accepted = NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  if (!token || !callbackSecretValid(token)) return accepted;

  let body: {
    Result?: { OriginatorConversationID?: string; ResultDesc?: string };
    OriginatorConversationID?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return accepted;
  }
  const originator = body?.Result?.OriginatorConversationID ?? body?.OriginatorConversationID;
  if (!originator) return accepted;

  const { error } = await (
    createPublicClient().rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>
  )('rpc_mpesa_payout_outcome', {
    p_callback_secret: token,
    p_originator_id: originator,
    p_outcome: 'unknown',
    p_conversation_id: null,
    p_message: `M-Pesa timed out the refund in its queue. ${body?.Result?.ResultDesc ?? ''}`
      .trim()
      .slice(0, 500),
  });

  if (error) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Retry' }, { status: 500 });
  return accepted;
}
