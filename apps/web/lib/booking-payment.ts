import 'server-only';

import { z } from 'zod';

import { forwardBookingRequest } from '@/lib/booking/bridge';
import { settleEngineBookingPayment } from '@/lib/booking/platform';
import {
  problem,
  readPayment,
  refused,
  rpc,
  startPayment,
  stateFrom,
  unavailable,
  type Client,
  type PaymentTarget,
  type Session,
} from '@/lib/order-payment';
import { paystackMode, paystackProof } from '@/lib/paystack';

/**
 * Paying for a booking made in the app (owner, 22 Nov 2026: "Deposits now"):
 *
 *   GET  /api/customer/checkout/bookings/{bookingId}/payment
 *   POST /api/customer/checkout/bookings/{bookingId}/payment
 *        the order route's body, plus "payInFull": true to pay the whole amount
 *        instead of the deposit
 *
 * {bookingId} is the customer's saved booking (customer_engine_booking.id).
 * The booking engine is the record of the booking and of what is due: this
 * reads the booking from the engine with the customer's own booking token, and
 * charges exactly what is due at this step: the deposit (when the business asks
 * one) to confirm it, else the whole amount, and once confirmed with a deposit
 * paid, the balance. When Paystack says it is paid, the booking is settled in
 * the engine (settleBookings); the engine checks the amount again.
 */

const bookingId = z.string().uuid();
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const REF = /^(account|app_guest)_[0-9a-f-]{36}$/;
const cents = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;

interface SavedBooking {
  id: string;
  merchant_id: string;
  engine_booking_id: string;
  customer_token: string;
  customer_ref: string | null;
}

interface EngineBooking {
  status?: unknown;
  priceMinor?: unknown;
  paidMinor?: unknown;
  expiresAt?: unknown;
  pricing?: { totalDueMinor?: unknown; dueNowMinor?: unknown };
}

/** The booking as the engine has it, read with the customer's own token. */
async function engineBooking(row: SavedBooking): Promise<EngineBooking | null> {
  if (!row.customer_ref || !REF.test(row.customer_ref) || !ID.test(row.engine_booking_id))
    return null;
  const read = new Request(
    `https://www.nexgapp.com/api/public/booking/${row.merchant_id}/bookings/${row.engine_booking_id}`,
    { method: 'GET' },
  );
  const response = await forwardBookingRequest(
    read,
    ['bookings', row.engine_booking_id],
    { businessId: row.merchant_id, userId: row.customer_ref, role: 'customer' },
    'customer',
    { appSession: true, customerToken: row.customer_token },
  );
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as
    | (EngineBooking & { booking?: EngineBooking })
    | null;
  if (!body || typeof body !== 'object') return null;
  return body.booking && typeof body.booking === 'object' ? body.booking : body;
}

type Step = { step: 'full' | 'deposit' | 'balance'; amount: number; expiresAt: string | null };

/** What is due now, from the engine's own figures. */
export function stepFor(booking: EngineBooking, payInFull: boolean): Step | 'nothing' | 'closed' {
  const total = cents(booking.pricing?.totalDueMinor) ?? cents(booking.priceMinor);
  const paid = cents(booking.paidMinor) ?? 0;
  if (total === null) return 'closed';
  const remaining = total - paid;
  if (remaining <= 0) return 'nothing';
  const expiresAt =
    typeof booking.expiresAt === 'string' && !Number.isNaN(Date.parse(booking.expiresAt))
      ? new Date(booking.expiresAt).toISOString()
      : null;
  if (booking.status === 'held') {
    const deposit = cents(booking.pricing?.dueNowMinor);
    if (!payInFull && paid === 0 && deposit !== null && deposit > 0 && deposit < total)
      return { step: 'deposit', amount: deposit, expiresAt };
    return { step: 'full', amount: remaining, expiresAt };
  }
  if (booking.status === 'confirmed' && paid > 0)
    return { step: 'balance', amount: remaining, expiresAt: null };
  return 'closed';
}

/**
 * Settles paid booking payments in the engine. Safe to run any time: the engine
 * treats the same provider and reference as one payment. A refusal (the hold ran
 * out, or the amount no longer matched) is recorded for Finance to refund.
 */
export async function settleBookings(
  client: Client,
): Promise<{ settled: number; refused: number }> {
  const mode = paystackMode();
  const proof = mode ? paystackProof(mode) : null;
  if (!proof) return { settled: 0, refused: 0 };
  const due = await rpc(client, 'rpc_payment_engine_due', { p_proof: proof });
  if (due.error) return { settled: 0, refused: 0 };
  const rows =
    (due.data as
      | {
          reference: string;
          merchant_id: string;
          engine_booking_id: string;
          amount_cents: number;
          is_test: boolean;
        }[]
      | null) ?? [];
  let settled = 0;
  let refusedCount = 0;
  for (const row of rows) {
    const result = await settleEngineBookingPayment({
      merchantId: row.merchant_id,
      bookingId: row.engine_booking_id,
      amountMinor: Number(row.amount_cents),
      provider: row.is_test ? 'paystack_test' : 'paystack',
      reference: row.reference,
    });
    const refusal =
      !result.ok &&
      [
        'hold_expired',
        'payment_amount_mismatch',
        'already_paid',
        'payment_policy_required',
      ].includes(result.code)
        ? result.code
        : null;
    await rpc(client, 'rpc_payment_engine_settled', {
      p_reference: row.reference,
      p_ok: result.ok,
      p_refusal: refusal,
      p_proof: proof,
    });
    if (result.ok) settled += 1;
    if (refusal) refusedCount += 1;
  }
  return { settled, refused: refusedCount };
}

function bookingTarget(rawId: string) {
  return async ({ supabase }: Session): Promise<PaymentTarget | Response> => {
    const parsed = bookingId.safeParse(rawId);
    if (!parsed.success) return problem(404, 'NOT_FOUND', 'No such booking.');
    const found = await supabase
      .from('customer_engine_booking')
      .select('id, merchant_id, engine_booking_id, customer_token, customer_ref')
      .eq('id', parsed.data)
      .maybeSingle();
    if (found.error) return unavailable();
    if (!found.data) return problem(404, 'NOT_FOUND', 'No such booking.');
    const row = found.data as unknown as SavedBooking;
    return {
      readState: async () =>
        stateFrom(await rpc(supabase, 'rpc_engine_booking_payment_state', { p_booking: row.id })),
      begin: async (input, proof) => {
        const booking = await engineBooking(row);
        if (!booking) return unavailable();
        const step = stepFor(booking, input.payInFull === true);
        if (step === 'nothing') return problem(409, 'NOTHING_TO_PAY', 'This booking is paid.');
        if (step === 'closed')
          return problem(409, 'NOTHING_TO_PAY', 'This booking can no longer be paid. Book again.');
        const begun = await rpc(supabase, 'rpc_payment_begin_engine_booking', {
          p_booking: row.id,
          p_amount_cents: step.amount,
          p_step: step.step,
          p_expires_at: step.expiresAt,
          p_proof: proof,
        });
        if (begun.error) return refused(begun.error);
        return begun.data as { reference: string; amount_cents: number };
      },
      metadata: { booking_id: row.id, step: 'booking' },
      afterPaid: async () => {
        await settleBookings(supabase);
      },
    };
  };
}

export function readBookingPayment(request: Request, rawId: string) {
  if (!bookingId.safeParse(rawId).success)
    return Promise.resolve(problem(404, 'NOT_FOUND', 'No such booking.'));
  return readPayment(request, bookingTarget(rawId));
}

export function startBookingPayment(request: Request, rawId: string) {
  if (!bookingId.safeParse(rawId).success)
    return Promise.resolve(problem(404, 'NOT_FOUND', 'No such booking.'));
  return startPayment(request, bookingTarget(rawId));
}
