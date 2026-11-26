import { CalendarDays, CalendarRange, Coins, Moon, Sun } from 'lucide-react';

import { DashCard } from '@/components/portal/dash';
import {
  EndSeasonButton,
  RateRulesButton,
  SeasonButton,
  type ScopeOptions,
} from '@/components/stays/rates-client';
import { Chip, DataTable, Empty, Fact, Footnote } from '@/components/stays/module';
import { asObject, kesFull, n, shortDate } from '@/lib/stays-module';
import type { StaysContext } from '@/lib/stays-server';

/*
 * Weekend, seasonal and long-stay rates on the Stays screens
 * (20270331000100). Every figure comes from fn_stay_quote, the same price
 * the guest's hold charges.
 */

export interface RateRow {
  unit_id: string;
  label: string;
  property_name: string | null;
  rate_kes: number | null;
  weekend_rate_kes?: number | null;
  weekly_discount_pct?: number | null;
  monthly_discount_pct?: number | null;
}

interface Quote {
  nights: number;
  total_kes: number;
  subtotal_kes: number;
  discount_pct: number;
  avg_nightly_kes: number;
}

interface SeasonRow {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  adjust_pct: number;
  scope: 'everywhere' | 'city' | 'property' | 'unit';
  scope_id: string | null;
  scope_name: string;
  state: 'current' | 'upcoming' | 'past' | 'ended';
  created_by: string | null;
}

const SCOPE_LABEL: Record<string, string> = {
  everywhere: 'Every unit',
  city: 'City',
  property: 'Building',
  unit: 'Unit',
};
const STATE_CHIP: Record<string, { status: string; text: string }> = {
  current: { status: 'checked_in', text: 'Running' },
  upcoming: { status: 'upcoming', text: 'Upcoming' },
  past: { status: 'completed', text: 'Over' },
  ended: { status: 'cancelled', text: 'Ended' },
};

const pctText = (v: number | null | undefined) => (v ? `${v}% off` : 'None');
const signed = (v: number) => `${v > 0 ? '+' : ''}${v}%`;

/** The city, building and unit choices for the season form. */
export async function scopeOptions(
  ctx: StaysContext,
  units: { unit_id: string; label: string; property_name: string | null }[],
): Promise<ScopeOptions> {
  const { data } = await ctx.db
    .from('property')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')
    .limit(500);
  return {
    cities: ctx.cities.map((c) => ({ id: c.id, label: c.name })),
    buildings: ((data as { id: string; name: string }[] | null) ?? []).map((p) => ({
      id: p.id,
      label: p.name,
    })),
    units: units.map((u) => ({
      id: u.unit_id,
      label: `${u.label}${u.property_name ? ` · ${u.property_name}` : ''}`,
    })),
  };
}

/** A unit panel's Rates tab: its rules, the seasons that reach it, a real week and month. */
export async function UnitRatesFacts({
  ctx,
  unitId,
  label,
}: {
  ctx: StaysContext;
  unitId: string;
  label: string;
}) {
  const read = await ctx.read('rpc_console_unit_rates', { p_unit_id: unitId });
  if (read.waiting)
    return (
      <p className="text-muted text-[0.875rem] font-semibold">
        Weekend, seasonal and long-stay rates show here once the database is updated.
      </p>
    );
  if (read.error) return <p className="text-danger text-[0.875rem] font-semibold">{read.error}</p>;
  const r = asObject(read.data);
  const rate = (r.nightly_rate_kes as number | null) ?? null;
  const weekend = (r.weekend_rate_kes as number | null) ?? null;
  const weekly = (r.weekly_discount_pct as number | null) ?? null;
  const monthly = (r.monthly_discount_pct as number | null) ?? null;
  const week = (r.week_quote as Quote | null) ?? null;
  const month = (r.month_quote as Quote | null) ?? null;
  const seasons = (Array.isArray(r.seasons) ? r.seasons : []) as SeasonRow[];
  return (
    <>
      <Fact icon={Coins} label="Standard Rate">
        {rate ? `${kesFull(rate)} / night` : 'On request'}
      </Fact>
      <Fact icon={Sun} label="Weekend Rate (Fri & Sat nights)">
        {weekend ? `${kesFull(weekend)} / night` : 'Same as standard'}
      </Fact>
      <Fact icon={Moon} label="Weekly (7+ nights)">
        {pctText(weekly)}
      </Fact>
      <Fact icon={CalendarDays} label="Monthly (28+ nights)">
        {pctText(monthly)}
      </Fact>
      <Fact label="7 nights from today">{week ? kesFull(week.total_kes) : '—'}</Fact>
      <Fact label="28 nights from today">{month ? kesFull(month.total_kes) : '—'}</Fact>
      <Fact icon={CalendarRange} label="Seasons">
        {seasons.length === 0
          ? 'None ahead'
          : seasons
              .map(
                (s) =>
                  `${s.name} ${signed(s.adjust_pct)} (${shortDate(s.starts_on)}–${shortDate(s.ends_on)})`,
              )
              .join('; ')}
      </Fact>
      <RateRulesButton
        variant="panel"
        unitId={unitId}
        label={label}
        weekend={weekend}
        weekly={weekly}
        monthly={monthly}
      />
      <Footnote>
        The week and month are what a guest is quoted today for those nights, seasons and discounts
        included.
      </Footnote>
    </>
  );
}

/** Rate Plans: each unit's standard, weekend and long-stay prices, editable. */
export function RatePlansCard({ rows }: { rows: RateRow[] }) {
  return (
    <DashCard title="Rate plans by unit">
      <DataTable
        caption="Each unit's rates"
        isEmpty={rows.length === 0}
        empty="No live units match."
        head={['Unit', 'Standard', 'Weekend (Fri & Sat)', 'Weekly (7+)', 'Monthly (28+)', '']}
      >
        {rows.map((r) => (
          <tr key={r.unit_id}>
            <td>
              <span className="font-bold">{r.label}</span>
              {r.property_name && (
                <span className="text-muted block text-[0.75rem] font-semibold">
                  {r.property_name}
                </span>
              )}
            </td>
            <td className="whitespace-nowrap tabular-nums">{kesFull(r.rate_kes)}</td>
            <td className="whitespace-nowrap tabular-nums">
              {r.weekend_rate_kes ? kesFull(r.weekend_rate_kes) : 'Standard'}
            </td>
            <td>{pctText(r.weekly_discount_pct)}</td>
            <td>{pctText(r.monthly_discount_pct)}</td>
            <td>
              <RateRulesButton
                unitId={r.unit_id}
                label={r.label}
                weekend={r.weekend_rate_kes ?? null}
                weekly={r.weekly_discount_pct ?? null}
                monthly={r.monthly_discount_pct ?? null}
              />
            </td>
          </tr>
        ))}
      </DataTable>
      <Footnote>
        Friday and Saturday nights are charged the weekend rate; the weekly or monthly discount
        comes off the whole stay. The standard rate is changed with Edit Rates on the unit&rsquo;s
        panel.
      </Footnote>
    </DashCard>
  );
}

/** Rate Rules: how a night is priced, and the units with rules of their own. */
export function RateRulesCard({
  rows,
  seasonsRunning,
}: {
  rows: RateRow[];
  seasonsRunning: number;
}) {
  const withRules = rows.filter(
    (r) => r.weekend_rate_kes || r.weekly_discount_pct || r.monthly_discount_pct,
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <DashCard title="How a stay is priced">
        <ol className="list-decimal space-y-2 pl-5 text-[0.875rem] font-semibold">
          <li>
            Each night starts at the unit&rsquo;s standard rate, or its weekend rate on Friday and
            Saturday nights.
          </li>
          <li>
            A season covering that night moves it by its percentage. The most specific season
            counts: the unit&rsquo;s, else its building&rsquo;s, else its city&rsquo;s, else one for
            every unit.
          </li>
          <li>
            From 28 nights the monthly discount comes off the total, else from 7 nights the weekly
            one.
          </li>
          <li>Prices are rounded to whole shillings. Stays already held keep their price.</li>
        </ol>
        <div className="mt-4">
          <Fact label="Units with a weekend rate">
            {n(rows.filter((r) => r.weekend_rate_kes).length)}
          </Fact>
          <Fact label="Units with a weekly discount">
            {n(rows.filter((r) => r.weekly_discount_pct).length)}
          </Fact>
          <Fact label="Units with a monthly discount">
            {n(rows.filter((r) => r.monthly_discount_pct).length)}
          </Fact>
          <Fact label="Seasons running today">{n(seasonsRunning)}</Fact>
        </div>
      </DashCard>
      <DashCard title="Units with their own rules">
        {withRules.length === 0 ? (
          <Empty>No unit has a weekend rate or long-stay discount yet.</Empty>
        ) : (
          <DataTable
            caption="Units with rate rules"
            isEmpty={false}
            empty=""
            head={['Unit', 'Weekend', 'Weekly', 'Monthly', '']}
          >
            {withRules.map((r) => (
              <tr key={r.unit_id}>
                <td className="font-bold">
                  {r.label}
                  {r.property_name && (
                    <span className="text-muted block text-[0.75rem] font-semibold">
                      {r.property_name}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  {r.weekend_rate_kes ? kesFull(r.weekend_rate_kes) : '—'}
                </td>
                <td>{r.weekly_discount_pct ? `${r.weekly_discount_pct}%` : '—'}</td>
                <td>{r.monthly_discount_pct ? `${r.monthly_discount_pct}%` : '—'}</td>
                <td>
                  <RateRulesButton
                    unitId={r.unit_id}
                    label={r.label}
                    weekend={r.weekend_rate_kes ?? null}
                    weekly={r.weekly_discount_pct ?? null}
                    monthly={r.monthly_discount_pct ?? null}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </DashCard>
    </div>
  );
}

/** Seasonal Pricing: every season, and the form to add one. */
export function SeasonsCard({
  seasons,
  waiting,
  error,
  options,
}: {
  seasons: unknown;
  waiting: boolean;
  error: string | null;
  options: ScopeOptions;
}) {
  const o = asObject(seasons);
  const rows = (Array.isArray(o.rows) ? o.rows : []) as SeasonRow[];
  const counts = asObject(o.counts);
  return (
    <DashCard
      title="Seasonal pricing"
      titleNote={
        waiting
          ? undefined
          : `(${n(Number(counts.current ?? 0))} running, ${n(Number(counts.upcoming ?? 0))} upcoming)`
      }
      aside={waiting ? undefined : <SeasonButton options={options} />}
    >
      {waiting ? (
        <Empty>Seasonal pricing shows here once the database is updated.</Empty>
      ) : error ? (
        <p role="alert" className="text-danger text-sm font-semibold">
          {error}
        </p>
      ) : (
        <DataTable
          caption="Seasons"
          isEmpty={rows.length === 0}
          empty="No seasons yet. Add one to raise or lower nightly rates over a range of dates."
          head={['Season', 'Nights', 'Change', 'Applies to', 'Status', '']}
        >
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="font-bold">
                {s.name}
                {s.created_by && (
                  <span className="text-muted block text-[0.75rem] font-semibold">
                    by {s.created_by}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap">
                {shortDate(s.starts_on)} – {shortDate(s.ends_on)}
              </td>
              <td
                className={`whitespace-nowrap font-bold tabular-nums ${s.adjust_pct > 0 ? 'text-[#1E7B34]' : 'text-[#C62D22]'}`}
              >
                {signed(s.adjust_pct)}
              </td>
              <td>
                {SCOPE_LABEL[s.scope]}
                {s.scope !== 'everywhere' && (
                  <span className="text-muted block text-[0.75rem] font-semibold">
                    {s.scope_name}
                  </span>
                )}
              </td>
              <td>
                <Chip
                  status={STATE_CHIP[s.state]?.status ?? 'completed'}
                  text={STATE_CHIP[s.state]?.text ?? s.state}
                />
              </td>
              <td className="whitespace-nowrap">
                {s.state !== 'ended' && s.state !== 'past' && (
                  <span className="flex gap-3">
                    <SeasonButton
                      trigger="link"
                      options={options}
                      initial={{
                        id: s.id,
                        name: s.name,
                        startsOn: s.starts_on,
                        endsOn: s.ends_on,
                        adjustPct: String(s.adjust_pct),
                        scope: s.scope,
                        scopeId: s.scope_id ?? '',
                      }}
                    />
                    <EndSeasonButton seasonId={s.id} name={s.name} />
                  </span>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <Footnote>
        A season moves each night it covers by its percentage, after the weekend rate and before any
        long-stay discount. Ending a season stops new quotes using it; stays already held or booked
        keep their price.
      </Footnote>
    </DashCard>
  );
}
