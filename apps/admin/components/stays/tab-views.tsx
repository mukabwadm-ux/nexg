import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { DashCard } from '@/components/portal/dash';
import { BarLineChart } from '@/components/stays/charts';
import { NotYet } from '@/components/stays/extras';
import {
  Chip,
  DataTable,
  Empty,
  Fact,
  Footnote,
  MeterRows,
  PersonCell,
  ShareBars,
} from '@/components/stays/module';
import type { Period } from '@/lib/portal';
import {
  asMaybe,
  asNumber,
  asObject,
  kesCompact,
  kesFull,
  label,
  monthShort,
  n,
  pct,
  REPORTS,
  shareOf,
  shortDate,
  SOURCE_LABEL,
  staysHref,
  when,
} from '@/lib/stays-module';

/*
 * The second-level tabs of Finance, Payouts, Performance and Reports. Each
 * view reads the same reader output as the screen's Overview and shows one
 * part of it at full width. Server-safe.
 */

const PALETTE = ['#F5A623', '#F5C842', '#C58BF2', '#2F80ED', '#9EC5F8', '#1E9E45'];

interface HostPay {
  host_id: string;
  host_name: string;
  property_name: string | null;
  units: number;
  bookings: number;
  value_kes: number;
  commission_kes: number;
  host_share_kes: number;
  all_paid: boolean;
  rail: string | null;
  payout_verified: boolean | null;
}

interface ManagerPay {
  id: string;
  name: string;
  bookings: number;
  value_kes: number;
  commission_kes: number;
  share_kes: number;
}

/* ─────────────────────────────────────────────────────────────── finance */

export const FINANCE_TABS = (period: Period, city: string | null) => [
  { key: 'overview', label: 'Overview', href: staysHref('/stays/finance', period, city) },
  {
    key: 'commissions',
    label: 'Commissions',
    href: staysHref('/stays/finance', period, city, { view: 'commissions' }),
  },
  {
    key: 'fees',
    label: 'Management Fees',
    href: staysHref('/stays/finance', period, city, { view: 'fees' }),
  },
  {
    key: 'settlements',
    label: 'Settlements & Payouts',
    href: staysHref('/stays/payouts', period, city),
  },
  { key: 'transactions', label: 'Transactions', href: '/finance/transactions' },
  { key: 'invoices', label: 'Invoices & Receipts', href: '/finance/invoices' },
  { key: 'reconciliations', label: 'Reconciliations', href: '/finance/reconciliation' },
  {
    key: 'vat',
    label: 'VAT & Tax',
    href: staysHref('/stays/finance', period, city, { view: 'vat' }),
  },
  { key: 'reports', label: 'Reports', href: staysHref('/stays/reports', period, city) },
];

export function FinanceView({ view, data }: { view: string; data: unknown }) {
  const o = asObject(data);
  const k = asObject(o.kpis);
  const rules = asObject(o.rules);
  const hosts = (Array.isArray(o.hosts) ? o.hosts : []) as HostPay[];
  const managers = (Array.isArray(o.managers) ? o.managers : []) as ManagerPay[];
  const fees = (Array.isArray(o.fees) ? o.fees : []) as {
    id: string;
    name: string;
    listed_at: string;
    trial_ends: string;
    in_trial: boolean;
  }[];

  if (view === 'fees') {
    return (
      <DashCard title="Management Fees">
        <DataTable
          caption="Management fees by property"
          isEmpty={fees.length === 0}
          empty="No approved, listed property yet."
          head={['Property', 'Listed', 'Free trial ends', 'Status', 'Monthly fee']}
        >
          {fees.map((f) => (
            <tr key={f.id}>
              <td className="font-semibold">{f.name}</td>
              <td className="whitespace-nowrap">{shortDate(f.listed_at)}</td>
              <td className="whitespace-nowrap">{shortDate(f.trial_ends)}</td>
              <td>
                <Chip
                  status={f.in_trial ? 'pending' : 'resolved'}
                  text={f.in_trial ? 'In free trial' : 'Paying'}
                />
              </td>
              <td className="tabular-nums">{kesFull(asNumber(rules.management_fee_kes))}</td>
            </tr>
          ))}
        </DataTable>
        <Footnote>
          Billable this period: {kesFull(asNumber(k.management_fees))}. Fees are worked out by the
          rule; no fee invoices are raised automatically yet.
        </Footnote>
      </DashCard>
    );
  }

  if (view === 'vat') {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <DashCard title="VAT inside NexG's commission">
          <Fact label="Commission (VAT-inclusive)">{kesFull(asNumber(k.commission))}</Fact>
          <Fact label={`VAT at ${asNumber(rules.vat_pct)}%`}>{kesFull(asNumber(k.vat))}</Fact>
          <Fact label="Commission after VAT">{kesFull(asNumber(k.commission_ex_vat))}</Fact>
          <Fact label="Property manager share (of the above)">{kesFull(asNumber(k.pm_share))}</Fact>
          <Footnote>VAT returns and the KRA file are prepared in Finance › Reports.</Footnote>
        </DashCard>
        <DashCard title="Where to file">
          <ul className="space-y-2 text-[0.9375rem] font-semibold">
            <li>
              <Link className="underline" href="/finance/reports">
                Finance reports (VAT, withholding)
              </Link>
            </li>
            <li>
              <Link className="underline" href="/finance/invoices">
                Invoices and receipts
              </Link>
            </li>
          </ul>
        </DashCard>
      </div>
    );
  }

  /* Commissions */
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <DashCard title="Commission by Host">
        <DataTable
          caption="Commission by host"
          isEmpty={hosts.length === 0}
          empty="No bookings in this period."
          head={['Host', 'Bookings', 'Booking Value', 'NexG Commission', 'Take Rate']}
        >
          {hosts.map((h) => (
            <tr key={h.host_id}>
              <td>
                <PersonCell name={h.host_name} sub={h.property_name ?? undefined} />
              </td>
              <td className="tabular-nums">{n(h.bookings)}</td>
              <td className="tabular-nums">{kesFull(h.value_kes)}</td>
              <td className="font-bold tabular-nums">{kesFull(h.commission_kes)}</td>
              <td className="tabular-nums">{pct(shareOf(h.commission_kes, h.value_kes))}</td>
            </tr>
          ))}
        </DataTable>
      </DashCard>
      <DashCard title="Property Manager Share">
        <DataTable
          caption="Property manager share"
          isEmpty={managers.length === 0}
          empty="No managed building has a booking in this period."
          head={['Partner', 'Commission', 'Share']}
        >
          {managers.map((m) => (
            <tr key={m.id}>
              <td className="font-semibold">{m.name}</td>
              <td className="tabular-nums">{kesCompact(m.commission_kes)}</td>
              <td className="font-bold tabular-nums">{kesCompact(m.share_kes)}</td>
            </tr>
          ))}
        </DataTable>
        <Footnote>
          {asNumber(rules.pm_share_pct)}% of NexG&rsquo;s commission after {asNumber(rules.vat_pct)}
          % VAT.
        </Footnote>
      </DashCard>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── payouts */

export const PAYOUT_TABS = (period: Period, city: string | null) => [
  { key: 'overview', label: 'Overview', href: staysHref('/stays/payouts', period, city) },
  {
    key: 'payouts',
    label: 'Payouts',
    href: staysHref('/stays/payouts', period, city, { view: 'payouts' }),
  },
  { key: 'settlements', label: 'Settlements', href: '/finance/settlements' },
  {
    key: 'commissions',
    label: 'Commissions',
    href: staysHref('/stays/finance', period, city, { view: 'commissions' }),
  },
  {
    key: 'fees',
    label: 'Management Fees',
    href: staysHref('/stays/finance', period, city, { view: 'fees' }),
  },
  { key: 'reports', label: 'Reports', href: staysHref('/stays/reports', period, city) },
];

/* ─────────────────────────────────────────────────────────── performance */

export const PERFORMANCE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'occupancy', label: 'Occupancy' },
  { key: 'guests', label: 'Guests' },
  { key: 'hosts', label: 'Hosts & Properties' },
  { key: 'channels', label: 'Channels' },
  { key: 'trends', label: 'Trends & Forecast' },
] as const;

export function PerformanceView({ view, data }: { view: string; data: unknown }) {
  const o = asObject(data);
  const k = asObject(o.kpis);
  const trend = (Array.isArray(o.trend) ? o.trend : []) as {
    month: string;
    bookings: number;
    value_kes: number;
  }[];
  const areas = (Array.isArray(o.areas) ? o.areas : []) as {
    area: string;
    bookings: number;
    value_kes: number;
    commission_kes: number;
    occupancy_pct: number | null;
  }[];
  const top = (Array.isArray(o.top_properties) ? o.top_properties : []) as {
    property_id: string;
    name: string;
    area: string | null;
    units: number;
    value_kes: number;
    adr: number | null;
    occupancy_pct: number | null;
  }[];
  const channels = (Array.isArray(o.channels) ? o.channels : []) as { source: string; n: number }[];
  const seg = asObject(o.segments);
  const stars = (Array.isArray(o.stars) ? o.stars : []) as { stars: number; n: number }[];
  const ahead = (Array.isArray(o.ahead) ? o.ahead : []) as {
    month: string;
    bookings: number;
    value_kes: number;
    commission_kes: number;
  }[];
  const bookings = asNumber(k.bookings);
  const channelTotal = channels.reduce((s, c) => s + asNumber(c.n), 0);
  const starTotal = stars.reduce((s, x) => s + asNumber(x.n), 0);
  const chart = (bar: 'bookings' | 'value_kes', line: 'bookings' | 'value_kes') =>
    trend.every((t) => asNumber(t.bookings) === 0) ? (
      <Empty>No bookings in the last six months.</Empty>
    ) : (
      <BarLineChart
        height={300}
        data={trend.map((t) => ({
          month: t.month,
          bar: asNumber(t[bar]),
          line: asNumber(t[line]),
        }))}
        bar={{ label: bar === 'bookings' ? 'Bookings' : 'Booking Value', kes: bar === 'value_kes' }}
        line={{
          label: line === 'bookings' ? 'Bookings' : 'Booking Value',
          kes: line === 'value_kes',
        }}
      />
    );

  if (view === 'bookings' || view === 'revenue') {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <DashCard title={view === 'bookings' ? 'Bookings by Month' : 'Booking Value by Month'}>
          {chart(
            view === 'bookings' ? 'bookings' : 'value_kes',
            view === 'bookings' ? 'value_kes' : 'bookings',
          )}
        </DashCard>
        <DashCard title="By Area">
          <DataTable
            caption="By area"
            isEmpty={areas.length === 0}
            empty="No bookings in this period."
            head={['Area', 'Bookings', 'Booking Value', 'Commission']}
          >
            {areas.map((a) => (
              <tr key={a.area}>
                <td className="font-semibold">{a.area}</td>
                <td className="tabular-nums">{n(a.bookings)}</td>
                <td className="tabular-nums">{kesCompact(a.value_kes)}</td>
                <td className="tabular-nums">{kesCompact(a.commission_kes)}</td>
              </tr>
            ))}
          </DataTable>
          <Fact label="ADR (period)">{kesFull(asMaybe(k.adr))}</Fact>
          <Fact label="RevPAR (period)">{kesFull(asMaybe(k.revpar))}</Fact>
        </DashCard>
      </div>
    );
  }
  if (view === 'occupancy') {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <DashCard title="Occupancy Rate">
          <ShareDonut
            stacked
            centre={pct(asMaybe(k.occupancy_pct))}
            data={[
              {
                key: 'occ',
                label: 'Booked nights',
                value: asMaybe(k.occupancy_pct) ?? 0,
                color: '#F5A623',
              },
              {
                key: 'free',
                label: 'Free nights',
                value: Math.max(0, 100 - (asMaybe(k.occupancy_pct) ?? 0)),
                color: '#EFEDE8',
              },
            ]}
          />
          <Fact label="Period before">{pct(asMaybe(k.occupancy_prev_pct))}</Fact>
        </DashCard>
        <DashCard title="Occupancy by Area">
          <MeterRows
            empty="No bookings in this period."
            rows={areas.map((a) => ({
              label: a.area,
              value: a.occupancy_pct,
              text: pct(a.occupancy_pct),
              tone: 'gold' as const,
            }))}
          />
        </DashCard>
      </div>
    );
  }
  if (view === 'guests') {
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        <DashCard title="Guest Segments">
          {bookings === 0 ? (
            <Empty>No bookings in this period.</Empty>
          ) : (
            <ShareDonut
              centre={n(bookings)}
              caption="Bookings"
              data={[
                {
                  key: 'long',
                  label: 'Long Stays (7+ nights)',
                  value: asNumber(seg.long),
                  color: PALETTE[0],
                },
                {
                  key: 'couples',
                  label: 'Couples',
                  value: asNumber(seg.couples),
                  color: PALETTE[1],
                },
                {
                  key: 'groups',
                  label: 'Groups & Families',
                  value: asNumber(seg.groups),
                  color: PALETTE[2],
                },
                {
                  key: 'solo',
                  label: 'Solo / unknown party',
                  value: asNumber(seg.solo),
                  color: PALETTE[3],
                },
              ]}
            />
          )}
        </DashCard>
        <DashCard title="Guest Ratings">
          <MeterRows
            empty="No ratings yet."
            rows={
              starTotal === 0
                ? []
                : stars.map((s) => ({
                    label: `${s.stars} ★`,
                    value: shareOf(asNumber(s.n), starTotal),
                    text: pct(shareOf(asNumber(s.n), starTotal), 0),
                    tone: 'gold' as const,
                  }))
            }
          />
        </DashCard>
        <DashCard title="Loyalty">
          <Fact label="Repeat guest rate">{pct(asMaybe(k.repeat_pct))}</Fact>
          <Fact label="Guest satisfaction (4–5★)">{pct(asMaybe(k.satisfaction_pct))}</Fact>
          <Fact label="Avg. length of stay">
            {asMaybe(k.avg_nights) == null ? '—' : `${asMaybe(k.avg_nights)} nights`}
          </Fact>
          <Footnote>
            Repeat guests are matched by the name on the booking, so this is approximate.
          </Footnote>
        </DashCard>
      </div>
    );
  }
  if (view === 'hosts') {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <DashCard title="Top Performing Properties">
          <DataTable
            caption="Top properties"
            isEmpty={top.length === 0}
            empty="No bookings in this period."
            head={['Property', 'Units', 'Occupancy', 'ADR', 'Revenue']}
          >
            {top.map((t) => (
              <tr key={t.property_id}>
                <td className="font-semibold">{t.name}</td>
                <td className="tabular-nums">{n(t.units)}</td>
                <td className="tabular-nums">{pct(t.occupancy_pct, 0)}</td>
                <td className="tabular-nums">{kesFull(t.adr)}</td>
                <td className="tabular-nums">{kesCompact(t.value_kes)}</td>
              </tr>
            ))}
          </DataTable>
        </DashCard>
        <DashCard title="Hosts & Partners">
          <Fact label="Active hosts">{n(asNumber(k.active_hosts))}</Fact>
          <Fact label="Property managers">{n(asNumber(k.managers))}</Fact>
          <Fact label="Avg. host rating">
            {asMaybe(k.host_rating) == null ? '—' : `${asMaybe(k.host_rating)!.toFixed(1)} / 5`}
          </Fact>
          <Fact label="Active properties">{n(asNumber(k.active_properties))}</Fact>
          <Fact label="Active units">{n(asNumber(k.active_units))}</Fact>
        </DashCard>
      </div>
    );
  }
  if (view === 'channels') {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <DashCard title="Channel Performance">
          <ShareBars
            empty="No bookings in this period."
            rows={channels.map((c) => ({
              label: label(SOURCE_LABEL, c.source),
              value: asNumber(c.n),
              text: `${n(asNumber(c.n))} (${pct(shareOf(asNumber(c.n), channelTotal), 0)})`,
            }))}
          />
        </DashCard>
        <DashCard title="Channel Mix">
          {channelTotal === 0 ? (
            <Empty>No bookings in this period.</Empty>
          ) : (
            <ShareDonut
              centre={n(channelTotal)}
              caption="Bookings"
              data={channels.map((c, i) => ({
                key: c.source,
                label: label(SOURCE_LABEL, c.source),
                value: asNumber(c.n),
                color: PALETTE[i % PALETTE.length],
              }))}
            />
          )}
        </DashCard>
      </div>
    );
  }
  /* trends */
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <DashCard title="Bookings & Revenue Trend (6 months)">
        {chart('bookings', 'value_kes')}
      </DashCard>
      <DashCard title="Booked Ahead (Next 3 Months)">
        <DataTable
          caption="Booked ahead"
          isEmpty={false}
          empty=""
          head={['Metric', ...ahead.map((a) => monthShort(a.month))]}
        >
          <tr>
            <td className="font-semibold">Bookings</td>
            {ahead.map((a) => (
              <td key={a.month} className="tabular-nums">
                {n(a.bookings)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="font-semibold">Booking Value</td>
            {ahead.map((a) => (
              <td key={a.month} className="tabular-nums">
                {kesCompact(a.value_kes)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="font-semibold">NexG Commission</td>
            {ahead.map((a) => (
              <td key={a.month} className="tabular-nums">
                {kesCompact(a.commission_kes)}
              </td>
            ))}
          </tr>
        </DataTable>
        <Footnote>
          Confirmed stays already booked for those months. NexG does not forecast; this is what is
          on the books.
        </Footnote>
      </DashCard>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── reports */

export const REPORT_TABS = [
  { key: 'library', label: 'Report Library' },
  { key: 'scheduled', label: 'Scheduled Reports' },
  { key: 'saved', label: 'Saved Reports' },
  { key: 'custom', label: 'Custom Reports' },
  { key: 'history', label: 'Exports & History' },
] as const;

interface RunRow {
  id: string;
  report: string;
  period_from: string;
  period_to: string;
  rows_exported: number;
  generated_at: string;
  generated_by_name: string | null;
}

export function ReportsView({
  view,
  runs,
  period,
  city,
  cities,
}: {
  view: string;
  runs: unknown;
  period: Period;
  city: string | null;
  cities: { id: string; name: string }[];
}) {
  if (view === 'scheduled' || view === 'saved') {
    return (
      <DashCard>
        <NotYet title={view === 'scheduled' ? 'No scheduled reports yet' : 'No saved reports yet'}>
          {view === 'scheduled'
            ? 'Reports that email themselves on a schedule are not built yet. Every report in the library downloads on demand for any period.'
            : 'Saving a report’s settings is not built yet. Custom Reports builds one for any period and city in a click.'}
        </NotYet>
      </DashCard>
    );
  }
  if (view === 'custom') {
    const control =
      'border-border-strong bg-surface h-11 w-full rounded-xl border px-3 text-[0.9375rem] font-semibold';
    return (
      <DashCard title="Create a Custom Report">
        {/* A plain GET form: the export route reads the same fields as the screens' links. */}
        <form
          action="/stays/export"
          method="get"
          className="grid max-w-[44rem] gap-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Report
            <select name="report" className={control} defaultValue="bookings">
              {REPORTS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            City
            <select name="city" className={control} defaultValue={city ?? ''}>
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            From
            <input
              type="date"
              name="from"
              required
              defaultValue={period.from}
              className={control}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            To
            <input type="date" name="to" required defaultValue={period.to} className={control} />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="focus-visible:ring-gold inline-flex h-11 items-center rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-5 font-bold text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2"
            >
              Download report (CSV)
            </button>
          </div>
        </form>
        <Footnote>The download is logged under Exports & History.</Footnote>
      </DashCard>
    );
  }
  /* history */
  const rows = (Array.isArray(runs) ? runs : []) as RunRow[];
  const title = (key: string) => REPORTS.find((r) => r.key === key)?.title ?? key;
  return (
    <DashCard title="Exports & History">
      <DataTable
        caption="Exports"
        isEmpty={rows.length === 0}
        empty="Nobody has exported a stays report yet."
        head={['Report', 'Period', 'Generated By', 'Generated On', 'Rows', 'Download']}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-semibold">{title(r.report)}</td>
            <td className="whitespace-nowrap">
              {shortDate(r.period_from)} – {shortDate(r.period_to)}
            </td>
            <td>{r.generated_by_name ?? '—'}</td>
            <td className="whitespace-nowrap">{when(r.generated_at)}</td>
            <td className="tabular-nums">{n(r.rows_exported)}</td>
            <td>
              <a
                className="font-bold underline"
                download
                href={staysHref('/stays/export', { from: r.period_from, to: r.period_to }, city, {
                  report: r.report,
                })}
              >
                Again
              </a>
            </td>
          </tr>
        ))}
      </DataTable>
    </DashCard>
  );
}

const RAIL: Record<string, string> = {
  mpesa_phone: 'M-PESA',
  mpesa_till: 'M-PESA Till',
  mpesa_paybill: 'M-PESA Paybill',
  bank: 'Bank',
};

/** Payouts: every host's split for the period, and where they are paid. */
export function PayoutsView({ data }: { data: unknown }) {
  const o = asObject(data);
  const hosts = (Array.isArray(o.hosts) ? o.hosts : []) as HostPay[];
  return (
    <DashCard title="Host Payouts (period)">
      <DataTable
        caption="Host payouts"
        isEmpty={hosts.length === 0}
        empty="No host has a booking in this period."
        head={[
          'Host / Property',
          'Bookings',
          'Booking Value (KES)',
          'NexG Commission',
          'Host Payout',
          'Payout details',
          'Method',
        ]}
      >
        {hosts.map((h) => (
          <tr key={h.host_id}>
            <td>
              <PersonCell
                name={h.host_name}
                sub={`${h.property_name ?? ''} – ${n(h.units)} units`}
              />
            </td>
            <td className="tabular-nums">{n(h.bookings)}</td>
            <td className="tabular-nums">{n(h.value_kes)}</td>
            <td className="tabular-nums">{n(h.commission_kes)}</td>
            <td className="font-bold tabular-nums">{n(h.host_share_kes)}</td>
            <td>
              <Chip
                status={h.payout_verified ? 'resolved' : 'pending'}
                text={h.payout_verified ? 'Verified' : 'Not verified'}
              />
            </td>
            <td>{h.rail ? (RAIL[h.rail] ?? h.rail) : '—'}</td>
          </tr>
        ))}
      </DataTable>
      <Footnote>
        Paying hosts is Finance&rsquo;s weekly payout run (Finance › Settlements & Payouts).
      </Footnote>
    </DashCard>
  );
}
