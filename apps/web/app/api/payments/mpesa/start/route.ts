import { NextResponse } from 'next/server';

import { callbackOrigin, normalisePhone } from '@/lib/daraja';
import { sendMpesaPrompt } from '@/lib/mpesa-prompt';
import { createClient } from '@/lib/supabase/server';

/**
 * Sends the M-Pesa PIN prompt for an order. The amount comes from the
 * database, never the client. Sending again reuses the same payment, and no
 * new prompt goes out within a minute of the last; every prompt is recorded,
 * so whichever one the guest answers is the one that counts.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Sign in first.' }, { status: 401 });

  let input: { orderId?: string; phone?: string };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 });
  }

  const phone = normalisePhone(input.phone ?? '');
  if (!input.orderId || !phone) {
    return NextResponse.json(
      { ok: false, message: 'Enter a Safaricom number like 0712 345 678.' },
      { status: 400 },
    );
  }

  const begun = await supabase.rpc('rpc_payment_begin_order', { p_order_id: input.orderId });
  if (begun.error) {
    return NextResponse.json(
      { ok: false, message: begun.error.message.replace(/^.*?:\s*/, '') },
      { status: 400 },
    );
  }
  const payment = begun.data as { reference: string; amount_cents: number };

  /* The order number, without dashes, names the payment in the customer's
     M-Pesa SMS. It is also the Paybill account number for this order, so a
     Paybill report of the same money finds the order. */
  const { data: placed } = await supabase
    .from('order')
    .select('reference')
    .eq('id', input.orderId)
    .maybeSingle();
  const accountReference = placed?.reference
    ? placed.reference
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 12)
    : undefined;

  /* Where Safaricom calls back: the address that answers without a redirect. */
  const origin = callbackOrigin(request);
  const sent = await sendMpesaPrompt({
    supabase,
    reference: payment.reference,
    accountReference,
    amountCents: payment.amount_cents,
    phone,
    origin,
    description: 'NexG order',
    notReadyMessage:
      'M-Pesa is not connected yet. Your order is saved and the amount owed is recorded.',
  });

  if (!sent.ok) {
    /* The reference travels with every failure, so the page can always go
       to /pay/<reference>, where the guest can see the state and try again. */
    return NextResponse.json(
      {
        ok: false,
        reference: payment.reference,
        pending: sent.pending,
        waitSeconds: sent.waitSeconds,
        message: sent.message,
      },
      { status: sent.status },
    );
  }
  return NextResponse.json({ ok: true, reference: payment.reference, message: sent.message });
}
