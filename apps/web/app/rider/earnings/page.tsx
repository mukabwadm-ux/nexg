import { DASH, Empty, Panel, Pill, Stat, day, kesWhole, plural } from '@/components/partner/bits';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import type { RiderHome } from '../layout';

export const metadata = { title: 'Earnings' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  paid: 'bg-success-bg text-success',
  pending: 'bg-info-bg text-info',
  failed: 'bg-danger-bg text-danger',
  held: 'bg-gold-soft text-gold-text',
};

/**
 * Earnings.
 *
 * Broken down per trip, because "you earned 2,400 this week" is a
 * number nobody can check. Base, distance, waiting, bonuses and
 * anything taken off each get their own line, and they add up on
 * the page.
 *
 * Cash collected sits apart from money earned. On a cash order
 * they are different numbers, and the settlement nets one against
 * the other — a rider who thinks the cash in their pocket is
 * theirs is in for a bad Friday.
 */
export default async function RiderEarnings() {
  const me = await requireRider();
  const supabase = createClient();

  const [{ data: home }, { data: earnings, error }, { data: settlements }] = await Promise.all([
    supabase.from('rider_home_v').select('*').eq('rider_id', me.id).maybeSingle(),
    supabase
      .from('rider_earning')
      .select('*')
      .eq('rider_id', me.id)
      .eq('is_test', false)
      .order('earned_at', { ascending: false })
      .limit(60),
    supabase
      .from('rider_settlement_line')
      .select('*')
      .eq('rider_id', me.id)
      .order('paid_at', { ascending: false, nullsFirst: true })
      .limit(8),
  ]);

  const r = home as RiderHome | null;
  const rows = (earnings as Earning[] | null) ?? [];
  const settled = (settlements as Settlement[] | null) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Today" value={kesWhole(r?.earned_today_kes)} hint="Across every trip" />
        <Stat label="This week" value={kesWhole(r?.earned_week_kes)} hint="Since Monday" />
        <Stat
          label="Cash on you"
          value={kesWhole(r?.cash_on_hand)}
          hint={
            r?.cash_cap
              ? `of ${kesWhole(r.cash_cap)} · not yours until it is banked`
              : 'No cap set for your city'
          }
          tone={
            r?.cash_cap && r.cash_on_hand && r.cash_on_hand >= r.cash_cap * 0.9
              ? 'danger'
              : undefined
          }
        />
      </div>

      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your earnings could not be read: {error.message}
        </p>
      )}

      <Panel title="Every trip" note={rows.length > 0 ? plural(rows.length, 'trip') : undefined}>
        {rows.length === 0 ? (
          <Empty
            title="Nothing earned yet."
            body="Each delivery appears here the moment it is done, broken down so you can check it."
          />
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[0.875rem] font-extrabold">{e.order_reference ?? DASH}</p>
                  <p className="text-[0.9375rem] font-extrabold tabular-nums">
                    {kesWhole(e.total_kes)}
                  </p>
                </div>
                <p className="text-muted-light text-[0.75rem] font-semibold">
                  {day(e.earned_at)}
                </p>
                <p className="text-muted mt-1 text-[0.75rem] font-semibold">
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
                {e.cash_collected_kes > 0 && (
                  <p className="text-gold-text text-[0.75rem] font-bold">
                    You collected {kesWhole(e.cash_collected_kes)} in cash on this one — that is
                    NexG&apos;s, and it comes off your settlement.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Settlements" note={settled.length > 0 ? 'Weekly' : undefined}>
        {settled.length === 0 ? (
          <p className="text-muted text-[0.8125rem] font-semibold">
            Nothing settled yet. Earnings are paid out weekly to{' '}
            {r?.payout_msisdn ?? DASH}.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {settled.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[0.875rem] font-extrabold">
                    {s.paid_at ? day(s.paid_at) : 'Not paid yet'} ·{' '}
                    {plural(s.trips ?? 0, 'trip')}
                  </p>
                  <Pill tone={TONE[s.status] ?? 'bg-bg text-muted'}>
                    {s.status.toUpperCase()}
                  </Pill>
                </div>
                <dl className="mt-1 space-y-0.5">
                  <Line label="Earned" value={kesWhole(s.earnings_kes)} />
                  {s.bonuses_kes > 0 && <Line label="Bonuses" value={kesWhole(s.bonuses_kes)} />}
                  {s.tips_kes > 0 && <Line label="Tips" value={kesWhole(s.tips_kes)} />}
                  {s.cash_collected_kes > 0 && (
                    <Line
                      label="Cash you collected"
                      value={`− ${kesWhole(s.cash_collected_kes)}`}
                      muted
                    />
                  )}
                  {s.cash_deposited_kes > 0 && (
                    <Line label="Cash you banked" value={kesWhole(s.cash_deposited_kes)} muted />
                  )}
                  <Line label="To you" value={kesWhole(s.net_pay_kes)} strong />
                </dl>
                {s.failure_reason && (
                  <p className="text-danger mt-1 text-[0.75rem] font-bold">{s.failure_reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-[0.8125rem] font-semibold ${muted ? 'text-muted-light' : 'text-muted'}`}>
        {label}
      </dt>
      <dd
        className={`shrink-0 tabular-nums ${
          strong ? 'text-[0.9375rem] font-extrabold' : 'text-[0.8125rem] font-bold'
        }`}
      >
        {value}
      </dd>
    </div>
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
