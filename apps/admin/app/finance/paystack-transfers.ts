'use server';

import { revalidatePath } from 'next/cache';

import { createMpesaRecipient, payoutMode, paystackProof, transfer } from '@/lib/paystack';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

export interface TransferOutcome {
  ok: boolean;
  message: string;
}

interface Opened {
  reference: string;
  sent: boolean;
  state: string;
  amount_cents: number;
  destination: string;
  name: string | null;
  test: boolean;
  recipient_code: string | null;
}

const refusal = (message: string) => message.replace(/^.*?:\s*/, '').slice(0, 300);

/**
 * "Pay through Paystack" for a rider's approved early payout (payouts slice
 * R2a). The database decides whether it may be paid and how much, and keeps
 * NexG's reference, so a second press never pays twice. It is marked paid only
 * when Paystack confirms the transfer reached the rider.
 */
export async function payEarlyThroughPaystack(requestId: string): Promise<TransferOutcome> {
  return sendThroughPaystack('rider_early', requestId, 'NexG early payout');
}

/**
 * "Pay through Paystack" for a rider's automatic payout that waits for
 * Finance (over the largest automatic payout, or the fee not set). The
 * database works out again what leaves and keeps NexG's reference.
 */
export async function payHeldRiderPayoutThroughPaystack(
  payoutId: string,
): Promise<TransferOutcome> {
  return sendThroughPaystack('rider_payout', payoutId, 'NexG payout');
}

/** Cancels a held automatic payout; what it would have paid goes with the next one. */
export async function cancelHeldRiderPayout(
  payoutId: string,
  note: string,
): Promise<TransferOutcome> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(payoutId)) return { ok: false, message: 'That payout could not be found.' };
  const client = createClient() as unknown as { rpc: Rpc };
  const { error } = await client.rpc('rpc_finance_rider_payout_cancel', {
    p_payout_id: payoutId,
    p_note: note.slice(0, 300),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  revalidatePath('/finance/settlements');
  return { ok: true, message: "Cancelled. It is paid with the rider's next payout." };
}

async function sendThroughPaystack(
  kind: 'rider_early' | 'rider_payout',
  sourceId: string,
  reason: string,
): Promise<TransferOutcome> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(sourceId)) return { ok: false, message: 'That request could not be found.' };

  const mode = payoutMode();
  const proof = mode ? paystackProof(mode) : null;
  if (!mode || !proof) return { ok: false, message: 'Paystack is unavailable at the moment.' };

  const client = createClient() as unknown as { rpc: Rpc };
  const done = (outcome: TransferOutcome) => {
    revalidatePath('/finance/settlements');
    return outcome;
  };

  const opened = await client.rpc('rpc_paystack_transfer_open', {
    p_kind: kind,
    p_source: sourceId,
    p_proof: proof,
  });
  if (opened.error) return { ok: false, message: refusal(opened.error.message) };
  const t = opened.data as Opened;
  if (t.sent) return done({ ok: true, message: `Already sent to Paystack (${t.state}).` });

  /* Paystack's recipient for this M-Pesa number, made once. */
  let recipient = t.recipient_code;
  if (!recipient) {
    const made = await createMpesaRecipient(mode, {
      name: t.name ?? 'NexG rider',
      phone: t.destination,
    });
    if (!made.answered || !made.raw) return done({ ok: false, message: made.message });
    const saved = await client.rpc('rpc_paystack_transfer_answered', {
      p_reference: t.reference,
      p_step: 'recipient',
      p_answer: made.raw,
      p_proof: proof,
    });
    if (saved.error) return done({ ok: false, message: refusal(saved.error.message) });
    recipient = (saved.data as { recipient_code?: string } | null)?.recipient_code ?? null;
    if (!recipient) return done({ ok: false, message: made.message });
  }

  const sent = await transfer(mode, {
    recipient,
    amountCents: Number(t.amount_cents),
    reference: t.reference,
    reason,
  });
  /* Not answered: nothing is recorded as sent; pressing again re-sends under the same reference. */
  if (!sent.answered || !sent.raw) return done({ ok: false, message: sent.message });

  const recorded = await client.rpc('rpc_paystack_transfer_answered', {
    p_reference: t.reference,
    p_step: 'transfer',
    p_answer: sent.raw,
    p_proof: proof,
  });
  if (recorded.error) return done({ ok: false, message: refusal(recorded.error.message) });
  const state = (recorded.data as { state?: string } | null)?.state;
  const test = t.test ? ' Test mode: no money moved.' : '';
  if (state === 'success') return done({ ok: true, message: `Paid through Paystack.${test}` });
  if (state === 'otp')
    return done({
      ok: false,
      message:
        'Paystack is asking for an OTP to release transfers. Turn off the transfer OTP in the Paystack dashboard, then press again.',
    });
  if (state === 'failed')
    return done({ ok: false, message: `Paystack did not send it: ${sent.message}` });
  return done({
    ok: true,
    message: `Sent to Paystack. It shows as paid once Paystack confirms it reached the rider.${test}`,
  });
}
