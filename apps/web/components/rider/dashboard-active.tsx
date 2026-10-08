import { Coffee, MessageSquare, TriangleAlert, Wallet } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Attention, DASH, Panel, QuickAction, Row, Tile, kesc, kesh, partOfDay } from './bits';
import type {
  RiderAttentionRow,
  RiderHome,
  RiderJob,
  WeekBar,
  WeekEarnings,
} from './types';

/**
 * The dashboard for a rider who is working.
 *
 * Four numbers at the top, and the one that is not money is the
 * most important: cash on hand against the cap. A rider who
 * hits the cap stops getting cash orders, which is half the
 * work in this market, and they find out by orders quietly
 * drying up. So it sits in the hero next to earnings rather
 * than three screens away in Cash.
 *
 * Every pay figure is money already earned. There is no
 * estimate, no projection and no "riders like you". The design
 * is explicit and so is the copy underneath the week panel.
 */

const WHAT_NOW: Record<string, { label: string; tone: string }> = {
  to_pickup: { label: 'To pickup', tone: 'bg-info-bg text-info' },
  at_pickup: { label: 'At pickup', tone: 'bg-info-bg text-info' },
  to_dropoff: { label: 'On the way', tone: 'bg-info-bg text-info' },
  arriving: { label: 'Arriving', tone: 'bg-gold-soft text-gold-text' },
  delivered: { label: 'Delivered', tone: 'bg-success/10 text-success' },
  queued: { label: 'Queued', tone: 'bg-warn/10 text-warn' },
};

export function DashboardActive({
  h,
  jobs,
  attention,
  week,
  bars,
}: {
  h: RiderHome;
  jobs: RiderJob[];
  attention: RiderAttentionRow[];
  week: WeekEarnings | null;
  bars: WeekBar[];
}) {
  const first = h.first_name ?? (h.name ?? 'there').split(' ')[0] ?? 'there';
  const open = jobs.filter((j) => j.what_now !== 'delivered');
  const cashPct =
    h.cash_cap && h.cash_cap > 0 ? Math.min(1, (h.cash_on_hand ?? 0) / h.cash_cap) : 0;
  const cashTone = cashPct >= 1 ? 'danger' : cashPct >= 0.8 ? 'gold' : 'plain';

  const peak = bars.reduce(
    (mx, b) => Math.max(mx, Number(b.base_kes) + Number(b.bonus_kes)),
    0,
  );

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────── the hero */}
      <section className="bg-ink relative overflow-hidden px-4 py-6 text-white sm:px-7">
        <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="font-serif text-[1.875rem] font-extrabold tracking-tight">
              Good {partOfDay()}, {first} 👋
            </h1>
            <p className="mt-1.5 text-[0.9375rem] font-semibold text-white/65">
              {h.presence === 'online' ? (
                <>
                  You&apos;re online in{' '}
                  <strong className="text-gold">{h.city ?? 'your zone'}</strong>.
                </>
              ) : (
                <>
                  You&apos;re offline. Go online to start receiving offers in{' '}
                  <strong className="text-gold">{h.city ?? 'your zone'}</strong>.
                </>
              )}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                value={String(h.trips_today ?? 0)}
                label="Deliveries today"
                note={open.length > 0 ? `${open.length} open` : 'none open'}
                noteTone={open.length > 0 ? 'gold' : 'plain'}
              />
              <Tile
                value={kesh(h.earned_today_kes)}
                label="Earned today"
                note="Lines already earned"
              />
              <Tile
                value={kesh(h.cash_on_hand)}
                label="Cash on hand"
                note={
                  h.cash_cap
                    ? cashPct >= 1
                      ? 'At cap · cash orders stopped'
                      : `Cap ${kesh(h.cash_cap)}`
                    : 'no cap set'
                }
                noteTone={cashTone === 'danger' ? 'danger' : cashTone === 'gold' ? 'gold' : 'plain'}
              />
              <Tile
                value={titleCase(h.health_band ?? DASH)}
                label="Health band"
                note={h.health_score !== null ? `Score ${h.health_score}` : 'not scored yet'}
                noteTone={h.health_band === 'good' ? 'good' : 'plain'}
              />
            </div>
          </div>

          <div className="w-full max-w-xs rounded-xl bg-black/35 p-4 backdrop-blur-sm lg:w-auto">
            <p className="text-gold text-[0.9375rem] font-extrabold">Zone bonuses</p>
            <p className="mt-1.5 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Rain, demand and shift bonuses are added as their own line on each job and on
              Friday&apos;s statement — never folded into the base, so you can always see what you
              were paid for.
            </p>
            <Link
              href="/rider/shifts"
              className="bg-gold text-ink mt-3 block rounded-lg px-4 py-2.5 text-center text-[0.8125rem] font-extrabold"
            >
              See shifts & bonuses →
            </Link>
          </div>
        </div>
      </section>

      <div className="space-y-6 px-4 sm:px-7">
        {/* ─────────────────────────────── cooldown, if any */}
        {h.cooldown_until && new Date(h.cooldown_until) > new Date() ? (
          <section className="border-danger/40 bg-danger/5 rounded-xl border p-4">
            <h2 className="text-danger text-[0.9375rem] font-extrabold">
              You are on a cooldown until{' '}
              {new Date(h.cooldown_until).toLocaleString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: 'short',
                timeZone: 'Africa/Nairobi',
              })}
            </h2>
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.6]">
              {h.cooldown_reason ?? 'No reason was recorded, which is itself worth asking about.'}{' '}
              You cannot go online until it ends. Everything else still works, including cash
              deposits and your statement.
            </p>
          </section>
        ) : null}

        {/* ───────────────────────────────── right now */}
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-[1.375rem] font-extrabold tracking-tight">Right now</h2>
            <Link
              href="/rider/jobs"
              className="text-gold-text text-[0.8125rem] font-extrabold hover:underline"
            >
              Open jobs →
            </Link>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {/* the active job */}
            <div className="bg-ink overflow-hidden rounded-xl p-5 text-white">
              <span className="text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-white/45">
                Active job
              </span>
              {open[0] ? (
                <>
                  <h3 className="mt-1.5 font-serif text-[1.25rem] font-extrabold tracking-tight">
                    {open[0].reference}
                  </h3>
                  <p className="mt-1 text-[0.8125rem] font-semibold text-white/60">
                    {open[0].pickup ?? DASH} → {open[0].dropoff ?? DASH}
                  </p>
                  <span className="bg-gold-soft text-gold-text mt-2.5 inline-block rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold">
                    {WHAT_NOW[open[0].what_now ?? '']?.label ?? open[0].stage}
                  </span>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <span className="text-[0.6875rem] font-semibold text-white/55">Your pay</span>
                    <span className="text-[0.8125rem] font-extrabold">
                      {kesc(open[0].earned_cents)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="mt-1.5 font-serif text-[1.25rem] font-extrabold tracking-tight">
                    Nothing active
                  </h3>
                  <p className="mt-1 text-[0.8125rem] font-semibold leading-[1.6] text-white/55">
                    {h.presence === 'online'
                      ? 'You are online. The next offer in your zone will arrive here with its full pay breakdown and a countdown.'
                      : 'Go online to start receiving offers.'}
                  </p>
                </>
              )}
            </div>

            {/* demand — stated as a suggestion, not a promise */}
            <div className="border-border bg-surface rounded-xl border p-5">
              <span className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
                Demand near you
              </span>
              <h3 className="mt-1.5 font-serif text-[1.25rem] font-extrabold tracking-tight">
                {h.city ?? 'Your zone'}
              </h3>
              <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.6]">
                The live demand map is the next piece of this build. When it lands it will show
                busier cells and a suggested direction — labelled a suggestion, because moving
                toward demand is never a guarantee of an offer.
              </p>
            </div>

            {/* today's shift */}
            <div className="bg-ink overflow-hidden rounded-xl p-5 text-white">
              <span className="text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-white/45">
                Today&apos;s shift
              </span>
              <h3 className="mt-1.5 font-serif text-[1.25rem] font-extrabold tracking-tight">
                No shift committed
              </h3>
              <p className="mt-1 text-[0.8125rem] font-semibold leading-[1.6] text-white/55">
                Shifts give a guaranteed slot and an incentive paid as its own statement line when
                you complete the window. Releasing early forfeits the incentive and is not a
                strike.
              </p>
              <Link
                href="/rider/shifts"
                className="bg-gold text-ink mt-3 block rounded-lg px-3 py-2 text-center text-[0.75rem] font-extrabold"
              >
                See shifts →
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {/* ─────────────────────────── today's jobs */}
            <section className="border-border bg-surface overflow-hidden rounded-xl border">
              <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
                  Today&apos;s jobs
                </h2>
                <Link
                  href="/rider/jobs"
                  className="text-gold-text text-[0.75rem] font-extrabold hover:underline"
                >
                  Full job history →
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">Job</th>
                      <th className="px-4 py-2">Payment</th>
                      <th className="px-4 py-2">Your pay</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                            No jobs today yet. Not a loading state — nothing has come in.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      jobs.map((j) => {
                        const w = WHAT_NOW[j.what_now ?? ''] ?? {
                          label: j.stage,
                          tone: 'bg-bg text-muted',
                        };
                        return (
                          <tr
                            key={j.id}
                            className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                          >
                            <td className="px-4 py-3">
                              <span className="font-extrabold">{j.reference}</span>
                              <span className="text-muted-light block text-[0.6875rem]">
                                {j.merchant ?? DASH} → {j.dropoff ?? DASH}
                              </span>
                            </td>
                            <td className="text-muted px-4 py-3 capitalize">
                              {j.payment_method ?? DASH}
                              {j.collect_cents ? (
                                <span className="text-warn block text-[0.6875rem] font-extrabold">
                                  collect {kesc(j.collect_cents)}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 font-extrabold tabular-nums">
                              {kesc(j.earned_cents)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${w.tone}`}
                              >
                                {w.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold">
                Navigate, Arrived, Picked up and Hand over are in the app, on the job screen. They
                change what a guest is told and need the phone that is actually at the door.
              </p>
            </section>

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
              title="This week's earnings"
              action={
                <Link
                  href="/rider/earnings"
                  className="border-border-strong rounded-lg border px-2.5 py-1 text-[0.6875rem] font-extrabold"
                >
                  Statement →
                </Link>
              }
            >
              <div className="px-4 pt-3.5">
                <p className="text-[1.75rem] font-extrabold leading-none tracking-tight">
                  {kesh(week?.total_kes)}
                </p>
                <p className="text-success text-[0.8125rem] font-extrabold">net payable Friday</p>
                <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                  Same lines as your statement
                </p>
              </div>
              <div className="mt-3">
                <Row label="Deliveries" value={String(week?.deliveries ?? 0)} />
                <Row
                  label="Base + distance"
                  value={kesh((week?.base_kes ?? 0) + (week?.distance_kes ?? 0))}
                />
                <Row label="Bonuses" value={kesh(week?.bonus_kes)} />
                <Row label="Tips" value={kesh(week?.tip_kes)} />
                <Row label="Cash collected" value={kesh(week?.cash_collected_kes)} tone="muted" />
              </div>

              {peak > 0 ? (
                <div className="px-4 pb-4 pt-3">
                  <div className="flex items-end gap-1.5" style={{ height: '4rem' }}>
                    {bars.map((b) => {
                      const total = Number(b.base_kes) + Number(b.bonus_kes);
                      return (
                        <div key={b.day} className="flex flex-1 flex-col items-center gap-1">
                          <div
                            className="flex w-full flex-col justify-end"
                            style={{ height: `${Math.max(3, (total / peak) * 100)}%` }}
                            title={`${b.dow}: ${kesh(total)}`}
                          >
                            <div
                              className="bg-gold-text w-full rounded-t"
                              style={{
                                height: `${total > 0 ? (Number(b.bonus_kes) / total) * 100 : 0}%`,
                              }}
                            />
                            <div className="bg-gold w-full" style={{ flex: 1 }} />
                          </div>
                          <span className="text-muted-light text-[0.5625rem] font-extrabold">
                            {b.dow}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-muted-light mt-2 flex gap-3 text-[0.5625rem] font-extrabold">
                    <span className="flex items-center gap-1">
                      <span className="bg-gold h-1.5 w-3 rounded-sm" /> Base + distance
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="bg-gold-text h-1.5 w-3 rounded-sm" /> Bonuses + tips
                    </span>
                  </p>
                </div>
              ) : null}
            </Panel>

            <section>
              <h2 className="mb-2 text-[0.875rem] font-extrabold tracking-tight">Quick actions</h2>
              <div className="grid grid-cols-2 gap-2.5">
                <QuickAction
                  href="/rider/cash"
                  icon={<Wallet className="h-4 w-4" />}
                  title="Deposit cash"
                  note="Paybill and your rider code; matched automatically."
                />
                <QuickAction
                  href="/rider/shifts"
                  icon={<Coffee className="h-4 w-4" />}
                  title="Take a break"
                  note="Pause offers without going offline or affecting acceptance."
                />
                <QuickAction
                  href="/rider/incidents"
                  icon={<TriangleAlert className="h-4 w-4" />}
                  title="Report an issue"
                  note="Accident, unsafe address, wrong order or a merchant delay."
                />
                <QuickAction
                  href="/rider/messages"
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Message dispatch"
                  note="A thread about the active job or your account."
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
