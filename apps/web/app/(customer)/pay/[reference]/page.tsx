import { Check, CircleSlash, Landmark, Search, Smartphone, X } from 'lucide-react';
import type { Metadata } from 'next';

import { AutoRefresh } from '@/components/pay/auto-refresh';
import {
  ActionRow,
  OrderProgress,
  PaymentStatusLayout,
  PaymentSummary,
  type StepState,
} from '@/components/pay/payment-status';
import { RetryPayment } from '@/components/pay/retry-payment';
import { SiteHeader } from '@/components/site-header';
import { bankCheckoutEnabled } from '@/lib/bank';
import { reconcileBankPayment } from '@/lib/bank/payments';
import { reconcileMpesaPrompts } from '@/lib/mpesa-prompt';
import { failureCopy, failureKind, PROMPT_EXPIRES_AFTER_SECONDS } from '@/lib/payment-outcome';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your payment',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Where a guest lands after paying, or while paying.
 *
 * This page reports; it does not decide. Anybody can reach this URL (it is a
 * plain GET with a reference in it), so nothing here marks anything as paid.
 * The provider's verified event does that, and this reads what the database
 * already believes.
 *
 * It does ask the provider directly as well, because the webhook and the
 * redirect race and the webhook usually loses by a second or two. Asking
 * turns "we are checking" into "paid" sooner, but it is the provider being
 * asked, not the browser being believed.
 *
 * When a payment is cancelled, declined, or never answered, the page says
 * what happened in plain words and offers a way to pay again.
 */
export default async function PaymentReturn({ params }: { params: { reference: string } }) {
  const supabase = createClient();

  const read = () =>
    supabase
      .from('payment')
      .select(
        'reference, state, amount_cents, currency, intent, order_id, paid_at, failure_reason, provider, provider_ref, authorization_url, payer_phone, authorised_at',
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

  /* Waiting on a bank: ask it for its latest signed answer, in case the
     webhook is late. */
  if (payment?.state === 'authorised' && payment.provider?.startsWith('bank_')) {
    if (await reconcileBankPayment(payment)) {
      payment = ((await read()).data as Payment | null) ?? payment;
    }
  }

  const bankEnabled = bankCheckoutEnabled();

  /* Pay-on-delivery orders have no payment yet: checkout sends the guest here
     with the order reference. Row security only returns the guest's own. */
  if (!payment) {
    const placed = (
      await supabase
        .from('order')
        .select('id, reference, payment_status, payment_method, stage, total_cents, merchant_id')
        .eq('reference', params.reference)
        .maybeSingle()
    ).data as PlacedOrder | null;
    if (placed) {
      const merchant = placed.merchant_id
        ? ((
            await supabase
              .from('merchant_public')
              .select('trading_name')
              .eq('id', placed.merchant_id)
              .maybeSingle()
          ).data?.trading_name ?? null)
        : null;
      const total = `KES ${Math.round(placed.total_cents / 100).toLocaleString('en-KE')}`;
      const onDelivery = placed.payment_method === 'cash_on_delivery';
      const paid = ['paid', 'collected'].includes(placed.payment_status);
      const open = !paid && !['cancelled', 'refunded'].includes(placed.stage);
      return (
        <>
          <SiteHeader />
          <PaymentStatusLayout
            tone={onDelivery || paid ? 'success' : 'waiting'}
            icon={onDelivery || paid ? Check : Smartphone}
            title={
              paid
                ? 'This order is paid'
                : onDelivery
                  ? 'Order placed'
                  : 'Finish paying for your order'
            }
            message={
              paid
                ? 'Nothing more to pay.'
                : onDelivery
                  ? `${merchant ?? 'The merchant'} has your order. Pay the rider ${total} in cash when it arrives.`
                  : `Your order is saved and ${total} is still to pay.`
            }
            aside={
              <PaymentSummary
                amount={total}
                reference={placed.reference}
                referenceLabel="Order"
                heading="Your order"
                rows={[
                  { label: 'Method', value: METHOD_LABEL[placed.payment_method] ?? '—' },
                  ...(merchant ? [{ label: 'From', value: merchant }] : []),
                ]}
              />
            }
          >
            <OrderProgress
              steps={
                onDelivery
                  ? [
                      { label: 'Order placed', state: 'done' },
                      { label: 'Being prepared', state: 'current' },
                      { label: 'Delivered', state: 'todo' },
                      { label: 'Paid to the rider', state: paid ? 'done' : 'todo' },
                    ]
                  : [
                      { label: 'Order placed', state: 'done' },
                      { label: 'Payment', state: paid ? 'done' : 'current' },
                      { label: 'Being prepared', state: paid ? 'current' : 'todo' },
                      { label: 'Delivered', state: 'todo' },
                    ]
              }
            />
            {onDelivery || !open ? (
              <ActionRow
                actions={[
                  { label: 'Your orders', href: '/account?tab=orders' },
                  { label: 'Back to Explore', href: '/explore', kind: 'secondary' },
                ]}
              />
            ) : (
              <RetryPayment orderId={placed.id} mode="start" bankEnabled={bankEnabled} />
            )}
          </PaymentStatusLayout>
        </>
      );
    }
  }

  /* Not ours, or not theirs to see. The same answer either way: a page that
     distinguished them would confirm which references exist. */
  if (!payment) {
    return (
      <>
        <SiteHeader />
        <PaymentStatusLayout
          tone="neutral"
          icon={Search}
          title="We cannot find that payment"
          message="The reference may be mistyped, or it may belong to somebody else. If you have paid and this is wrong, keep the message from your bank or M-Pesa and talk to us: nothing is lost."
        >
          <ActionRow
            actions={[
              { label: 'Your orders', href: '/account?tab=orders' },
              { label: 'Back to Explore', href: '/explore', kind: 'secondary' },
            ]}
          />
        </PaymentStatusLayout>
      </>
    );
  }

  const order = payment.order_id
    ? ((
        await supabase
          .from('order')
          .select('reference, payment_status, payment_method, stage, merchant_id')
          .eq('id', payment.order_id)
          .maybeSingle()
      ).data as OrderRow | null)
    : null;
  const merchantName = order?.merchant_id
    ? ((
        await supabase
          .from('merchant_public')
          .select('trading_name')
          .eq('id', order.merchant_id)
          .maybeSingle()
      ).data?.trading_name ?? null)
    : null;
  const orderOpen =
    payment.intent === 'order' &&
    !!payment.order_id &&
    !['paid', 'collected'].includes(order?.payment_status ?? '') &&
    !['cancelled', 'refunded'].includes(order?.stage ?? '');

  const amount = `KES ${Math.round(payment.amount_cents / 100).toLocaleString('en-KE')}`;
  const phone = localPhone(payment.payer_phone);

  const summary = (
    <PaymentSummary
      amount={amount}
      reference={payment.reference}
      rows={[
        { label: 'Method', value: methodLabel(payment, order, phone) },
        ...(order?.reference ? [{ label: 'Order', value: order.reference }] : []),
        ...(merchantName ? [{ label: 'From', value: merchantName }] : []),
      ]}
    />
  );

  const progress = (paymentStep: StepState) =>
    payment.intent === 'order' ? (
      <OrderProgress
        steps={[
          { label: 'Order placed', state: 'done' },
          { label: 'Payment', state: paymentStep },
          { label: 'Being prepared', state: paymentStep === 'done' ? 'current' : 'todo' },
          { label: 'Delivered', state: 'todo' },
        ]}
      />
    ) : null;

  /* ─────────────────────────────────────────── paid */
  if (payment.state === 'paid') {
    return (
      <>
        <SiteHeader />
        <PaymentStatusLayout
          tone="success"
          icon={Check}
          title="Payment received"
          message={
            payment.intent === 'order'
              ? `${amount} is paid. ${merchantName ?? 'The merchant'} has your order and is getting it ready.`
              : `${amount} is paid. Your featured slot is booked and goes live on its Monday.`
          }
          aside={summary}
        >
          {progress('done')}
          <ActionRow
            actions={
              payment.intent === 'featured_slot'
                ? [{ label: 'Back to your slots', href: '/merchant/featured' }]
                : [
                    { label: 'See your receipt', href: '/account?tab=receipts' },
                    { label: 'Your orders', href: '/account?tab=orders', kind: 'secondary' },
                  ]
            }
          />
        </PaymentStatusLayout>
      </>
    );
  }

  /* ─────────────────────────────────────────── failed or cancelled */
  if (payment.state === 'failed') {
    if (
      payment.intent === 'order' &&
      order &&
      ['paid', 'collected'].includes(order.payment_status)
    ) {
      return (
        <>
          <SiteHeader />
          <PaymentStatusLayout
            tone="success"
            icon={Check}
            title="This order is paid"
            message="This attempt did not go through, but a later one did. Nothing more to pay."
            aside={summary}
          >
            {progress('done')}
            <ActionRow actions={[{ label: 'Your orders', href: '/account?tab=orders' }]} />
          </PaymentStatusLayout>
        </>
      );
    }

    const reason = payment.failure_reason;
    const kind = failureKind(reason);
    const copy = failureCopy(kind, amount);
    return (
      <>
        <SiteHeader />
        <PaymentStatusLayout
          tone="failed"
          icon={kind === 'cancelled' ? CircleSlash : X}
          title={copy.title}
          message={
            <>
              <p>{copy.message}</p>
              {reason && kind === 'unknown' && (
                <p className="text-muted mt-2 text-[0.8125rem]">The provider said: “{reason}”</p>
              )}
            </>
          }
          aside={summary}
        >
          {progress('failed')}
          {orderOpen && (
            <RetryPayment
              orderId={payment.order_id!}
              mode="failed"
              defaultPhone={phone}
              bankEnabled={bankEnabled}
            />
          )}
        </PaymentStatusLayout>
      </>
    );
  }

  /* ─────────────────────────────────────────── waiting on a bank */
  if (payment.provider?.startsWith('bank_')) {
    return (
      <>
        <SiteHeader />
        <AutoRefresh seconds={5} />
        <PaymentStatusLayout
          tone="waiting"
          icon={Landmark}
          title="Waiting for your bank"
          message={`${amount} is waiting for your approval at your bank. Approve it there and this page updates by itself.`}
          aside={summary}
        >
          {progress('current')}
          {payment.authorization_url && payment.state === 'authorised' && (
            <ActionRow
              actions={[
                { label: 'Continue at your bank', href: payment.authorization_url, external: true },
              ]}
            />
          )}
        </PaymentStatusLayout>
      </>
    );
  }

  /* ─────────────────────────────────────────── waiting on M-Pesa */
  if (payment.provider === 'mpesa' && payment.state === 'authorised') {
    const waited = payment.authorised_at
      ? (Date.now() - Date.parse(payment.authorised_at)) / 1000
      : 0;
    const unanswered = waited >= PROMPT_EXPIRES_AFTER_SECONDS;
    return (
      <>
        <SiteHeader />
        <AutoRefresh seconds={5} />
        <PaymentStatusLayout
          tone="waiting"
          icon={Smartphone}
          title={unanswered ? 'No answer from M-Pesa yet' : 'Check your phone'}
          message={
            unanswered
              ? 'If you cancelled the prompt or it timed out, nothing was charged: send a new one below. If you did enter your PIN, give it a moment; this page updates by itself.'
              : `We sent an M-Pesa prompt for ${amount}${phone ? ` to ${phone}` : ''}. Enter your PIN to pay; this page updates by itself.`
          }
          aside={summary}
        >
          {progress('current')}
          {orderOpen && (
            <RetryPayment
              key={unanswered ? 'expired' : 'waiting'}
              orderId={payment.order_id!}
              mode={unanswered ? 'expired' : 'waiting'}
              defaultPhone={phone}
              bankEnabled={bankEnabled}
            />
          )}
        </PaymentStatusLayout>
      </>
    );
  }

  /* ──────────── nothing sent yet (the prompt could not go out), or still
     being confirmed */
  const notStarted = payment.state === 'pending';
  return (
    <>
      <SiteHeader />
      <AutoRefresh seconds={5} />
      <PaymentStatusLayout
        tone="waiting"
        icon={Smartphone}
        title={notStarted ? 'Finish paying for your order' : 'Confirming your payment'}
        message={
          notStarted
            ? `Your order is saved and ${amount} is still to pay. Send an M-Pesa prompt to pay now.`
            : `${amount} is being confirmed. This page updates by itself.`
        }
        aside={summary}
      >
        {progress('current')}
        {orderOpen && notStarted && (
          <RetryPayment
            orderId={payment.order_id!}
            mode="start"
            defaultPhone={phone}
            bankEnabled={bankEnabled}
          />
        )}
      </PaymentStatusLayout>
    </>
  );
}

/** 254712345678 → 0712345678, for display and the resend form. */
function localPhone(phone: string | null): string | null {
  return phone && /^254\d{9}$/.test(phone) ? `0${phone.slice(3)}` : phone;
}

const METHOD_LABEL: Record<string, string> = {
  mpesa_stk: 'M-Pesa',
  card: 'Card',
  bank_transfer: 'Bank',
  cash_on_delivery: 'Pay on delivery',
};

/* A payment that was never sent to a provider still carries the default
   provider, so the order's chosen method says more. */
function methodLabel(payment: Payment, order: OrderRow | null, phone: string | null) {
  if (payment.provider === 'mpesa') return phone ? `M-Pesa · ${phone}` : 'M-Pesa';
  if (payment.provider?.startsWith('bank_')) return 'Bank';
  return (order && METHOD_LABEL[order.payment_method]) ?? '—';
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
  provider_ref: string | null;
  authorization_url: string | null;
  payer_phone: string | null;
  authorised_at: string | null;
}

interface OrderRow {
  reference: string;
  payment_status: string;
  payment_method: string;
  stage: string;
  merchant_id: string | null;
}

interface PlacedOrder extends OrderRow {
  id: string;
  total_cents: number;
}
