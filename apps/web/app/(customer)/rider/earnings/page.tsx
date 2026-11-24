import { ArrowRight, CheckCircle2, Star, Wallet } from 'lucide-react';
import Link from 'next/link';

import { DASH, Pill, day, kesWhole, plural } from '@/components/partner/bits';
import {
  AreaChart,
  Donut,
  KpiCard,
  Nothing,
  PageHead,
  PanelTitle,
  PillTabs,
  RiderPage,
  SumLine,
  kes,
  panel,
  ring,
} from '@/components/rider/ui';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Earnings' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  paid: 'bg-success-bg text-success',
  pending: 'bg-info-bg text-info',
  failed: 'bg-danger-bg text-danger',
  held: 'bg-gold-soft text-gold-text',
};

const RANGES = [
  { days: 7, label: '7 Days' },
  { days: 30, label: '30 Days' },
  { days: 90, label: '3 Months' },
] as const;

const TZ = 'Africa/Nairobi';
const DAY_MS = 86_400_000;
const dateKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString('en-GB', { ...o, timeZone: TZ });

/**
 * Earnings overview.
 *
 * The totals, the chart and the breakdown all come from the same
 * `rider_earning` rows Finance pays from, for the range picked in the
 * URL (7 days, 30 days or 3 months), compared with the range before it.
 * The breakdown splits pay by what it was for, because NexG riders only
 * deliver: trip pay, distance, bonuses and tips.
 *
 * Every trip is still listed with its parts, so a rider can check any
 * figure, and cash collected stays apart from money earned.
 */
export default async function RiderEarnings({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const me = await requireRider();
  const supabase = createClient();
  const range = RANGES.find((r) => String(r.days) === searchParams.range) ?? RANGES[0];

  const now = new Date();
  const since = new Date(now.getTime() - range.days * 2 * DAY_MS);

  const [{ data: earnings, error }, { data: settlements }] = await Promise.all([
    supabase
      .from('rider_earning')
      .select('*')
      .eq('rider_id', me.id)
      .eq('is_test', false)
      .gte('earned_at', since.toISOString())
      .order('earned_at', { ascending: false })
      .limit(5000),
    supabase
      .from('rider_settlement_line')
      .select('*')
      .eq('rider_id', me.id)
      .order('paid_at', { ascending: false, nullsFirst: true })
      .limit(6),
  ]);

  const all = (earnings as Earning[] | null) ?? [];
  const settled = (settlements as Settlement[] | null) ?? [];

  /* The buckets: one per day, or one per week for three months. */
  const perWeek = range.days > 31;
  const span = perWeek ? 7 : 1;
  const buckets: { label: string; long: string; value: number }[] = [];
  const bucketOf = new Map<string, number>();
  const count = Math.ceil(range.days / span);
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = new Date(now.getTime() - (i * span + span - 1) * DAY_MS);
    const label =
      range.days <= 7
        ? fmt(start, { weekday: 'short' })
        : fmt(start, { day: 'numeric', month: 'short' });
    const long = perWeek
      ? `Week from ${label}`
      : fmt(start, { weekday: 'short', day: 'numeric', month: 'short' });
    for (let d = 0; d < span; d += 1) {
      bucketOf.set(dateKey(new Date(start.getTime() + d * DAY_MS)), buckets.length);
    }
    buckets.push({ label, long, value: 0 });
  }

  const cut = now.getTime() - range.days * DAY_MS;
  const current = all.filter((e) => new Date(e.earned_at).getTime() >= cut);
  const before = all.filter((e) => new Date(e.earned_at).getTime() < cut);
  for (const e of current) {
    const index = bucketOf.get(dateKey(new Date(e.earned_at)));
    const bucket = index == null ? undefined : buckets[index];
    if (bucket) bucket.value += Number(e.total_kes) || 0;
  }

  const sum = (rows: Earning[], pick: (e: Earning) => number) =>
    rows.reduce((total, e) => total + (Number(pick(e)) || 0), 0);
  const total = sum(current, (e) => e.total_kes);
  const totalBefore = sum(before, (e) => e.total_kes);
  const jobs = current.length;
  const average = jobs > 0 ? total / jobs : null;
  const averageBefore = before.length > 0 ? totalBefore / before.length : 0;
  const penalties = sum(current, (e) => e.penalty_kes);
  const cashCollected = sum(current, (e) => e.cash_collected_kes);

  const parts = [
    {
      label: 'Trip pay',
      value: sum(current, (e) => e.base_kes + e.waiting_kes),
      colour: '#2563eb',
    },
    { label: 'Distance', value: sum(current, (e) => e.distance_kes), colour: '#16a34a' },
    {
      label: 'Bonuses',
      value: sum(current, (e) => e.pickup_bonus_kes + e.peak_bonus_kes),
      colour: '#f5b800',
    },
    { label: 'Tips', value: sum(current, (e) => e.tip_kes), colour: '#9333ea' },
  ];

  const word = range.days === 7 ? 'in 7 days' : range.days === 30 ? 'in 30 days' : 'in 3 months';
  const per = perWeek ? 'per week' : 'per day';

  return (
    <RiderPage>
      <PageHead title="Earnings Overview" lead="Track your earnings and performance">
        <PillTabs
          label="Earnings range"
          items={RANGES.map((r) => ({
            href: `/rider/earnings?range=${r.days}`,
            label: r.label,
            on: r.days === range.days,
          }))}
        />
      </PageHead>

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700"
        >
          Your earnings could not be read: {error.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          icon={<Wallet />}
          tone="gold"
          value={kes(total)}
          label={`Total earnings ${word}`}
          change={{ now: total, before: totalBefore }}
        />
        <KpiCard
          icon={<CheckCircle2 />}
          tone="green"
          value={jobs.toLocaleString('en-KE')}
          label="Completed jobs"
          change={{ now: jobs, before: before.length }}
        />
        <KpiCard
          icon={<Star />}
          tone="amber"
          value={average == null ? '—' : kes(average)}
          label="Average per job"
          change={average == null ? null : { now: average, before: averageBefore }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={panel}>
          <PanelTitle
            title={`Earnings ${per}`}
            note={`Your best ${perWeek ? 'week' : 'day'} is marked`}
          />
          {total > 0 ? (
            <AreaChart points={buckets} label={`Earnings ${per} ${word}`} />
          ) : (
            <Nothing
              title="No earnings in this range."
              body="Each delivery adds to this chart the moment it is done."
            />
          )}
        </section>

        <section className={panel}>
          <PanelTitle title="Earnings Breakdown" note="What your pay was for" />
          <Donut parts={parts} label="Share of earnings by type" />
          {penalties > 0 || cashCollected > 0 ? (
            <dl className="mt-4 space-y-1 border-t border-[#eef0f6] pt-3 text-[13px]">
              {penalties > 0 ? (
                <SumLine label="Taken off (penalties)" value={`− ${kes(penalties)}`} />
              ) : null}
              {cashCollected > 0 ? (
                <SumLine label="Cash you collected (NexG's)" value={kes(cashCollected)} />
              ) : null}
            </dl>
          ) : null}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={panel}>
          <PanelTitle
            title="Every trip"
            note={current.length > 0 ? `${plural(current.length, 'trip')} ${word}` : undefined}
          />
          {current.length === 0 ? (
            <Nothing
              title="Nothing earned in this range."
              body="Each delivery appears here broken down so you can check it."
            />
          ) : (
            <ul className="divide-y divide-[#eef0f6]">
              {current.slice(0, 25).map((e) => (
                <li key={e.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[14px] font-extrabold">{e.order_reference ?? DASH}</p>
                    <p className="text-[15px] font-extrabold tabular-nums">
                      {kesWhole(e.total_kes)}
                    </p>
                  </div>
                  <p className="text-[12.5px] font-semibold text-slate-500">{day(e.earned_at)}</p>
                  <p className="mt-1 text-[12.5px] font-semibold text-slate-600">
                    {[
                      `base ${kesWhole(e.base_kes)}`,
                      e.distance_kes ? `distance ${kesWhole(e.distance_kes)}` : null,
                      e.waiting_kes ? `waiting ${kesWhole(e.waiting_kes)}` : null,
                      e.pickup_bonus_kes ? `pickup bonus ${kesWhole(e.pickup_bonus_kes)}` : null,
                      e.peak_bonus_kes ? `peak bonus ${kesWhole(e.peak_bonus_kes)}` : null,
                      e.tip_kes ? `tip ${kesWhole(e.tip_kes)}` : null,
                      e.penalty_kes ? `less ${kesWhole(e.penalty_kes)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {e.cash_collected_kes > 0 ? (
                    <p className="text-[12.5px] font-bold text-amber-700">
                      You collected {kesWhole(e.cash_collected_kes)} in cash: that is NexG&apos;s
                      and comes off your settlement.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {current.length > 25 ? (
            <p className="mt-2 text-[12.5px] font-semibold text-slate-500">
              Showing the latest 25. Your statement has the rest.
            </p>
          ) : null}
        </section>

        <div className="space-y-4">
          <Link
            href="/rider/cashout"
            prefetch={false}
            className={`flex items-center justify-between gap-3 rounded-[20px] bg-gradient-to-r from-[#10162a] to-[#1c2747] p-5 text-white ${ring}`}
          >
            <span>
              <span className="block text-[16px] font-extrabold">
                Need it before your next payout?
              </span>
              <span className="text-[13px] text-white/75">Cash out to M-Pesa</span>
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fdd128] text-[color:var(--rider-ink)]">
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </span>
          </Link>

          <section className={panel}>
            <PanelTitle title="Settlements" note="Payout runs" />
            {settled.length === 0 ? (
              <p className="text-[13px] font-semibold text-slate-500">Nothing settled yet.</p>
            ) : (
              <ul className="divide-y divide-[#eef0f6]">
                {settled.map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[14px] font-extrabold">
                        {s.paid_at ? day(s.paid_at) : 'Not paid yet'} ·{' '}
                        {plural(s.trips ?? 0, 'trip')}
                      </p>
                      <Pill tone={TONE[s.status] ?? 'bg-bg text-muted'}>
                        {s.status.toUpperCase()}
                      </Pill>
                    </div>
                    <dl className="mt-1 space-y-0.5 text-[13px]">
                      <SumLine label="Earned" value={kesWhole(s.earnings_kes)} />
                      {s.bonuses_kes > 0 ? (
                        <SumLine label="Bonuses" value={kesWhole(s.bonuses_kes)} />
                      ) : null}
                      {s.tips_kes > 0 ? (
                        <SumLine label="Tips" value={kesWhole(s.tips_kes)} />
                      ) : null}
                      {s.cash_collected_kes > 0 ? (
                        <SumLine
                          label="Cash you collected"
                          value={`− ${kesWhole(s.cash_collected_kes)}`}
                        />
                      ) : null}
                      {s.cash_deposited_kes > 0 ? (
                        <SumLine label="Cash you banked" value={kesWhole(s.cash_deposited_kes)} />
                      ) : null}
                      <SumLine label="To you" value={kesWhole(s.net_pay_kes)} strong />
                    </dl>
                    {s.failure_reason ? (
                      <p className="mt-1 text-[12.5px] font-bold text-red-700">
                        {s.failure_reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </RiderPage>
  );
}

interface Earning {
  id: string;
  order_reference: string | null;
  base_kes: number;
  distance_kes: number;
  waiting_kes: number;
  pickup_bonus_kes: number;
  peak_bonus_kes: number;
  tip_kes: number;
  penalty_kes: number;
  total_kes: number;
  cash_collected_kes: number;
  earned_at: string;
}

interface Settlement {
  id: string;
  trips: number | null;
  earnings_kes: number;
  bonuses_kes: number;
  tips_kes: number;
  cash_collected_kes: number;
  cash_deposited_kes: number;
  net_pay_kes: number;
  status: string;
  paid_at: string | null;
  failure_reason: string | null;
}
