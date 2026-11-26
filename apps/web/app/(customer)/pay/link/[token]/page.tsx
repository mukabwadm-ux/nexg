import { Check, CircleSlash, Clock, Search, Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type * as React from 'react';

import { AutoRefresh } from '@/components/pay/auto-refresh';
import { PayLinkForm } from '@/components/pay/pay-link-form';
import {
  ActionRow,
  OrderProgress,
  PaymentStatusLayout,
  PaymentSummary,
} from '@/components/pay/payment-status';
import { SiteHeader } from '@/components/site-header';
import { checkPendingCard, clientKey, readPayLink, type PayLinkView } from '@/lib/pay-link';
import { offers } from '@/lib/payment-methods';

export const metadata: Metadata = {
  title: 'Pay for your order',
  robots: { index: false, follow: false },
  /* The token is in the address: never send it on to another site. */
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const kes = (cents: number | undefined) =>
  `KES ${Math.round((cents ?? 0) / 100).toLocaleString('en-KE')}`;

/**
 * A concierge order's pay link (lib/pay-link.ts). No sign-in: the token in the
 * address is checked by the database, which shows this order and nothing
 * else. Like /pay/{reference}, this page reports and never decides: only the
 * provider's verified answer marks the order paid.
 */
export default async function PayLinkPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const client = clientKey(headers());
  let view = await readPayLink(token, client);

  if (view && !('tooMany' in view) && view.state === 'open' && (await checkPendingCard(view))) {
    view = (await readPayLink(token, client)) ?? view;
  }

  if (!view) {
    return (
      <Frame
        tone="neutral"
        icon={Clock}
        title="We could not load this order"
        message="Something on our side did not answer. Refresh the page in a moment; nothing has been charged."
      />
    );
  }
  if ('tooMany' in view) {
    return (
      <Frame
        tone="neutral"
        icon={Clock}
        title="Too many tries"
        message="Wait a few minutes, then open the link from your message again."
      />
    );
  }
  if (view.state === 'not_found') {
    return (
      <Frame
        tone="neutral"
        icon={Search}
        title="We cannot find this pay link"
        message="Check that you opened the whole link from your SMS or email. If it still does not open, ask NexG Concierge to send it again."
      />
    );
  }

  const summary = <Summary view={view} />;

  if (view.state === 'paid') {
    return (
      <Frame
        tone="success"
        icon={Check}
        title="Paid. Thank you"
        message={`${kes(view.total_cents)} is paid. ${view.merchant ?? 'The merchant'} has your order and is getting it ready.`}
        aside={summary}
      >
        <Progress paid />
      </Frame>
    );
  }
  if (view.state === 'cancelled') {
    return (
      <Frame
        tone="neutral"
        icon={CircleSlash}
        title="This order was cancelled"
        message="Nothing is owed for it. Ask NexG Concierge if you would still like it."
        aside={summary}
      />
    );
  }
  if (view.state === 'expired') {
    return (
      <Frame
        tone="neutral"
        icon={Clock}
        title="This pay link has expired"
        message="It was not paid within 24 hours, so the order will not go ahead and nothing is owed. Ask NexG Concierge if you would still like it."
        aside={summary}
      />
    );
  }
  if (view.state === 'replaced') {
    return (
      <Frame
        tone="neutral"
        icon={Clock}
        title="A newer link was sent"
        message="NexG Concierge sent you a newer link for this order. Open the latest SMS or email to pay."
        aside={summary}
      />
    );
  }

  const payment = view.payment ?? { status: 'unpaid' as const };
  const pending = payment.status === 'pending';
  const card = pending && payment.channel === 'card';
  return (
    <>
      {pending && <AutoRefresh seconds={5} />}
      <Frame
        tone={payment.status === 'failed' ? 'failed' : 'waiting'}
        icon={Smartphone}
        title={
          card
            ? 'Confirming your card payment'
            : pending
              ? 'Check your phone'
              : payment.status === 'failed'
                ? 'That payment did not go through'
                : 'Pay for your order'
        }
        message={
          card
            ? `${kes(view.total_cents)} is being confirmed. This page updates by itself.`
            : pending
              ? `We sent an M-Pesa prompt for ${kes(view.total_cents)}. Enter your PIN to pay; this page updates by itself.`
              : payment.status === 'failed'
                ? 'Nothing was charged. Try again below.'
                : `${view.guest_name ? `Hi ${view.guest_name}, ` : ''}NexG Concierge ordered this for you from ${view.merchant ?? 'a NexG merchant'}. The merchant starts once it is paid. If you do not pay, nothing is owed.`
        }
        aside={summary}
      >
        <Progress />
        {card && payment.authorization_url ? (
          <ActionRow
            actions={[
              {
                label: 'Continue to card payment',
                href: payment.authorization_url,
                external: true,
              },
            ]}
          />
        ) : (
          <PayLinkForm
            token={token}
            mpesa={offers('mpesa_stk')}
            card={offers('card')}
            waiting={pending}
          />
        )}
      </Frame>
    </>
  );
}

function Frame(props: React.ComponentProps<typeof PaymentStatusLayout>) {
  return (
    <>
      <SiteHeader />
      <PaymentStatusLayout {...props} />
    </>
  );
}

function Progress({ paid = false }: { paid?: boolean }) {
  return (
    <OrderProgress
      steps={[
        { label: 'Ordered by NexG Concierge', state: 'done' },
        { label: 'Payment', state: paid ? 'done' : 'current' },
        { label: 'Being prepared', state: paid ? 'current' : 'todo' },
        { label: 'Delivered to your stay', state: 'todo' },
      ]}
    />
  );
}

function Summary({ view }: { view: PayLinkView }) {
  return (
    <PaymentSummary
      amount={kes(view.total_cents)}
      reference={view.reference ?? '—'}
      referenceLabel="Order"
      heading="Your order"
      rows={[
        ...(view.merchant ? [{ label: 'From', value: view.merchant }] : []),
        ...(view.items ?? []).map((i) => ({
          label: `${i.quantity} × ${i.name}`,
          value: kes(i.line_total_cents),
        })),
        ...(view.fees_cents ? [{ label: 'Delivery and fees', value: kes(view.fees_cents) }] : []),
        ...(view.deliver_to ? [{ label: 'Deliver to', value: view.deliver_to }] : []),
      ]}
    />
  );
}
