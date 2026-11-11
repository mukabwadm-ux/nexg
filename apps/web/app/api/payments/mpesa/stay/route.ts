import { NextResponse } from 'next/server';

import { callbackOrigin, normalisePhone } from '@/lib/daraja';
import { sendMpesaPrompt } from '@/lib/mpesa-prompt';
import { createClient } from '@/lib/supabase/server';

/**
 * Sends the M-Pesa PIN prompt for a held stay. The amount comes from the hold
 * in the database, never the client. The callback is the same one orders use:
 * it finds the payment by M-Pesa's CheckoutRequestID, and settling a stay
 * payment confirms the stay in the database.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Sign in first.' }, { status: 401 });

  let input: { stayId?: string; phone?: string };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 });
  }

  const phone = normalisePhone(input.phone ?? '');
  if (!input.stayId || !phone) {
    return NextResponse.json(
      { ok: false, message: 'Enter a Safaricom number like 0712 345 678.' },
      { status: 400 },
    );
  }

  const begun = await supabase.rpc('rpc_payment_begin_stay', { p_stay_id: input.stayId });
  if (begun.error) {
    return NextResponse.json(
      { ok: false, message: begun.error.message.replace(/^.*?:\s*(?=[A-Z])/, '') },
      { status: 400 },
    );
  }
  const payment = begun.data as { reference: string; amount_cents: number; expires_at: string };

  /* Where Safaricom calls back: the address that answers without a redirect. */
  const origin = callbackOrigin(request);
  const sent = await sendMpesaPrompt({
    supabase,
    reference: payment.reference,
    amountCents: payment.amount_cents,
    phone,
    origin,
    description: 'NexG stay',
    notReadyMessage:
      'M-Pesa payments are not switched on yet. Your dates are held; send us an enquiry and we will finish the booking with you.',
  });
  if (!sent.ok) {
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

  return NextResponse.json({
    ok: true,
    reference: payment.reference,
    expiresAt: payment.expires_at,
    message: sent.message,
  });
}
