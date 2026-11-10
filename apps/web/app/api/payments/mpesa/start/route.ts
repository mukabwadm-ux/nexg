import { NextResponse } from 'next/server';

import { normalisePhone } from '@/lib/daraja';
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

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? new URL(request.url).origin;
  const sent = await sendMpesaPrompt({
    supabase,
    reference: payment.reference,
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
