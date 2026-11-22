import Link from 'next/link';

import {
  comingUp,
  kes,
  liveOrder,
  loadCustomerActivity,
  orderAgain,
  unpaidOrders,
  type CustomerActivity,
} from '@/lib/customer-activity';

const STAGES = ['placed', 'confirmed', 'preparing', 'picked_up', 'arriving', 'delivered'];
const STAGE_LABEL: Record<string, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  picked_up: 'Picked up',
  arriving: 'Arriving',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  disputed: 'Reported',
  refunded: 'Refunded',
};
const panel = 'border-border rounded-2xl border bg-white p-5';
const pill = 'rounded-full px-2.5 py-0.5 text-[0.75rem] font-extrabold';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-KE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'Africa/Nairobi',
      })
    : '—';

const merchantName = (a: CustomerActivity, id: string | null) =>
  (id && a.merchants.get(id)?.trading_name) || 'NexG order';

/**
 * My account's Home (owner, 20 Nov 2026): what is happening now, what needs the customer, what is
 * coming up, and their recent orders. Opened from the account button at the top right; the other
 * tabs (receipts, orders, bookings, stays, jobs) stay as they were.
 */
export async function AccountHome() {
  const activity = await loadCustomerActivity();
  if (!activity) return null;

  const live = liveOrder(activity.orders);
  const unpaid = unpaidOrders(activity.orders);
  const unrated = activity.orders.filter((o) => o.stage === 'delivered').slice(0, 1);
  const ahead = comingUp(activity).slice(0, 4);
  const recent = activity.orders.filter((o) => !unpaid.includes(o)).slice(0, 5);
  const again = new Set(orderAgain(activity, 10).map((e) => e.merchant.id));
  const step = live
    ? Math.max(STAGES.indexOf(live.stage === 'ready' ? 'preparing' : live.stage), 0)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/discover"
          className="bg-gold text-ink inline-flex min-h-11 items-center rounded-full px-5 font-extrabold no-underline"
        >
          Order delivery
        </Link>
        <Link
          href="/discover?category=experiences"
          className="border-border-strong text-ink inline-flex min-h-11 items-center rounded-full border bg-white px-5 font-bold no-underline"
        >
          Book something
        </Link>
        <Link
          href="/ask"
          className="border-border-strong text-ink inline-flex min-h-11 items-center rounded-full border bg-white px-5 font-bold no-underline"
        >
          Ask a concierge
        </Link>
      </div>

      {live && (
        <section
          aria-labelledby="live-order"
          className="bg-ink flex flex-col gap-4 rounded-2xl p-5 text-white"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`${pill} bg-gold text-ink`}>
              {STAGE_LABEL[live.stage] ?? live.stage}
            </span>
            <span className="text-[0.8125rem] text-white/70">{live.reference}</span>
          </div>
          <h2 id="live-order" className="text-[1.375rem] font-extrabold">
            {merchantName(activity, live.merchant_id)}
          </h2>
          <ol
            className="grid grid-cols-6 gap-1.5"
            aria-label={`Step ${step + 1} of ${STAGES.length}`}
          >
            {STAGES.map((s, i) => (
              <li key={s} className="flex flex-col gap-1.5">
                <span className={`h-1.5 rounded-full ${i <= step ? 'bg-gold' : 'bg-white/20'}`} />
                <span
                  className={`text-[0.6875rem] ${i === step ? 'font-extrabold text-white' : 'text-white/60'}`}
                >
                  {STAGE_LABEL[s]}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/account/orders/${live.id}`}
              className="bg-gold text-ink inline-flex min-h-11 items-center rounded-full px-5 font-extrabold no-underline"
            >
              Track order
            </Link>
            <span className="inline-flex min-h-11 items-center text-sm text-white/80">
              {kes(live.total_cents)}
            </span>
          </div>
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section aria-labelledby="needs-you" className={`${panel} flex flex-col gap-3`}>
          <h2 id="needs-you" className="text-lg font-extrabold">
            Needs you
          </h2>
          {unpaid.length === 0 && unrated.length === 0 && (
            <p className="text-muted text-sm">Nothing waiting on you.</p>
          )}
          {unpaid.slice(0, 3).map((o) => (
            <div key={o.id} className="flex items-start gap-3 rounded-xl bg-[#fdecea] p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  Payment not finished · {merchantName(activity, o.merchant_id)}
                </p>
                <p className="text-muted text-[0.8125rem]">
                  {kes(o.total_cents)} · {o.reference}
                </p>
              </div>
              <Link
                href={`/pay/${o.reference}`}
                className="bg-ink inline-flex min-h-11 shrink-0 items-center rounded-full px-4 font-bold text-white no-underline"
              >
                Pay
              </Link>
            </div>
          ))}
          {unrated.map((o) => (
            <div key={o.id} className="flex items-start gap-3 rounded-xl bg-[#f6f3ec] p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">How was {merchantName(activity, o.merchant_id)}?</p>
                <p className="text-muted text-[0.8125rem]">
                  Delivered {date(o.placed_at)}. Your rating helps the next guest.
                </p>
              </div>
              <Link
                href={`/account/orders/${o.id}#rate`}
                className="border-border-strong text-ink inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 font-bold no-underline"
              >
                Rate
              </Link>
            </div>
          ))}
        </section>

        <section aria-labelledby="coming-up" className={`${panel} flex flex-col gap-1`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="coming-up" className="text-lg font-extrabold">
              Coming up
            </h2>
            <Link href="/account?tab=bookings" className="text-sm font-bold">
              All bookings
            </Link>
          </div>
          {ahead.length === 0 && <p className="text-muted text-sm">No bookings or stays ahead.</p>}
          {ahead.map((item) =>
            item.kind === 'booking' ? (
              <div
                key={item.booking.id}
                className="border-border flex items-center gap-3 border-b py-2.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {item.booking.resource_name}
                    {item.booking.merchant_name ? ` · ${item.booking.merchant_name}` : ''}
                  </p>
                  <p className="text-muted text-[0.8125rem]">{dateTime(item.booking.starts_at)}</p>
                </div>
                <span
                  className={`${pill} ${item.booking.status === 'confirmed' ? 'bg-success-bg text-success' : 'bg-gold-soft text-gold-text'}`}
                >
                  {item.booking.status === 'confirmed' ? 'Confirmed' : 'Waiting'}
                </span>
              </div>
            ) : (
              <div
                key={item.stay.id}
                className="border-border flex items-center gap-3 border-b py-2.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">Stay</p>
                  <p className="text-muted text-[0.8125rem]">
                    {date(item.stay.check_in)} to {date(item.stay.check_out)}
                  </p>
                </div>
                <span className={`${pill} bg-gold-soft text-gold-text`}>
                  {item.stay.status === 'held' ? 'Held' : 'Booked'}
                </span>
              </div>
            ),
          )}
        </section>
      </div>

      <section aria-labelledby="recent-orders" className={panel}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="recent-orders" className="text-lg font-extrabold">
            Recent orders
          </h2>
          <Link href="/account?tab=orders" className="text-sm font-bold">
            All orders
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-muted text-sm">
            No orders yet.{' '}
            <Link href="/discover" className="font-bold">
              Find something on Discovery
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="text-muted text-left text-[0.6875rem] uppercase tracking-[0.06em]">
                  <th className="border-border border-b py-2 pr-2">Order</th>
                  <th className="border-border border-b py-2 pr-2">From</th>
                  <th className="border-border border-b py-2 pr-2">Status</th>
                  <th className="border-border border-b py-2 pr-2 text-right">Total</th>
                  <th className="border-border border-b py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="border-border border-b py-2.5 pr-2">
                      <Link href={`/account/orders/${o.id}`} className="font-bold">
                        {o.reference}
                      </Link>
                      <br />
                      <span className="text-muted text-[0.75rem]">{date(o.placed_at)}</span>
                    </td>
                    <td className="border-border border-b py-2.5 pr-2 font-bold">
                      {merchantName(activity, o.merchant_id)}
                    </td>
                    <td className="border-border border-b py-2.5 pr-2">
                      {STAGE_LABEL[o.stage] ?? o.stage}
                    </td>
                    <td className="border-border border-b py-2.5 pr-2 text-right font-bold">
                      {kes(o.total_cents)}
                    </td>
                    <td className="border-border border-b py-2.5 text-right">
                      {o.merchant_id && again.has(o.merchant_id) ? (
                        <a href={`/discover?merchant=${o.merchant_id}`} className="font-bold">
                          Order again
                        </a>
                      ) : (
                        <Link href={`/account/orders/${o.id}`} className="font-bold">
                          Details
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className={`${panel} bg-gold-soft flex flex-wrap items-center justify-between gap-3`}
      >
        <div>
          <h2 className="text-base font-extrabold">Something wrong with an order?</h2>
          <p className="text-muted text-sm">
            Open the order and report it. We sort it out with the business.
          </p>
        </div>
        <Link
          href="/help"
          className="bg-ink inline-flex min-h-11 items-center rounded-full px-5 font-bold text-white no-underline"
        >
          Get help
        </Link>
      </section>
    </div>
  );
}
