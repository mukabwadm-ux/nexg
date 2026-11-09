import { NextResponse } from 'next/server';

import { darajaConfigured, normalisePhone, stkPush } from '@/lib/daraja';
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

  const callbackSecret = process.env.DARAJA_CALLBACK_SECRET?.trim() ?? '';
  const callbackReady =
    darajaConfigured() &&
    (await supabase.rpc('rpc_payment_mpesa_ready', { p_callback_secret: callbackSecret })).data;
  if (!callbackReady) {
    return NextResponse.json(
      {
        ok: false,
        pending: true,
        reference: payment.reference,
        message:
          'M-Pesa payments are not switched on yet. Your dates are held; send us an enquiry and we will finish the booking with you.',
      },
      { status: 503 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? new URL(request.url).origin;

  const sent = await stkPush({
    phone,
    amountCents: payment.amount_cents,
    reference: payment.reference,
    callbackUrl: `${origin}/api/payments/mpesa/callback?token=${encodeURIComponent(callbackSecret)}`,
    description: 'NexG stay',
  });
  if (!sent.ok || !sent.checkoutRequestId) {
    return NextResponse.json({ ok: false, message: sent.message }, { status: 502 });
  }

  const back = await supabase.rpc('rpc_payment_mpesa_sent', {
    p_reference: payment.reference,
    p_checkout_request_id: sent.checkoutRequestId,
    p_merchant_request_id: sent.merchantRequestId ?? '',
    p_phone: phone,
    p_callback_secret: callbackSecret,
  });
  if (back.error) {
    return NextResponse.json(
      { ok: false, message: `Prompt sent but not recorded: ${back.error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    reference: payment.reference,
    expiresAt: payment.expires_at,
    message: sent.message,
  });
}
