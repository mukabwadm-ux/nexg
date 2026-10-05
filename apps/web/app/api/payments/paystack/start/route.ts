import { NextResponse } from 'next/server';

import { initialise, paystackConfigured } from '@/lib/paystack';
import { createClient } from '@/lib/supabase/server';

/**
 * Open a checkout for something that is owed.
 *
 * The sequence matters and is the same for every intent:
 *
 *   1. The database makes the payment row and hands back a
 *      reference it generated. Row security decides whether this
 *      caller may pay for this thing at all.
 *   2. Paystack is told about that reference.
 *   3. What Paystack said is written back.
 *
 * Nothing here decides an amount. The figure comes from the RPC,
 * which reads it from the order or the quote — a checkout that
 * could be told what to charge is a checkout somebody can tell to
 * charge nothing.
 */
export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: 'Sign in first.' }, { status: 401 });
  }

  let input: { orderId?: string; bookingId?: string; email?: string };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 });
  }

  if (!input.orderId && !input.bookingId) {
    return NextResponse.json(
      { ok: false, message: 'Say what is being paid for.' },
      { status: 400 },
    );
  }

  /* The row first, so there is never a provider transaction with
     nothing behind it. */
  const begun = input.orderId
    ? await supabase.rpc('rpc_payment_begin_order', { p_order_id: input.orderId })
    : await supabase.rpc('rpc_payment_begin_featured', { p_booking_id: input.bookingId! });

  if (begun.error) {
    return NextResponse.json(
      { ok: false, message: begun.error.message.replace(/^.*?:\s*/, '') },
      { status: 400 },
    );
  }

  const payment = begun.data as {
    payment_id: string;
    reference: string;
    amount_cents: number;
    currency: string;
    authorization_url: string | null;
    reused?: boolean;
  };

  /* Already has somewhere to send them. */
  if (payment.authorization_url) {
    return NextResponse.json({ ok: true, ...payment });
  }

  if (!paystackConfigured()) {
    /*
     * The record stands and says what is owed; only the rail is
     * missing. A staff member can still take this by hand and mark
     * it, which is what happens today.
     */
    return NextResponse.json(
      {
        ok: false,
        pending: true,
        reference: payment.reference,
        amount_cents: payment.amount_cents,
        message:
          'No payment provider is connected yet, so there is nowhere to send you. Set PAYSTACK_SECRET_KEY and this same button works.',
      },
      { status: 503 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? new URL(request.url).origin;

  const started = await initialise({
    reference: payment.reference,
    amountCents: payment.amount_cents,
    /*
     * Paystack requires an email. A guest ordering by phone may
     * not have given one, and inventing a plausible address would
     * put a receipt into somebody else's inbox — so the reference
     * becomes the address, on a domain we own and do not deliver
     * to.
     */
    email: input.email?.trim() || `${payment.reference.toLowerCase()}@receipts.nexgapp.com`,
    currency: payment.currency,
    callbackUrl: `${origin}/pay/${payment.reference}`,
    metadata: { payment_id: payment.payment_id },
    channels: ['card', 'mobile_money', 'bank_transfer'],
  });

  if (!started.ok || !started.data) {
    return NextResponse.json({ ok: false, message: started.message }, { status: 502 });
  }

  const back = await supabase.rpc('rpc_payment_authorised', {
    p_reference: payment.reference,
    p_provider_ref: started.data.access_code,
    p_url: started.data.authorization_url,
  });

  if (back.error) {
    /* Paystack has a transaction we failed to record. Say so
       loudly: the webhook will still arrive and find the pending
       row, so nothing is lost, but this is worth knowing about. */
    return NextResponse.json(
      {
        ok: false,
        message: `Checkout opened but we could not record it: ${back.error.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    payment_id: payment.payment_id,
    reference: payment.reference,
    amount_cents: payment.amount_cents,
    currency: payment.currency,
    authorization_url: started.data.authorization_url,
  });
}
