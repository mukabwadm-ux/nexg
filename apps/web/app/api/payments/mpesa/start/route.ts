import { NextResponse } from 'next/server';

import { darajaConfigured, normalisePhone, stkPush } from '@/lib/daraja';
import { createClient } from '@/lib/supabase/server';

/** Sends the M-Pesa PIN prompt for an order. The amount comes from the database, never the client. */
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

  if (!darajaConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        pending: true,
        reference: payment.reference,
        message: 'M-Pesa is not connected yet. Your order is saved and the amount owed is recorded.',
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
    callbackUrl: `${origin}/api/payments/mpesa/callback?token=${encodeURIComponent(
      process.env.DARAJA_CALLBACK_SECRET ?? '',
    )}`,
    description: 'NexG order',
  });
  if (!sent.ok || !sent.checkoutRequestId) {
    return NextResponse.json({ ok: false, message: sent.message }, { status: 502 });
  }

  const back = (await supabase.rpc(
    'rpc_payment_mpesa_sent' as never,
    {
      p_reference: payment.reference,
      p_checkout_request_id: sent.checkoutRequestId,
      p_merchant_request_id: sent.merchantRequestId ?? null,
      p_phone: phone,
    } as never,
  )) as unknown as { error: { message: string } | null };
  if (back.error) {
    return NextResponse.json(
      { ok: false, message: `Prompt sent but not recorded: ${back.error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, reference: payment.reference, message: sent.message });
}
