import 'server-only';

import { b2cConfigured, b2cPay } from '@/lib/daraja';
import { createPublicClient } from '@/lib/supabase/public';

/*
 * Sending money to a customer's phone by M-Pesa (B2C): approved refunds, and
 * money NexG received and does not keep (a second prompt paid, Paybill money
 * for an order that owed nothing).
 *
 * Staff press "Send by M-Pesa"; the database queues a payout
 * (public.mpesa_payout, state 'queued'). The payments worker takes each
 * queued payout once, asks Safaricom to pay it, and records what Safaricom
 * said. The final word arrives later at the result URL. A payout is never
 * sent twice on its own: anything without a clear answer is marked uncertain
 * and waits for a person to check the M-Pesa statement.
 */

type LooseRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const loose = (client: { rpc: unknown }) =>
  ((fn: string, args: Record<string, unknown>) =>
    Promise.resolve(
      (client.rpc as (f: never, a: never) => PromiseLike<unknown>)(fn as never, args as never),
    )) as LooseRpc;

type Claimed = {
  payout_id: string;
  originator_id: string;
  phone: string;
  amount_cents: number;
  order_reference: string;
};

export interface PayoutSendOutcome {
  claimed: number;
  accepted: number;
  refused: number;
  unknown: number;
  errors: string[];
}

export async function sendQueuedPayouts(origin: string): Promise<PayoutSendOutcome> {
  const secret = process.env.DARAJA_CALLBACK_SECRET?.trim() ?? '';
  const outcome: PayoutSendOutcome = {
    claimed: 0,
    accepted: 0,
    refused: 0,
    unknown: 0,
    errors: [],
  };
  if (!secret) return outcome;

  const rpc = loose(createPublicClient());
  const claimed = await rpc('rpc_mpesa_payout_claim', { p_callback_secret: secret, p_limit: 5 });
  if (claimed.error) {
    outcome.errors.push(claimed.error.message);
    return outcome;
  }

  const token = encodeURIComponent(secret);
  for (const payout of (claimed.data ?? []) as Claimed[]) {
    outcome.claimed += 1;
    const sent = b2cConfigured()
      ? await b2cPay({
          originatorId: payout.originator_id,
          phone: payout.phone,
          amountCents: Number(payout.amount_cents),
          remarks: `NexG refund ${payout.order_reference}`,
          occasion: payout.order_reference,
          resultUrl: `${origin}/api/payments/daraja/b2c/result?token=${token}`,
          timeoutUrl: `${origin}/api/payments/daraja/b2c/timeout?token=${token}`,
        })
      : ({
          outcome: 'refused',
          message:
            'M-Pesa refunds are not connected yet (B2C keys). Nothing was sent: send it by hand and record the reference.',
        } as const);

    outcome[sent.outcome] += 1;
    const { error } = await rpc('rpc_mpesa_payout_outcome', {
      p_callback_secret: secret,
      p_originator_id: payout.originator_id,
      p_outcome: sent.outcome,
      p_conversation_id: sent.outcome === 'accepted' ? sent.conversationId : null,
      p_message: sent.message.slice(0, 500),
    });
    if (error) outcome.errors.push(error.message);
  }
  return outcome;
}
