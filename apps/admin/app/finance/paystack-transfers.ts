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
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(requestId)) return { ok: false, message: 'That request could not be found.' };

  const mode = payoutMode();
  const proof = mode ? paystackProof(mode) : null;
  if (!mode || !proof) return { ok: false, message: 'Paystack is unavailable at the moment.' };

  const client = createClient() as unknown as { rpc: Rpc };
  const done = (outcome: TransferOutcome) => {
    revalidatePath('/finance/settlements');
    return outcome;
  };

  const opened = await client.rpc('rpc_paystack_transfer_open', {
    p_kind: 'rider_early',
    p_source: requestId,
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
    reason: 'NexG early payout',
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
