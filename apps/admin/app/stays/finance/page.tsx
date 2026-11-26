import {
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  Coins,
  Handshake,
  Percent,
  Receipt,
  Settings2,
  Users,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  CardLink,
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  Pagination,
  GoldTabs,
} from '@/components/portal/dash';
import { DashClear, DashSearch } from '@/components/portal/dash-filters';
import { BarLineChart } from '@/components/stays/charts';
import {
  Chip,
  DataTable,
  Empty,
  ErrorNote,
  Fact,
  FilterRow,
  Footnote,
  PanelLine,
  PersonCell,
  StaysHeader,
  WaitingForDatabase,
} from '@/components/stays/module';
import {
  asMaybe,
  asNumber,
  asObject,
  delta,
  kesCompact,
  kesFull,
  label,
  n,
  oneOf,
  ORDER_CATEGORY_LABEL,
  PAGE_SIZE,
  pageOf,
  paged,
  staysHref,
  unitEconomics,
  when,
  type StayRow,
} from '@/lib/stays-module';
import { FINANCE_TABS, FinanceView } from '@/components/stays/tab-views';
import { feeData, ManagementFeesView } from '@/components/stays/management-fees';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Finance & Commissions' };
export const dynamic = 'force-dynamic';

const PALETTE = ['#F5A623', '#F5C842', '#C58BF2', '#2F80ED', '#9EC5F8', '#C9C4B8'];

/**
 * Stays → Finance & Commissions: what guests booked, NexG's commission (VAT
 * inside it), the property managers' share, host payouts, management fees and
 * guest orders, under the rules in Stays Configuration and Payout rules.
 */
export default async function StaysFinancePage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    q?: string;
    page?: string;
    view?: string;
  };
}) {
  const ctx = await staysContext(searchParams);
  const view = oneOf(
    ['overview', 'commissions', 'fees', 'vat'] as const,
    searchParams?.view,
    'overview',
  );
  const { period, city } = ctx;
  const q = (searchParams?.q ?? '').slice(0, 120);
  const page = pageOf(searchParams?.page);
  const [fin, list, feeRead] = await Promise.all([
    ctx.read('rpc_console_stays_finance', { p_from: period.from, p_to: period.to, p_city: city }),
    ctx.read('rpc_console_stays_list', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_view: 'finance',
      p_tab: 'all',
      p_q: q || null,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    ctx.read('rpc_console_stays_fee_invoices', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
    }),
  ]);
  const feeInfo = feeData(feeRead.data);
  const o = asObject(fin.data);
  const k = asObject(o.kpis);
  const rules = asObject(o.rules);
  const trend = (Array.isArray(o.trend) ? o.trend : []) as {
    month: string;
    value_kes: number;
    commission_kes: number;
  }[];
  const orders = (Array.isArray(o.orders_by_category) ? o.orders_by_category : []) as {
    category: string;
    kes: number;
  }[];
  const rows = paged<StayRow & { concierge_kes: number }>(list.data);
  const commission = asNumber(k.commission);
  const vat = asNumber(k.vat);
  const pmShare = asNumber(k.pm_share);
  /* Management fees invoiced for the months in the period (20270331000600). */
  const fees = asNumber(feeInfo.kpis.invoiced_kes);
  const guestOrders = asNumber(k.guest_orders_kes);
  const net = commission - vat - pmShare - asNumber(k.refunds) + fees;
  const bookings = asNumber(k.bookings);
  const avg = bookings > 0 ? asNumber(k.gbv) / bookings : null;
  const econ = unitEconomics(avg, {
    commission_pct: asNumber(rules.commission_pct),
    vat_pct: asNumber(rules.vat_pct),
    pm_share_pct: asNumber(rules.pm_share_pct),
  });
  const pmRate =
    (asNumber(rules.commission_pct) / (1 + asNumber(rules.vat_pct) / 100)) *
    (asNumber(rules.pm_share_pct) / 100);
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/finance', period, city, { q: q || null, ...params });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Finance & Commissions"
        subtitle="Booking value, NexG's commission, partner shares, host payouts and management fees."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'revenue' })}
        action={
          <Link
            href="/finance/invoices"
            className="focus-visible:ring-gold inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-4 text-[0.9375rem] font-bold text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2"
          >
            + Create Invoice
          </Link>
        }
      />
      <DashCanvas>
        {fin.waiting ? (
          <WaitingForDatabase />
        ) : fin.error ? (
          <ErrorNote message={fin.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Wallet}
                label="Gross Booking Value (GBV)"
                value={kesCompact(asNumber(k.gbv))}
                delta={delta(asNumber(k.gbv), asNumber(k.gbv_prev))}
                explain="What guests paid or were quoted for stays checking in during the period."
              />
              <DashKpi
                icon={Percent}
                label="NexG Commission"
                value={kesCompact(commission)}
                delta={delta(commission, asNumber(k.commission_prev))}
                explain={`Recorded on each paid stay at the rate then in force (${asNumber(rules.commission_pct)}% today, VAT-inclusive).`}
              />
              <DashKpi
                icon={Coins}
                label="Net Revenue (NexG)"
                value={kesCompact(net)}
                explain="Commission less VAT, the property managers' share and refunds, plus management fees invoiced for the period's months."
              />
              <DashKpi
                icon={Handshake}
                label="Partner (PM) Share"
                value={kesCompact(pmShare)}
                explain={`${asNumber(rules.pm_share_pct)}% of NexG's commission after ${asNumber(rules.vat_pct)}% VAT, on buildings with a property manager.`}
              />
              <DashKpi
                icon={Users}
                label="Host Payouts"
                value={kesCompact(asNumber(k.host_payouts))}
                explain="The hosts' share recorded on those stays."
              />
              <DashKpi
                icon={BarChart3}
                label="Take Rate (NexG)"
                value={
                  asNumber(k.gbv) > 0
                    ? `${((100 * commission) / asNumber(k.gbv)).toFixed(1)}%`
                    : '—'
                }
                explain="Commission over GBV. Stays a host entered themselves carry no commission, so this can be lower than the rate."
              />
            </DashKpiGrid>
            <DashCard>
              <GoldTabs label="Finance" active={view} tabs={FINANCE_TABS(period, city)} />
            </DashCard>
            {view === 'overview' ? (
              <>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,22rem)]">
                  <DashCard title="Revenue Overview">
                    {commission + fees + guestOrders === 0 ? (
                      <Empty>No revenue recorded in this period.</Empty>
                    ) : (
                      <ShareDonut
                        centre={kesCompact(commission + fees + guestOrders)}
                        caption="Revenue"
                        unit="kes"
                        data={[
                          {
                            key: 'commission',
                            label: 'Stays Commission',
                            value: commission,
                            color: PALETTE[0],
                          },
                          { key: 'fees', label: 'Management Fees', value: fees, color: PALETTE[1] },
                          ...orders.map((r, i) => ({
                            key: r.category,
                            label: label(ORDER_CATEGORY_LABEL, r.category),
                            value: asNumber(r.kes),
                            color: PALETTE[(i + 2) % PALETTE.length],
                          })),
                        ]}
                      />
                    )}
                    <Footnote>
                      Guest orders are the full order value, not NexG&rsquo;s cut of them.
                    </Footnote>
                  </DashCard>
                  <DashCard title="Commission Summary">
                    <DataTable
                      caption="Commission summary"
                      isEmpty={false}
                      empty=""
                      head={['Category', 'Rate (VAT incl.)', 'Booking Value', 'Commission (KES)']}
                    >
                      <tr>
                        <td className="font-semibold">Stays (Accommodation)</td>
                        <td>{asNumber(rules.commission_pct)}%</td>
                        <td className="tabular-nums">{kesCompact(asNumber(k.gbv))}</td>
                        <td className="font-bold tabular-nums">{kesCompact(commission)}</td>
                      </tr>
                      <tr>
                        <td className="font-semibold">Guest orders (concierge)</td>
                        <td>Merchant rates</td>
                        <td className="tabular-nums">{kesCompact(guestOrders)}</td>
                        <td className="text-muted">In merchant finance</td>
                      </tr>
                      <tr>
                        <td className="font-semibold">Management fees</td>
                        <td>{kesFull(asNumber(rules.management_fee_kes))} / property / month</td>
                        <td className="text-muted">—</td>
                        <td className="font-bold tabular-nums">{kesCompact(fees)}</td>
                      </tr>
                    </DataTable>
                    {asNumber(k.unrecorded_commission) > 0 && (
                      <Footnote>
                        {n(asNumber(k.unrecorded_commission))} of {n(bookings)} stays carry no
                        commission: hosts entered them, or they were paid to the host directly.
                      </Footnote>
                    )}
                  </DashCard>
                  <DashCard
                    title="Payouts & Settlements"
                    aside={
                      <CardLink href={staysHref('/stays/payouts', period, city)}>Open</CardLink>
                    }
                  >
                    <ul>
                      <PanelLine
                        icon={Users}
                        label="Total Host Payouts"
                        value={kesCompact(asNumber(k.host_payouts))}
                      />
                      <PanelLine
                        icon={Handshake}
                        label={`Property Manager (${asNumber(rules.pm_share_pct)}%)`}
                        value={kesCompact(pmShare)}
                      />
                      <PanelLine
                        icon={Receipt}
                        label="Refunds"
                        value={kesCompact(asNumber(k.refunds))}
                      />
                    </ul>
                    <p className="mt-2 flex justify-between rounded-lg bg-[#FFF4D6] px-3 py-2 font-extrabold">
                      <span>Total Payouts</span>
                      <span className="tabular-nums">
                        {kesCompact(asNumber(k.host_payouts) + pmShare)}
                      </span>
                    </p>
                  </DashCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,22rem)]">
                  <DashCard title="Booking & Commission Trend">
                    {trend.every((t) => asNumber(t.value_kes) === 0) ? (
                      <Empty>No bookings in the last six months.</Empty>
                    ) : (
                      <BarLineChart
                        data={trend.map((t) => ({
                          month: t.month,
                          bar: asNumber(t.value_kes),
                          line: asNumber(t.commission_kes),
                        }))}
                        bar={{ label: 'Booking Value', kes: true }}
                        line={{ label: 'Commission', kes: true }}
                      />
                    )}
                  </DashCard>
                  <DashCard title="Unit Economics (Per Booking)">
                    {econ ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ['Avg. Booking Value', kesFull(avg)],
                          [
                            `NexG Commission (${asNumber(rules.commission_pct)}%)`,
                            kesFull(econ.commission),
                          ],
                          [
                            `PM Share (${asNumber(rules.pm_share_pct)}% of NexG*)`,
                            kesFull(econ.pmShare),
                          ],
                          ['Net to NexG (after PM share)', kesFull(econ.net)],
                        ].map(([t, v]) => (
                          <div key={t} className="rounded-xl bg-[#FFFBF0] p-3 text-center">
                            <p className="text-muted text-[0.75rem] font-semibold">{t}</p>
                            <p className="mt-1 text-[1rem] font-extrabold tabular-nums">{v}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty>No bookings in this period to average.</Empty>
                    )}
                    <Footnote>
                      *PM share is {asNumber(rules.pm_share_pct)}% of NexG&rsquo;s commission after
                      VAT removal ({pmRate.toFixed(2)}% of the booking), only where a property
                      manager manages the building.
                    </Footnote>
                  </DashCard>
                  <DashCard
                    title="Commission Rules (Stays)"
                    aside={<CardLink href="/stays/configuration">Edit</CardLink>}
                  >
                    <Fact icon={Percent} label="NexG Commission (Stays)">
                      {asNumber(rules.commission_pct)}% (VAT-inclusive)
                    </Fact>
                    <Fact icon={Handshake} label="Property Manager Share">
                      {asNumber(rules.pm_share_pct)}% of NexG commission (after VAT removal)
                    </Fact>
                    <Fact icon={CalendarClock} label="Management Fee">
                      {kesFull(asNumber(rules.management_fee_kes))} / property / month
                    </Fact>
                    <Fact icon={Percent} label="VAT Treatment">
                      Commissions are VAT-inclusive (VAT at {asNumber(rules.vat_pct)}%)
                    </Fact>
                    <Fact icon={Settings2} label="Guest Orders">
                      {rules.guest_orders_shared
                        ? 'Shared with hosts and PMs'
                        : 'Not shared with hosts or PMs'}
                    </Fact>
                  </DashCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <DashCard title="Recent Transactions" className="min-w-0">
                    <FilterRow>
                      <DashSearch
                        value={q}
                        label="Search transactions"
                        placeholder="Search booking ref, guest, property…"
                      />
                      <DashClear params={['q']} />
                    </FilterRow>
                    <DataTable
                      caption="Recent stay transactions"
                      isEmpty={rows.rows.length === 0}
                      empty="No stays in this period."
                      head={[
                        'Date & Time',
                        'Booking Ref',
                        'Guest',
                        'Property / Unit',
                        'Booking Value',
                        'NexG Commission',
                        'PM Share',
                        'Host Payout',
                        'Status',
                      ]}
                    >
                      {rows.rows.map((r) => {
                        const share =
                          r.property_manager_id && r.commission_kes != null
                            ? Math.round(
                                (r.commission_kes / (1 + asNumber(rules.vat_pct) / 100)) *
                                  (asNumber(rules.pm_share_pct) / 100),
                              )
                            : null;
                        return (
                          <tr key={r.stay_id}>
                            <td className="whitespace-nowrap">{when(r.created_at)}</td>
                            <td className="whitespace-nowrap font-semibold">
                              <a
                                className="hover:underline"
                                href={staysHref('/stays/reservations', period, city, {
                                  selected: r.stay_id,
                                })}
                              >
                                {r.ref}
                              </a>
                            </td>
                            <td>
                              <PersonCell name={r.guest_name} />
                            </td>
                            <td>
                              {r.property_name ?? '—'}
                              <span className="text-muted block text-[0.8125rem]">
                                {r.unit_label ?? ''}
                              </span>
                            </td>
                            <td className="whitespace-nowrap tabular-nums">
                              {kesFull(r.value_kes)}
                            </td>
                            <td className="whitespace-nowrap tabular-nums">
                              {kesFull(r.commission_kes)}
                            </td>
                            <td className="whitespace-nowrap tabular-nums">
                              {share != null ? kesFull(share) : '—'}
                            </td>
                            <td className="whitespace-nowrap tabular-nums">
                              {kesFull(r.host_share_kes)}
                            </td>
                            <td>
                              <Chip
                                status={r.paid ? 'resolved' : 'pending'}
                                text={r.paid ? 'Paid' : 'Not paid via NexG'}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </DataTable>
                    <Pagination
                      page={page}
                      size={PAGE_SIZE}
                      total={rows.total}
                      noun="transactions"
                      href={(p) => href({ page: p > 1 ? String(p) : null })}
                    />
                  </DashCard>
                  <DashCard title="Management Fee (Property Management)">
                    <Fact icon={CalendarClock} label="Trial Period">
                      First {n(asNumber(rules.trial_months))} month
                      {asNumber(rules.trial_months) === 1 ? '' : 's'} free
                    </Fact>
                    <Fact icon={Coins} label="Monthly Fee (after trial)">
                      {kesFull(asNumber(rules.management_fee_kes))} per property
                    </Fact>
                    <Fact icon={Building2} label="Billable Base">
                      Per approved, listed property
                    </Fact>
                    <Fact icon={CheckCircle2} label="Active Properties">
                      {n(asNumber(k.active_properties))}
                    </Fact>
                    <Fact icon={CheckCircle2} label="Paying (past trial)">
                      {n(asNumber(k.paying_properties))}
                    </Fact>
                    <Fact icon={CheckCircle2} label="In Trial (free month)">
                      {n(asNumber(k.trial_properties))}
                    </Fact>
                    <Fact icon={Coins} label="Invoiced">
                      {kesFull(fees)}
                    </Fact>
                    <Fact icon={CheckCircle2} label="Collected">
                      {kesFull(asNumber(feeInfo.kpis.collected_kes))}
                    </Fact>
                    <Footnote>
                      Invoiced on the 1st for the month before and taken from the host&rsquo;s next
                      payout (Management Fees tab).{' '}
                      {asMaybe(k.paying_properties) === 0
                        ? 'Every property is still in its free month.'
                        : ''}
                    </Footnote>
                  </DashCard>
                </div>
              </>
            ) : view === 'fees' ? (
              feeRead.waiting ? (
                <WaitingForDatabase />
              ) : feeRead.error ? (
                <ErrorNote message={feeRead.error} />
              ) : (
                <ManagementFeesView
                  data={feeInfo}
                  feeKes={asNumber(rules.management_fee_kes)}
                  trialMonths={asNumber(rules.trial_months)}
                />
              )
            ) : (
              <FinanceView view={view} data={fin.data} />
            )}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
