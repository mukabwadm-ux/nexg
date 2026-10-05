import Link from 'next/link';

import {
  DASH,
  Empty,
  Panel,
  Pill,
  Progress,
  Stat,
  clock,
  kes,
  num,
  plural,
} from '@/components/partner/bits';
import { LiveOrders } from '@/components/partner/live-orders';
import { Trading } from '@/components/partner/merchant-trading';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import type { MerchantHome } from './layout';

export const metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

const WHAT_NOW: Record<string, { label: string; tone: string }> = {
  to_cook: { label: 'START IT', tone: 'bg-gold-soft text-gold-text' },
  cooking: { label: 'COOKING', tone: 'bg-info-bg text-info' },
  you_are_late: { label: 'YOU ARE LATE', tone: 'bg-danger-bg text-danger' },
  waiting_for_a_rider: { label: 'WAITING FOR A RIDER', tone: 'bg-info-bg text-info' },
  rider_coming: { label: 'RIDER COMING', tone: 'bg-info-bg text-info' },
  on_the_way: { label: 'ON THE WAY', tone: 'bg-success-bg text-success' },
  done: { label: 'DELIVERED', tone: 'bg-success-bg text-success' },
  closed: { label: 'CLOSED', tone: 'bg-bg text-muted-light' },
};

/**
 * Today.
 *
 * The first screen answers one question — is anything waiting on
 * me right now — and everything else is below it. A merchant opens
 * this between orders, on a phone, in a kitchen.
 */
export default async function MerchantToday() {
  const me = await requireMerchant();
  const supabase = createClient();

  const [{ data: home }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from('merchant_home_v').select('*').eq('merchant_id', me.id).maybeSingle(),
    supabase
      .from('merchant_orders_v')
      .select('*')
      .eq('merchant_id', me.id)
      .not('what_now', 'in', '("done","closed")')
      .order('placed_at'),
  ]);

  const m = home as MerchantHome | null;
  const live = (orders as OrderRow[] | null) ?? [];

  if (!m) {
    return (
      <Empty
        title="We could not load your business."
        body="That is a fault at our end rather than anything you have done. Reload, and if it keeps happening message us."
      />
    );
  }

  const checks = Object.entries(m.readiness ?? {})
    .filter(([k]) => k !== 'pct')
    .map(([k, v]) => [k, Boolean(v)] as const);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Open now"
          value={num(m.orders_open)}
          hint={m.orders_open === 0 ? 'Nothing waiting on you' : 'Orders still to finish'}
          tone={m.orders_open > 0 ? 'gold' : undefined}
        />
        <Stat label="Today" value={num(m.orders_today)} hint="Orders placed" />
        <Stat
          label="You kept today"
          value={kes(m.earned_today_cents)}
          hint="Delivered orders, after our commission"
        />
        <Stat
          label="Health"
          value={
            m.health_band ? m.health_band.charAt(0).toUpperCase() + m.health_band.slice(1) : DASH
          }
          hint={m.health_band ? 'Your rating with us' : 'No score yet'}
          tone={
            m.health_band === 'green'
              ? 'success'
              : m.health_band === 'red'
                ? 'danger'
                : m.health_band === 'amber'
                  ? 'gold'
                  : undefined
          }
        />
      </div>

      <Trading
        merchantId={m.merchant_id}
        accepting={m.accepting_orders}
        busyUntil={m.busy_mode_until}
        prepMinutes={m.prep_minutes}
        status={m.status}
      />

      <Panel
        title="What is on"
        note={
          <span className="flex items-center gap-2">
            {live.length > 0 && `${plural(live.length, 'order')} · oldest first`}
            <LiveOrders merchantId={m.merchant_id} />
          </span>
        }
        action={
          <Link
            href="/merchant/orders"
            className="text-[0.75rem] font-extrabold underline underline-offset-4"
          >
            All orders →
          </Link>
        }
      >
        {ordersError && (
          <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.75rem] font-bold">
            Your orders could not be read, so this list is incomplete: {ordersError.message}
          </p>
        )}
        {!ordersError && live.length === 0 ? (
          <Empty
            title="Nothing waiting on you."
            body={
              m.accepting_orders
                ? 'You are open and nothing is in the queue. New orders appear here the moment they are placed.'
                : 'You are not accepting orders at the moment, so nothing will arrive until you turn that back on.'
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {live.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-extrabold">
                    {o.reference}
                    <span className="text-muted ml-2 font-semibold">
                      {o.item_count} {o.item_count === 1 ? 'item' : 'items'} ·{' '}
                      {o.dropoff_label ?? '[—]'}
                    </span>
                  </p>
                  <p className="text-muted-light truncate text-[0.75rem] font-semibold">
                    In at {clock(o.placed_at)}
                    {o.promised_ready_at && ` · promised ready ${clock(o.promised_ready_at)}`}
                    {o.rider && ` · ${o.rider}`}
                    {o.needs_your_ack && (
                      <span className="text-danger font-bold"> · a change needs your nod</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Pill tone={WHAT_NOW[o.what_now]?.tone}>
                    {WHAT_NOW[o.what_now]?.label ?? o.what_now}
                  </Pill>
                  <p className="mt-0.5 text-[0.75rem] font-extrabold tabular-nums">
                    {kes(o.merchant_keeps_cents)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {m.readiness_pct < 100 && (
        <Panel title="Finishing setting up" note={`${m.readiness_pct}% done`}>
          <Progress pct={m.readiness_pct} label="Your registration" />
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {checks.map(([key, done]) => (
              <li key={key} className="flex items-center gap-2 text-[0.8125rem] font-semibold">
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-extrabold ${
                    done ? 'bg-success text-white' : 'bg-bg text-muted-light'
                  }`}
                >
                  {done ? '✓' : ''}
                </span>
                <span className={done ? 'text-muted' : ''}>{LABEL[key] ?? key}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-light mt-3 text-[0.75rem] font-semibold">
            These are the six things we check. The ring is floored, so it never claims one that is
            not ticked.
          </p>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink
          href="/merchant/stores"
          title="Stores"
          body={`${plural(m.stores, 'store')} open. Add another whenever you do.`}
        />
        <QuickLink
          href="/merchant/menu"
          title="Menu"
          body={`${plural(m.items_available, 'item')} guests can order right now.`}
        />
        <QuickLink
          href="/merchant/featured"
          title="Featured"
          body={
            m.featured_state
              ? `You have a request with us · ${m.featured_state}.`
              : 'Pay to sit at the top of the homepage for a week.'
          }
        />
      </div>
    </div>
  );
}

const LABEL: Record<string, string> = {
  business_basics: 'What kind of business you are',
  location: 'Where you are, inside a delivery area',
  hours_prep: 'Opening hours and prep time',
  documents: 'Your documents',
  payout: 'Where we pay you',
  first_items: 'At least five things on the menu',
};

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="border-border bg-surface hover:border-ink block rounded-2xl border p-4 transition-colors"
    >
      <p className="text-[0.875rem] font-extrabold">{title} →</p>
      <p className="text-muted mt-1 text-[0.8125rem] font-semibold">{body}</p>
    </Link>
  );
}

interface OrderRow {
  id: string;
  reference: string;
  what_now: string;
  dropoff_label: string | null;
  placed_at: string;
  promised_ready_at: string | null;
  rider: string | null;
  item_count: number;
  merchant_keeps_cents: number;
  needs_your_ack: boolean;
}
