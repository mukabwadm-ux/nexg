import 'server-only';

import { z } from 'zod';

import {
  problem,
  readPayment,
  refused,
  rpc,
  startPayment,
  stateFrom,
  type Client,
  type PaymentTarget,
  type Session,
} from '@/lib/order-payment';

/**
 * Paying for a cinema seat hold through Paystack (cinema-app-contract v2,
 * step 5; owner, 23 Nov 2026: test mode, for the test cinema only until a
 * real cinema is connected):
 *
 *   GET  /api/customer/checkout/cinema/{holdId}/payment
 *   POST /api/customer/checkout/cinema/{holdId}/payment
 *        the order route's body: {method:'mpesa_stk'|'airtel_money', phone} |
 *        {method:'card', saveCard?} | {method:'saved_card', cardId}
 *
 * The app first asks NexG to keep the seats for the payment (POST
 * /api/customer/cinema/holds/{holdId}/pay, state "paying"); this then charges
 * the hold's total (rpc_payment_begin_cinema, as the customer, so only their
 * own hold). Paystack's signed webhook marks the payment paid, and the
 * database hands the hold to the cinema worker to confirm. GET
 * /api/customer/cinema/holds/{holdId} stays the proof that the seats are
 * booked; this answers only the payment.
 */

const holdId = z.string().uuid();
const headers = { 'Cache-Control': 'private, no-store' };
const notFound = () => problem(404, 'NOT_FOUND', 'No such seat hold.');

function answer(error: { code?: string; message: string }) {
  if (error.code === 'P0002') return notFound();
  return refused(error);
}

/** What is paid for: the customer's own hold, read and begun with their token. */
export function cinemaTarget(supabase: Client, id: string): PaymentTarget {
  return {
    readState: async () => {
      const read = await rpc(supabase, 'rpc_cinema_payment_state', { p_hold_id: id });
      return read.error ? answer(read.error) : stateFrom(read);
    },
    begin: async () => {
      const begun = await rpc(supabase, 'rpc_payment_begin_cinema', { p_hold_id: id });
      if (begun.error) return answer(begun.error);
      return begun.data as { reference: string; amount_cents: number; expires_at?: string };
    },
    metadata: { cinema_hold_id: id },
  };
}

export function readCinemaPayment(request: Request, rawHoldId: string) {
  const id = holdId.safeParse(rawHoldId);
  if (!id.success) return Promise.resolve(notFound());
  return readPayment(request, async ({ supabase }: Session) => cinemaTarget(supabase, id.data));
}

export function startCinemaPayment(request: Request, rawHoldId: string) {
  const id = holdId.safeParse(rawHoldId);
  if (!id.success) return Promise.resolve(notFound());
  return startPayment(request, async ({ supabase }: Session) => {
    const target = cinemaTarget(supabase, id.data);
    /* Paid already: say so, rather than a refusal to pay twice. */
    const current = await target.readState();
    if (current instanceof Response) return current;
    if (current.status === 'paid')
      return Response.json(
        { status: 'paid', ...(current.reference ? { reference: current.reference } : {}) },
        { headers },
      );
    return target;
  });
}
