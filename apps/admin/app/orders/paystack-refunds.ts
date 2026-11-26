'use server';

import { revalidatePath } from 'next/cache';

import { paystackProof, refund, type PaystackMode } from '@/lib/paystack';
import { loadPaystackKeys } from '@/lib/paystack-keys';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

export interface PaystackRefundOutcome {
  ok: boolean;
  message: string;
}

/**
 * "Refund through Paystack" (Paystack slice 6). Sends an approved order refund,
 * a cancelled stay's refund or a refused booking payment back to the card or
 * M-Pesa number it was paid with. The database decides whether it may be
 * refunded and how much, and keeps our reference so a second press never
 * refunds twice. It is marked issued only when Paystack says it was processed.
 */
export async function refundThroughPaystack(
  kind: 'order' | 'stay' | 'booking',
  targetId: string,
): Promise<PaystackRefundOutcome> {
  await requireStaff();
  if (!['order', 'stay', 'booking'].includes(kind) || !UUID.test(targetId))
    return { ok: false, message: 'That refund could not be found.' };

  const client = createClient() as unknown as { rpc: Rpc };
  await loadPaystackKeys();
  /* Opened with whichever key is set; the database answers in the payment's own mode. */
  const modes: PaystackMode[] = ['test', 'live'];
  let opened: Record<string, unknown> | null = null;
  let mode: PaystackMode | null = null;
  /* The key that opened it also records Paystack's answer. */
  let openedWith: string | null = null;
  let lastError = 'Paystack is not connected on the console.';
  for (const candidate of modes) {
    const proof = paystackProof(candidate);
    if (!proof) continue;
    const result = await client.rpc('rpc_paystack_refund_open', {
      p_kind: kind,
      p_target: targetId,
      p_proof: proof,
    });
    if (!result.error) {
      opened = result.data as Record<string, unknown>;
      mode = candidate;
      openedWith = proof;
      break;
    }
    lastError = result.error.message.replace(/^.*?:\s*/, '').slice(0, 300);
    /* Only a payment in the other mode is worth trying again with the other key. */
    if (!/other Paystack mode/.test(result.error.message)) break;
  }
  if (!opened || !mode) return { ok: false, message: lastError };
  if (opened.sent) {
    return { ok: true, message: `Already sent to Paystack (${String(opened.state)}).` };
  }

  const reference = String(opened.reference);
  const answer = await refund(mode, {
    transaction: String(opened.transaction),
    amountCents: Number(opened.amount_cents),
    reference,
    note: `NexG refund ${reference}`,
  });
  /* 409: our reference was already used, so an earlier send reached Paystack.
     That is not a refusal: nothing is recorded, and Paystack's notice settles it. */
  if (answer.status === 409) {
    return {
      ok: true,
      message: 'Paystack already has this refund. It shows as refunded once Paystack confirms it.',
    };
  }
  if (!answer.answered || !answer.raw) return { ok: false, message: answer.message };

  const recorded = await client.rpc('rpc_paystack_refund_answered', {
    p_reference: reference,
    p_answer: answer.raw,
    p_proof: openedWith,
  });
  revalidatePath('/orders');
  revalidatePath('/live');
  revalidatePath('/hotels');
  if (recorded.error) return { ok: false, message: recorded.error.message.slice(0, 300) };
  const result = recorded.data as {
    ok?: boolean;
    reason?: string;
    message?: string;
    state?: string;
  } | null;
  if (!result?.ok)
    return {
      ok: false,
      message: result?.reason === 'refused' ? (result.message ?? answer.message) : answer.message,
    };
  return {
    ok: true,
    message:
      result.state === 'processed'
        ? 'Refunded through Paystack.'
        : 'Sent to Paystack. It shows as refunded once Paystack has processed it.',
  };
}
