import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { OrderActions } from '@/components/account/order-actions';
import { OrderLive } from '@/components/account/order-live';
import { SiteHeader } from '@/components/site-header';
import { kes } from '@/lib/customer-activity';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  placed: 'Placed',
  confirmed: 'Accepted by the business',
  preparing: 'Being prepared',
  ready: 'Ready for pickup',
  picked_up: 'Picked up',
  arriving: 'Arriving',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  disputed: 'Reported',
  refunded: 'Refunded',
};

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });

/**
 * One order, for the customer who placed it (an account, or a guest's temporary session): what
 * was ordered, where it is, its timeline, and what they can do with it. Everything is read
 * through row-level security, so a stranger's order id shows "not found".
 */
export default async function OrderPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/account/orders/${params.id}`)}`);

  const { data: order } = await supabase
    .from('order')
    .select(
      'id, reference, merchant_id, stage, payment_status, payment_method, subtotal_cents, delivery_fee_cents, service_fee_cents, small_basket_fee_cents, total_cents, placed_at, dropoff_label, scheduled_for',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!order) notFound();

  const [items, events, merchant, rating] = await Promise.all([
    supabase
      .from('order_item')
      .select('id, name, quantity, line_total_cents, variant_label, unit_label, removed_at')
      .eq('order_id', order.id),
    supabase.from('order_event').select('id, at, title, detail').eq('order_id', order.id).order('at', { ascending: false }).limit(30),
    order.merchant_id
      ? supabase.from('merchant_public').select('trading_name').eq('id', order.merchant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>)(
      'rpc_my_order_rating',
      { p_order_id: order.id },
    ),
  ]);

  const paid = ['paid', 'collected', 'partially_refunded', 'refunded'].includes(order.payment_status ?? '');
  const canCancel = order.stage === 'placed' && !paid;
  const rated = typeof rating.data === 'number' ? rating.data : null;
  const name = (merchant.data as { trading_name: string } | null)?.trading_name ?? 'Your order';

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-[56rem] flex-col gap-5 px-4 pb-16 pt-8 sm:px-8">
        <Link href={user.is_anonymous ? '/discover' : '/account?tab=orders'} className="text-sm font-bold">
          {user.is_anonymous ? 'Back to Discovery' : 'All orders'}
        </Link>
        <div>
          <p className="text-muted text-[0.8125rem] font-bold">
            {order.reference} · placed {order.placed_at ? time(order.placed_at) : '—'}
          </p>
          <h1 className="mt-1 text-[1.75rem] font-extrabold tracking-[-0.02em]">{name}</h1>
          <p className="mt-1 font-bold">{STAGE_LABEL[order.stage] ?? order.stage}</p>
          {order.scheduled_for && (
            <p className="text-muted text-sm">Collection: {time(order.scheduled_for)}</p>
          )}
        </div>

        {order.stage === 'placed' && !paid && order.payment_method !== 'cash_on_delivery' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fdecea] p-4">
            <p className="font-bold">Not paid yet. The business starts once you pay.</p>
            <Link href={`/pay/${order.reference}`} className="bg-ink inline-flex min-h-11 items-center rounded-full px-5 font-bold text-white no-underline">
              Pay {kes(order.total_cents)}
            </Link>
          </div>
        )}

        <OrderLive orderId={order.id} stage={order.stage} />

        <section aria-labelledby="items" className="border-border rounded-2xl border bg-white p-5">
          <h2 id="items" className="text-lg font-extrabold">What you ordered</h2>
          <ul className="divide-border mt-2 divide-y">
            {((items.data ?? []) as { id: string; name: string; quantity: number; line_total_cents: number; variant_label: string | null; removed_at: string | null }[]).map((i) => (
              <li key={i.id} className={`flex justify-between gap-3 py-2.5 text-sm ${i.removed_at ? 'text-muted line-through' : ''}`}>
                <span>
                  {i.quantity} × {i.name}
                  {i.variant_label ? ` · ${i.variant_label}` : ''}
                </span>
                <span className="font-bold">{kes(i.line_total_cents)}</span>
              </li>
            ))}
          </ul>
          <dl className="border-border mt-2 grid grid-cols-[1fr_auto] gap-y-1 border-t pt-3 text-sm">
            <dt className="text-muted">Items</dt><dd>{kes(order.subtotal_cents)}</dd>
            <dt className="text-muted">Delivery</dt><dd>{kes(order.delivery_fee_cents)}</dd>
            <dt className="text-muted">Service fee</dt><dd>{kes(order.service_fee_cents + order.small_basket_fee_cents)}</dd>
            <dt className="font-extrabold">Total</dt><dd className="font-extrabold">{kes(order.total_cents)}</dd>
          </dl>
          {order.dropoff_label && <p className="text-muted mt-3 text-sm">Delivering to {order.dropoff_label}</p>}
        </section>

        <OrderActions
          orderId={order.id}
          reference={order.reference}
          canCancel={canCancel}
          canRate={order.stage === 'delivered' && rated === null}
          rated={rated}
        />

        <section aria-labelledby="timeline" className="border-border rounded-2xl border bg-white p-5">
          <h2 id="timeline" className="text-lg font-extrabold">Timeline</h2>
          <ol className="mt-2 flex flex-col gap-3">
            {((events.data ?? []) as { id: number; at: string; title: string; detail: string | null }[]).map((e) => (
              <li key={e.id} className="text-sm">
                <p className="font-bold">{e.title}</p>
                <p className="text-muted">{time(e.at)}{e.detail ? ` · ${e.detail}` : ''}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
