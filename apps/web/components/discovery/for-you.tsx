import Link from 'next/link';

import {
  comingUp,
  kes,
  liveOrder,
  loadCustomerActivity,
  loadSimilarMerchants,
  orderAgain,
  unpaidOrders,
} from '@/lib/customer-activity';

const card =
  'flex min-w-0 flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white no-underline transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold';
const why = 'text-[0.6875rem] font-extrabold uppercase tracking-[0.06em] text-gold';
const sub = 'text-[0.8125rem] leading-snug text-white/70';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
const day = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });

/**
 * Discovery's "For you" strip, for a returning customer (owner, 20 Nov 2026: "tailor the discovery
 * engine to give them what they would like based on their previous interaction").
 *
 * Built only from this customer's own orders, bookings and stays (lib/customer-activity), each
 * suggestion saying why it is there. A visitor who is signed out, or has no history yet, gets
 * nothing here and sees Discovery exactly as before.
 */
export async function ForYou() {
  const activity = await loadCustomerActivity().catch(() => null);
  if (!activity) return null;

  const live = liveOrder(activity.orders);
  const unpaid = unpaidOrders(activity.orders);
  const again = orderAgain(activity);
  const ahead = comingUp(activity).slice(0, 2);
  const lastBooking = activity.bookings.find((b) => b.status === 'completed');
  const similar = again.length ? await loadSimilarMerchants(activity).catch(() => []) : [];
  const favourite = again[0]?.merchant;

  const hasAnything =
    live || unpaid.length || again.length || ahead.length || lastBooking || similar.length;
  if (!hasAnything) return null;

  return (
    <section
      aria-labelledby="for-you"
      className="border-b border-white/10 bg-[#111315] px-4 pb-6 pt-5 text-white sm:px-[30px]"
    >
      <div className="mx-auto flex max-w-[120rem] flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="for-you" className="text-[1.5rem] font-extrabold tracking-[-0.02em]">
              {activity.name ? `Welcome back, ${activity.name}` : 'Welcome back'}
            </h2>
            <p className="text-sm text-white/70">Picked from your own orders and bookings.</p>
          </div>
          {live && (
            <Link
              href={`/account/orders/${live.id}`}
              className="inline-flex min-h-11 items-center gap-3 rounded-full bg-white/[0.08] py-1.5 pl-4 pr-1.5 text-sm font-bold text-white no-underline"
            >
              <span className="h-2 w-2 rounded-full bg-gold" aria-hidden="true" />
              {(live.merchant_id && activity.merchants.get(live.merchant_id)?.trading_name) ||
                'Your order'}{' '}
              · {live.stage.replaceAll('_', ' ')}
              <span className="rounded-full bg-gold px-3 py-1.5 font-extrabold text-[#141414]">
                Track
              </span>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          {unpaid.slice(0, 1).map((o) => (
            <Link key={o.id} href={`/pay/${o.reference}`} className={card}>
              <span className={why}>Not paid yet</span>
              <span className="font-extrabold">
                Finish your order
                {o.merchant_id && activity.merchants.get(o.merchant_id)
                  ? ` from ${activity.merchants.get(o.merchant_id)!.trading_name}`
                  : ''}
              </span>
              <span className={sub}>
                {kes(o.total_cents)} · {o.reference}
              </span>
            </Link>
          ))}

          {again.map(({ merchant, last, count }) => (
            <a key={merchant.id} href={`/discover?merchant=${merchant.id}`} className={card}>
              <span className={why}>
                {count > 1 ? `Ordered ${count} times` : 'You ordered here'}
              </span>
              <span className="font-extrabold">Order again from {merchant.trading_name}</span>
              <span className={sub}>Last time {kes(last.total_cents)}</span>
            </a>
          ))}

          {ahead.map((item) =>
            item.kind === 'booking' ? (
              <Link key={item.booking.id} href="/account?tab=bookings" className={card}>
                <span className={why}>Coming up · {when(item.booking.starts_at)}</span>
                <span className="font-extrabold">
                  {item.booking.resource_name}
                  {item.booking.merchant_name ? ` · ${item.booking.merchant_name}` : ''}
                </span>
                <span className={sub}>
                  {item.booking.status === 'pending'
                    ? 'Waiting for the business to confirm'
                    : 'Confirmed'}
                </span>
              </Link>
            ) : (
              <Link key={item.stay.id} href="/account?tab=stays" className={card}>
                <span className={why}>Your stay · {day(item.stay.check_in)}</span>
                <span className="font-extrabold">
                  {day(item.stay.check_in)} to {day(item.stay.check_out)}
                </span>
                <span className={sub}>
                  {item.stay.status === 'held' ? 'Held: finish booking' : 'Booked'} · things to do
                  nearby are in Experiences
                </span>
              </Link>
            ),
          )}

          {lastBooking && (
            <Link href={`/book/${lastBooking.merchant_id}`} className={card}>
              <span className={why}>You booked before</span>
              <span className="font-extrabold">
                Book {lastBooking.resource_name} again
                {lastBooking.merchant_name ? ` at ${lastBooking.merchant_name}` : ''}
              </span>
              <span className={sub}>Pick a new time</span>
            </Link>
          )}

          <Link href="/ask" className={card}>
            <span className={why}>Need something else?</span>
            <span className="font-extrabold">Ask a concierge</span>
            <span className={sub}>Tell us what you need and we arrange it.</span>
          </Link>
        </div>

        {similar.length > 0 && favourite && (
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-extrabold">Because you like {favourite.trading_name}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
              {similar.map((m) => (
                <a key={m.id} href={`/discover?merchant=${m.id}`} className={card}>
                  <span className="font-extrabold">{m.trading_name}</span>
                  <span className={sub}>
                    {(m.category ?? m.category_key ?? '').replaceAll('_', ' ')}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="text-[0.75rem] text-white/60">
          Suggestions use only your own NexG orders, bookings and stays.
        </p>
      </div>
    </section>
  );
}
