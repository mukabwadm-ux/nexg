import { NextResponse } from 'next/server';

import { callbackOrigin, callbackSecretValid, registerPaybillUrls } from '@/lib/daraja';
import { settleDuePrompts } from '@/lib/mpesa-prompt';
import { sendQueuedPayouts } from '@/lib/mpesa-payout';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';
/* A sweep asks Safaricom about a handful of prompts and refunds, a second or two each. */
export const maxDuration = 60;

/**
 * The payments worker. The database calls it (pg_cron through pg_net, every
 * minute there is something to do, and at once when staff press "Check with
 * M-Pesa", "Send by M-Pesa" or "Connect Paybill"), with the Daraja token in
 * a header. It is the only place outside a guest's request that talks to
 * Safaricom, because the Daraja keys live only in this app's environment.
 *
 * - Asks M-Pesa about prompts with no answer yet, so a payment settles even
 *   when the guest closed the page and Safaricom's callback never arrived.
 * - Sends refunds Finance has queued to go back by M-Pesa.
 * - Registers the Paybill confirmation address, when asked to.
 */
export async function POST(request: Request) {
  if (!callbackSecretValid(request.headers.get('x-payments-secret'))) {
    return NextResponse.json({ ok: false, message: 'Not allowed.' }, { status: 401 });
  }

  let input: { reference?: unknown; action?: unknown } = {};
  try {
    input = (await request.json()) as typeof input;
  } catch {
    /* An empty body is a plain sweep. */
  }
  const origin = callbackOrigin(request);

  if (input.action === 'register_paybill') {
    const secret = encodeURIComponent(process.env.DARAJA_CALLBACK_SECRET?.trim() ?? '');
    const registered = await registerPaybillUrls({
      confirmationUrl: `${origin}/api/payments/daraja/paybill/confirm?token=${secret}`,
      validationUrl: `${origin}/api/payments/daraja/paybill/validate?token=${secret}`,
    });
    const { error } = await (
      createPublicClient().rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ error: { message: string } | null }>
    )('rpc_payment_mpesa_paybill_registered', {
      p_callback_secret: process.env.DARAJA_CALLBACK_SECRET?.trim() ?? '',
      p_ok: registered.ok,
      p_message: registered.message.slice(0, 500),
    });
    return NextResponse.json({ ok: registered.ok && !error, message: registered.message });
  }

  const reference =
    typeof input.reference === 'string' && input.reference.length <= 64
      ? input.reference
      : undefined;
  const prompts = await settleDuePrompts({ reference });
  /* Staff checking one payment want an answer about that payment, not a refund run. */
  const payouts = reference ? null : await sendQueuedPayouts(origin);
  return NextResponse.json({ ok: true, prompts, payouts });
}
