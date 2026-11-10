import type { Metadata } from 'next';
import Link from 'next/link';

import { AutoRefresh } from '@/components/pay/auto-refresh';
import { RetryPayment } from '@/components/pay/retry-payment';
import { reconcileMpesaPrompts } from '@/lib/mpesa-prompt';
import { paystackConfigured, verify } from '@/lib/paystack';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your payment',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Where Paystack sends somebody back to.
 *
 * This page reports; it does not decide. Anybody can reach this
 * URL — it is a plain GET with a reference in it — so nothing here
 * marks anything as paid. The webhook does that, and this reads
 * what the database already believes.
 *
 * It does ask the provider directly as well, because the webhook
 * and the redirect race and the webhook usually loses by a second
 * or two. Asking turns "we are checking" into "paid" a moment
 * sooner without anybody having to refresh — but even then, it is
 * the provider being asked, not the browser being believed.
 */
export default async function PaymentReturn({ params }: { params: { reference: string } }) {
  const supabase = createClient();

  const read = () =>
    supabase
      .from('payment')
      .select(
        'reference, state, amount_cents, currency, intent, order_id, paid_at, failure_reason, provider, payer_phone',
      )
      .eq('reference', params.reference)
      .maybeSingle();

  let payment = (await read()).data as Payment | null;

  /* Waiting on M-Pesa: a prompt with no answer after 45 seconds is asked
     about directly, in case Safaricom's callback never reached us. */
  if (payment?.state === 'authorised' && payment.provider === 'mpesa') {
    if (await reconcileMpesaPrompts(supabase, params.reference)) {
      payment = ((await read()).data as Payment | null) ?? payment;
    }
  }

  /* The order may have been paid through a later attempt, or cancelled. */
  const order = payment?.order_id
    ? ((
        await supabase
          .from('order')
          .select('payment_status, stage')
          .eq('id', payment.order_id)
          .maybeSingle()
      ).data as { payment_status: string; stage: string } | null)
    : null;
  const orderOpen =
    payment?.intent === 'order' &&
    !!payment.order_id &&
    !['paid', 'collected'].includes(order?.payment_status ?? '') &&
    !['cancelled', 'refunded'].includes(order?.stage ?? '');

  /* Not ours, or not theirs to see. The same answer either way —
     a page that distinguished them would confirm which references
     exist. */
  if (!payment) {
    return (
      <Shell title="We cannot find that payment.">
        <p>
          The reference may be mistyped, or it may belong to somebody else. If you have paid and
          this is wrong, keep the message from your bank and talk to us — nothing is lost.
        </p>
      </Shell>
    );
  }

  /* Still pending and a provider is connected: ask it rather than
     leaving somebody staring at "checking". */
  let settledNow = false;
  if (payment.state !== 'paid' && paystackConfigured()) {
    const asked = await verify(params.reference);
    settledNow = asked.ok && asked.data?.status === 'success';
  }

  const paid = payment.state === 'paid' || settledNow;
  const amount = `KES ${Math.round(payment.amount_cents / 100).toLocaleString('en-KE')}`;

  if (paid) {
    return (
      <Shell title="Paid.">
        <p>
          {amount} received.{' '}
          {payment.intent === 'order'
            ? 'Your order is confirmed and on its way through the kitchen.'
            : 'Your featured slot is booked and goes live on its Monday.'}
        </p>
        <p className="text-muted-light mt-3 text-[0.8125rem] font-semibold">
          Reference {payment.reference}. Keep it if you need to ask us anything about this payment.
        </p>
        {payment.intent === 'featured_slot' ? (
          <Link
            href="/merchant/featured"
            className="bg-ink mt-5 inline-block rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold text-white"
          >
            Back to your slots
          </Link>
        ) : (
          <Link
            href="/account?tab=receipts"
            className="bg-ink mt-5 inline-block rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold text-white"
          >
            See your receipt
          </Link>
        )}
      </Shell>
    );
  }

  if (payment.state === 'failed') {
    if (
      payment.intent === 'order' &&
      order &&
      ['paid', 'collected'].includes(order.payment_status)
    ) {
      return (
        <Shell title="This order is paid.">
          <p>This attempt did not go through, but a later one did. Nothing more to pay.</p>
          <Link
            href="/account?tab=orders"
            className="bg-ink mt-5 inline-block rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold text-white"
          >
            See your orders
          </Link>
        </Shell>
      );
    }
    return (
      <Shell title="That did not go through.">
        <p>{payment.failure_reason ?? 'The payment was not completed. Nothing was charged.'}</p>
        <p className="text-muted-light mt-3 text-[0.8125rem] font-semibold">
          Nothing was taken for this attempt. Your order is saved and the amount owed has not
          changed.
        </p>
        {orderOpen && (
          <RetryPayment
            orderId={payment.order_id!}
            mode="failed"
            defaultPhone={localPhone(payment.payer_phone)}
          />
        )}
      </Shell>
    );
  }

  return (
    <Shell title="Waiting for your payment.">
      <AutoRefresh seconds={5} />
      <p>
        {amount} is being confirmed. If you were sent an M-Pesa prompt, enter your PIN on your phone
        — this page updates by itself.
      </p>
      <p className="text-muted-light mt-3 text-[0.8125rem] font-semibold">
        Reference {payment.reference}. If money has left your account and this has not changed
        within a few minutes, send us that reference and we will find it.
      </p>
      {orderOpen && (
        <RetryPayment
          orderId={payment.order_id!}
          mode="waiting"
          defaultPhone={localPhone(payment.payer_phone)}
        />
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-items-center px-4">
      <div className="border-border bg-surface w-full rounded-2xl border p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <div className="text-muted mt-3 text-[0.9375rem] font-semibold leading-[1.7]">
          {children}
        </div>
      </div>
    </main>
  );
}

/** 254712345678 → 0712345678, for the resend form. */
function localPhone(phone: string | null): string | null {
  return phone && /^254\d{9}$/.test(phone) ? `0${phone.slice(3)}` : phone;
}

interface Payment {
  reference: string;
  state: string;
  amount_cents: number;
  currency: string;
  intent: string;
  order_id: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  provider: string | null;
  payer_phone: string | null;
}
