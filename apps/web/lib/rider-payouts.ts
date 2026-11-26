import 'server-only';

import { rpc, type Client } from '@/lib/order-payment';
import {
  createMpesaRecipient,
  paystackMode,
  paystackProof,
  transfer,
  verifyTransfer,
  type PaystackMode,
  type PaystackResult,
} from '@/lib/paystack';
import { loadPaystackKeys } from '@/lib/paystack-keys';

/**
 * Riders' automatic payouts (Payout rules: as soon as earnings clear, daily,
 * weekly or monthly). The database decides who is due and how much, claims
 * what each payout pays and keeps NexG's reference; this sends each one
 * through Paystack to the rider's M-Pesa and records Paystack's answers.
 * A payout is paid only on Paystack's word: an error or a timeout leaves it
 * pending, and the next sweep checks with Paystack before sending again.
 *
 * Test keys only ever "pay" riders marked as test riders, and real money
 * goes out only once Finance switches it on (payouts.rider.automatic_live).
 */

interface DueItem {
  reference: string;
  amount_cents: number;
  destination: string;
  name: string | null;
  recipient_code: string | null;
  test: boolean;
  /** Opened by a sweep that stopped half way, or pending a long time. */
  resume?: boolean;
  state?: string;
}

interface Due {
  ok: boolean;
  paused?: string;
  items?: DueItem[];
  held?: number;
  rolled?: number;
}

export interface RiderPayoutSweep {
  sent: number;
  checked: number;
  held?: number;
  rolled?: number;
  skipped?: string;
}

/* What the database is told about an answer: the body, and whether Paystack
   refused it (a 4xx) rather than failed to answer. */
function answerOf(result: PaystackResult<unknown>) {
  return { p_answer: result.raw ?? '', p_refused: result.refused === true };
}

async function record(
  client: Client,
  proof: string,
  reference: string,
  step: 'recipient' | 'transfer' | 'verify',
  result: PaystackResult<unknown>,
) {
  const saved = await rpc(client, 'rpc_paystack_transfer_answered_worker', {
    p_reference: reference,
    p_step: step,
    ...answerOf(result),
    p_proof: proof,
  });
  return saved.error ? null : ((saved.data as Record<string, unknown> | null) ?? null);
}

async function sendOne(client: Client, mode: PaystackMode, proof: string, item: DueItem) {
  /* Picked up again: ask Paystack first, since the first try may have gone through. */
  if (item.resume) {
    const known = await verifyTransfer(mode, item.reference);
    if (!known.raw) return 'unanswered';
    const checked = await record(client, proof, item.reference, 'verify', known);
    if (!checked || checked.send !== true) return 'checked';
  }

  let recipient = item.recipient_code;
  if (!recipient) {
    const made = await createMpesaRecipient(mode, {
      name: item.name ?? 'NexG rider',
      phone: item.destination,
    });
    if (!made.raw) return 'unanswered';
    const saved = await record(client, proof, item.reference, 'recipient', made);
    recipient = typeof saved?.recipient_code === 'string' ? saved.recipient_code : null;
    if (!recipient) return 'refused';
  }

  const sent = await transfer(mode, {
    recipient,
    amountCents: Number(item.amount_cents),
    reference: item.reference,
    reason: 'NexG payout',
  });
  /* No answer at all: nothing is recorded; the next sweep checks and, if
     Paystack never had it, sends again under the same reference. */
  if (!sent.raw) return 'unanswered';
  await record(client, proof, item.reference, 'transfer', sent);
  return 'sent';
}

export async function sendRiderPayouts(client: Client): Promise<RiderPayoutSweep> {
  await loadPaystackKeys();
  const mode = paystackMode();
  const proof = mode ? paystackProof(mode) : null;
  if (!mode || !proof) return { sent: 0, checked: 0, skipped: 'no Paystack key' };

  const due = await rpc(client, 'rpc_rider_payouts_due', { p_proof: proof, p_limit: 8 });
  if (due.error) return { sent: 0, checked: 0, skipped: due.error.message.slice(0, 200) };
  const answer = (due.data as Due | null) ?? { ok: false };
  if (answer.paused) return { sent: 0, checked: 0, skipped: answer.paused };

  let sent = 0;
  let checked = 0;
  /* One at a time: each is two or three short Paystack calls, and the worker
     has a minute in all. Whatever is left waits for the next sweep. */
  for (const item of answer.items ?? []) {
    const outcome = await sendOne(client, mode, proof, item);
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'checked') checked += 1;
  }
  return { sent, checked, held: answer.held, rolled: answer.rolled };
}
