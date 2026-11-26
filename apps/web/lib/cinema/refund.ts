import 'server-only';

import { paystackMode, paystackProof, refund, type PaystackMode } from '@/lib/paystack';
import { loadPaystackKeys } from '@/lib/paystack-keys';

import type { Rpc } from './service';

/**
 * A full refund of a paid cinema hold that ended in refund_due (the cinema
 * refused the confirm, the showing was cancelled, or the payment came too
 * late). Run by the cinema worker with the service role:
 *
 *   1. fn_cinema_refund_open opens NexG's refund for the hold's paid payment,
 *      the whole amount, or answers the one already open (idempotent);
 *   2. Paystack is asked to refund the transaction, under NexG's reference;
 *   3. Paystack's answer is recorded (fn_paystack_refund_answered_system).
 *
 * Asking is not refunding: the hold becomes "refunded" (cinema_record_refunded)
 * only when Paystack says the refund was processed, through
 * fn_paystack_refund_apply, from its signed webhook.
 *
 * Owner, 23 Nov 2026: test mode, no real refund. A live payment is refunded
 * only once live Paystack is switched on here (NEXG_PAYSTACK_LIVE=1 and the
 * live key, the same switch that starts live payments); otherwise nothing is
 * sent and the hold waits, shown in the admin.
 */

export class CinemaRefundError extends Error {
  constructor(
    message: string,
    readonly reference?: string,
  ) {
    super(message);
    this.name = 'CinemaRefundError';
  }
}

interface Opened {
  reference: string;
  amount_cents: number;
  mode: PaystackMode;
  paystack_transaction: string;
  state: string;
}

export type CinemaRefundOutcome =
  | {
      reference: string;
      /** sent: Paystack was asked now; waiting: asked before, its answer awaited; processed: done. */
      outcome: 'sent' | 'waiting' | 'processed';
    }
  | {
      /** Nothing is sent and a person refunds this one (shown in the admin): live refunds are
          off, or the refund failed (Paystack refused it, or it failed there). */
      reference?: string;
      outcome: 'needs_person';
      message: string;
    }
  | {
      /** Paystack refused (a 4xx other than 401, 403, 409 and 429). Its answer is recorded and the refund marked failed; not asked again this run. */
      reference: string;
      outcome: 'refused';
      message: string;
    };

/** fn_cinema_refund_open's hint when live refunds are switched off in the database. */
const LIVE_REFUNDS_OFF = 'live_refunds_off';

function opened(data: unknown): Opened | null {
  const o = (data ?? {}) as Record<string, unknown>;
  const amount = Number(o.amount_cents);
  const transaction =
    typeof o.paystack_transaction === 'number'
      ? String(o.paystack_transaction)
      : o.paystack_transaction;
  if (
    typeof o.reference !== 'string' ||
    !/^NXR-[A-Za-z0-9-]{8,60}$/.test(o.reference) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    (o.mode !== 'test' && o.mode !== 'live') ||
    typeof transaction !== 'string' ||
    !transaction.trim() ||
    typeof o.state !== 'string'
  )
    return null;
  return {
    reference: o.reference,
    amount_cents: amount,
    mode: o.mode,
    paystack_transaction: transaction.trim(),
    state: o.state,
  };
}

/** Whether this server may refund in that mode now. */
function mayRefund(mode: PaystackMode): boolean {
  if (mode === 'live') return paystackMode() === 'live';
  return paystackProof('test') !== null;
}

export async function refundCinemaHold(
  db: Rpc,
  holdId: string,
  reason: string,
): Promise<CinemaRefundOutcome> {
  const open = await db('fn_cinema_refund_open', { p_hold_id: holdId, p_reason: reason });
  if (open.error) {
    /* The database's own switch: live refunds are off, so a person refunds
       this hold. Paystack is not called, and it is not a failure to retry. */
    if (open.error.hint === LIVE_REFUNDS_OFF)
      return { outcome: 'needs_person', message: open.error.message.slice(0, 200) };
    throw new CinemaRefundError(open.error.message.slice(0, 200));
  }
  const refundRow = opened(open.data);
  if (!refundRow) throw new CinemaRefundError('The refund could not be opened.');
  const { reference } = refundRow;

  if (refundRow.state === 'processed') return { reference, outcome: 'processed' };
  /* Failed (Paystack refused it, or it failed there): never sent again by the
     worker; a person looks at it. */
  if (refundRow.state === 'failed')
    return {
      reference,
      outcome: 'needs_person',
      message: 'The refund failed at Paystack, so a person must look at it.',
    };
  /* Already with Paystack (pending, processing, needs-attention): its answer
     comes by webhook; asking again would not refund twice, but is noise. */
  if (refundRow.state !== 'opened') return { reference, outcome: 'waiting' };

  /* The second check, on this server: live money is refunded only with live
     Paystack switched on here. */
  await loadPaystackKeys();
  if (!mayRefund(refundRow.mode)) {
    if (refundRow.mode === 'live')
      return {
        reference,
        outcome: 'needs_person',
        message: 'Live Paystack is not switched on, so live refunds wait.',
      };
    throw new CinemaRefundError('Paystack test mode is not set up.', reference);
  }

  const answer = await refund(refundRow.mode, {
    transaction: refundRow.paystack_transaction,
    amountCents: refundRow.amount_cents,
    reference,
    note: `NexG cinema refund ${reference}`,
  });
  /* Recorded only when Paystack took the request (ok) or refused it (a 4xx).
     Any other failure (a 5xx, a timeout, no network, an answer we could not
     read) records nothing: the refund stays opened, and the next run asks
     again under the same reference. */
  if (!answer.ok && !answer.refused) throw new CinemaRefundError(answer.message, reference);
  /* A rate limit (429) or a key problem (401, 403) is not Paystack deciding
     about this refund, and a reference already used (409) means Paystack may
     have taken an earlier try, so it must not be marked failed. Record
     nothing: the refund stays opened until Paystack's webhook or a later run
     moves it. */
  if (!answer.ok && [401, 403, 409, 429].includes(answer.status ?? 0)) {
    throw new CinemaRefundError(answer.message, reference);
  }
  if (!answer.raw) throw new CinemaRefundError(answer.message, reference);

  const recorded = await db('fn_paystack_refund_answered_system', {
    p_reference: reference,
    p_answer: JSON.parse(answer.raw) as unknown,
  });
  if (recorded.error)
    throw new CinemaRefundError(
      `Paystack answered, but the answer was not recorded: ${recorded.error.message.slice(0, 160)}`,
      reference,
    );
  /* Paystack refused (4xx): fn_paystack_refund_answered_system has marked the
     refund failed. Reported once, never asked again in this run. */
  if (!answer.ok) return { reference, outcome: 'refused', message: answer.message };
  return { reference, outcome: 'sent' };
}
