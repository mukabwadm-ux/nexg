import { Clock, EyeOff, MessageSquare, Moon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { MerchantHome } from '@/app/merchant/layout';

import { Attention, DASH, Panel, QuickAction, Row, Tile, countdown, kes } from './bits';
import { BranchTile } from './dashboard-setup';
import type { AttentionRow, BranchCard, OrderRow, WeekBar, WeekMoney } from './types';

/**
 * The dashboard for a merchant who is trading.
 *
 * One question above everything: is anything waiting on me
 * right now. The hero answers it in four numbers and the table
 * underneath is the queue, sorted by how soon each order stops
 * being savable.
 *
 * Every figure here comes from a view. The page does no
 * arithmetic on money — "today's revenue" and "this week"
 * are read from the same place the statement is built from, so
 * the dashboard and the statement cannot disagree, which is the
 * single thing a merchant will check first.
 */

const WHAT_NOW: Record<string, { label: string; tone: string }> = {
  to_cook: { label: 'New', tone: 'bg-danger/10 text-danger' },
  cooking: { label: 'Preparing', tone: 'bg-info-bg text-info' },
  you_are_late: { label: 'Preparing · late', tone: 'bg-danger/10 text-danger' },
  waiting_for_a_rider: { label: 'Waiting for a rider', tone: 'bg-info-bg text-info' },
  rider_coming: { label: 'Rider coming', tone: 'bg-info-bg text-info' },
  on_the_way: { label: 'On the way', tone: 'bg-success/10 text-success' },
  done: { label: 'Delivered', tone: 'bg-success/10 text-success' },
};

export function DashboardLive({
  m,
  branches,
  attention,
  orders,
  money,
  bars,
  personName,
}: {
  m: MerchantHome;
  branches: BranchCard[];
  attention: AttentionRow[];
  orders: OrderRow[];
  money: WeekMoney | null;
  bars: WeekBar[];
  personName: string;
}) {
  const needAccepting = orders.filter((o) => o.what_now === 'to_cook');
  const inProgress = orders.filter((o) =>
    ['cooking', 'you_are_late', 'waiting_for_a_rider', 'rider_coming'].includes(o.what_now ?? ''),
  );
  const late = orders.filter((o) => o.what_now === 'you_are_late');

  /* The oldest thing waiting is the one that matters, so it is
     the one shown — not the count's average or its newest. */
  const oldest = needAccepting
    .map((o) => o.promised_ready_at)
    .filter((d): d is string => d !== null)
    .sort()[0];

  const peak = bars.reduce((mx, b) => Math.max(mx, Number(b.gross_cents)), 0);

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────── the hero */}
      <section className="bg-ink relative overflow-hidden px-4 py-6 text-white sm:px-7">
        <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="font-serif text-[1.875rem] font-extrabold tracking-tight">
              Good {partOfDay()}, {personName} 👋
            </h1>
            <p className="mt-1.5 text-[0.9375rem] font-semibold text-white/65">
              Here&apos;s what&apos;s happening at {m.name} today. Guests see you as{' '}
              <strong className="text-gold">
                {m.accepting_orders ? 'Open' : 'Paused'}
                {m.prep_minutes ? ` · ${m.prep_minutes} min` : ''}
              </strong>
              .
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                value={String(needAccepting.length)}
                label="Need accepting"
                note={oldest ? `Oldest: ${countdown(oldest) ?? 'now'} left` : 'nothing waiting'}
                noteTone={needAccepting.length > 0 ? 'danger' : 'plain'}
              />
              <Tile
                value={String(inProgress.length)}
                label="In progress"
                note={late.length > 0 ? `${late.length} running late` : 'all on time'}
                noteTone={late.length > 0 ? 'danger' : 'plain'}
              />
              <Tile
                value={kes(m.earned_today_cents)}
                label="Today's revenue"
                note={`${m.orders_today ?? 0} orders · gross`}
              />
              <Tile
                value={titleCase(m.health_band ?? DASH)}
                label="Health band"
                note={m.health_score !== null ? `Score ${m.health_score}` : 'not scored yet'}
                noteTone={m.health_band === 'good' ? 'good' : 'plain'}
              />
            </div>
          </div>

          <div className="w-full max-w-xs rounded-xl bg-black/35 p-4 backdrop-blur-sm lg:w-auto">
            <p className="text-gold text-[0.9375rem] font-extrabold">
              Get featured in {m.city ?? 'your zone'}
            </p>
            <p className="mt-1.5 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Featured slots put you at the top of Explore in your zone for a week. Your health
              band decides eligibility.
            </p>
            <Link
              href="/merchant/featured"
              className="bg-gold text-ink mt-3 block rounded-lg px-4 py-2.5 text-center text-[0.8125rem] font-extrabold"
            >
              See available slots →
            </Link>
          </div>
        </div>
      </section>

      <div className="space-y-6 px-4 sm:px-7">
        {/* ───────────────────────────────────── branches */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-[1.375rem] font-extrabold tracking-tight">
              My Branches
            </h2>
            <Link
              href="/merchant/stores"
              className="border-border-strong bg-surface rounded-lg border px-3.5 py-2 text-[0.8125rem] font-extrabold"
            >
              View all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <BranchTile key={b.branch_id} b={b} live />
            ))}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {/* ─────────────────────── needs your action */}
            <section className="border-border bg-surface overflow-hidden rounded-xl border">
              <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
                  Needs your action
                </h2>
                <Link
                  href="/merchant/orders"
                  className="text-gold-text text-[0.75rem] font-extrabold hover:underline"
                >
                  Open order queue →
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">Order</th>
                      <th className="px-4 py-2">Deliver to</th>
                      <th className="px-4 py-2">Pay</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Accept in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                            Nothing waiting. Not a loading state — the queue is genuinely empty.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      orders.map((o) => {
                        const w = WHAT_NOW[o.what_now ?? ''] ?? {
                          label: o.stage,
                          tone: 'bg-bg text-muted',
                        };
                        const left = countdown(o.promised_ready_at);
                        return (
                          <tr
                            key={o.id}
                            className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                              o.what_now === 'you_are_late' ? 'bg-danger/5' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <span className="font-extrabold">{o.reference}</span>
                              <span className="text-muted-light block text-[0.6875rem]">
                                {o.guest ?? 'Guest'} · {o.item_count ?? 0} item
                                {o.item_count === 1 ? '' : 's'}
                              </span>
                            </td>
                            <td className="text-muted px-4 py-3">{o.dropoff_label ?? DASH}</td>
                            <td className="text-muted px-4 py-3 capitalize">
                              {o.payment_method ?? DASH}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${w.tone}`}
                              >
                                {w.label}
                              </span>
                            </td>
                            <td className="text-muted px-4 py-3 tabular-nums">
                              {o.what_now === 'to_cook' ? (left ?? DASH) : (o.rider ?? DASH)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold">
                Accept, More time and Ready are on the order queue. They change what a guest is
                told, so they live where the whole order is visible rather than on a summary row.
              </p>
            </section>

            {/* ──────────────────────────── attention tiles */}
            {attention.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {attention.slice(0, 4).map((a) => (
                  <Attention key={a.kind} a={a} />
                ))}
              </div>
            ) : null}
          </div>

          {/* ══════════════════════════════ the right column */}
          <aside className="space-y-4">
            <Panel
              title="This week's money"
              action={
                <Link
                  href="/merchant/money"
                  className="border-border-strong rounded-lg border px-2.5 py-1 text-[0.6875rem] font-extrabold"
                >
                  Statement →
                </Link>
              }
            >
              <div className="px-4 pt-3.5">
                <p className="text-[1.75rem] font-extrabold leading-none tracking-tight">
                  {kes(money?.net_cents)}
                </p>
                <p className="text-success text-[0.8125rem] font-extrabold">net payable</p>
                <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                  From the same view as your statement
                </p>
              </div>
              <div className="mt-3">
                <Row label="Orders delivered" value={String(money?.delivered ?? 0)} />
                <Row label="Gross sales" value={kes(money?.gross_cents)} />
                <Row label="NexG fees" value={`− ${kes(money?.commission_cents)}`} />
                <Row label="Refunds & adj." value={`− ${kes(money?.refund_cents)}`} />
              </div>

              {peak > 0 ? (
                <div className="flex items-end gap-1.5 px-4 pb-4 pt-3" style={{ height: '4.5rem' }}>
                  {bars.map((b) => (
                    <div key={b.day} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="bg-gold w-full rounded-t"
                        style={{
                          height: `${Math.max(3, (Number(b.gross_cents) / peak) * 100)}%`,
                        }}
                        title={`${b.dow}: ${kes(b.gross_cents)}`}
                      />
                      <span className="text-muted-light text-[0.5625rem] font-extrabold">
                        {b.dow}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>

            <section>
              <h2 className="mb-2 text-[0.875rem] font-extrabold tracking-tight">Quick actions</h2>
              <div className="grid grid-cols-2 gap-2.5">
                <QuickAction
                  href="/merchant/hours"
                  icon={<Clock className="h-4 w-4" />}
                  title="Busy for 30 min"
                  note="Adds minutes to your estimate; guests see it before they order."
                />
                <QuickAction
                  href="/merchant/menu"
                  icon={<EyeOff className="h-4 w-4" />}
                  title="Mark item sold out"
                  note="Hides it until you turn it back on."
                />
                <QuickAction
                  href="/merchant/hours"
                  icon={<Moon className="h-4 w-4" />}
                  title="Close early today"
                  note="Stops new orders; current ones finish."
                />
                <QuickAction
                  href="/merchant/messages"
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Message merchant ops"
                  note="A thread about any order or issue."
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function partOfDay(): string {
  const hour = Number(
    new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }),
  );
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}
