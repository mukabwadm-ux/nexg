import {
  Ban,
  CalendarClock,
  CheckCircle2,
  Coins,
  Gift,
  Handshake,
  Percent,
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
  SegmentTabs,
  GoldTabs,
} from '@/components/portal/dash';
import {
  Chip,
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
  PersonCell,
  StaysHeader,
  WaitingForDatabase,
} from '@/components/stays/module';
import {
  asNumber,
  asObject,
  delta,
  kesCompact,
  kesFull,
  n,
  oneOf,
  pct,
  shareOf,
  staysHref,
} from '@/lib/stays-module';
import { PAYOUT_TABS, PayoutsView } from '@/components/stays/tab-views';
import { feeData } from '@/components/stays/management-fees';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Payouts & Settlements' };
export const dynamic = 'force-dynamic';

interface HostPayRow {
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

interface ManagerPayRow {
  id: string;
  name: string;
  bookings: number;
  value_kes: number;
  commission_kes: number;
  share_kes: number;
}

const RAIL: Record<string, string> = {
  mpesa_phone: 'M-PESA',
  mpesa_till: 'M-PESA Till',
  mpesa_paybill: 'M-PESA Paybill',
  bank: 'Bank',
};

/**
 * Stays → Payouts & Settlements: how the period's booking value splits
 * between hosts, NexG and property managers, by host and by manager, and the
 * management fees. Paying hosts is the weekly payout run in Finance.
 */
export default async function PayoutsPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; city?: string; by?: string; view?: string };
}) {
  const ctx = await staysContext(searchParams);
  const view = oneOf(['overview', 'payouts'] as const, searchParams?.view, 'overview');
  const { period, city } = ctx;
  const by = oneOf(['host', 'manager'] as const, searchParams?.by, 'host');
  const args = { p_from: period.from, p_to: period.to, p_city: city };
  const [fin, feeRead] = await Promise.all([
    ctx.read('rpc_console_stays_finance', args),
    ctx.read('rpc_console_stays_fee_invoices', args),
  ]);
  /* Management fee invoices and what payout runs took (20270332000600). */
  const feeInfo = feeData(feeRead.data);
  const feeTaken = (hostId: string) => {
    const d = feeInfo.deductions[hostId];
    return d ? asNumber(d.booked_kes) + asNumber(d.pending_kes) : 0;
  };
  const o = asObject(fin.data);
  const k = asObject(o.kpis);
  const rules = asObject(o.rules);
  const hosts = (Array.isArray(o.hosts) ? o.hosts : []) as HostPayRow[];
  const managers = (Array.isArray(o.managers) ? o.managers : []) as ManagerPayRow[];
  const gbv = asNumber(k.gbv);
  const commission = asNumber(k.commission);
  const hostShare = asNumber(k.host_payouts);
  const pmShare = asNumber(k.pm_share);
  const fees = asNumber(feeInfo.kpis.invoiced_kes);
  const feesCollected = asNumber(feeInfo.kpis.collected_kes);
  const settled = asNumber(k.settled_hosts);
  const inPeriod = asNumber(k.hosts_in_period);

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Payouts & Settlements"
        subtitle="How booking value splits between hosts, NexG and property managers, and what is settled."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'revenue' })}
        action={
          <Link
            href="/finance/settlements"
            className="focus-visible:ring-gold inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-4 text-[0.9375rem] font-bold text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2"
          >
            Open the payout run
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
                label="Booking Value (GBV)"
                value={kesCompact(gbv)}
                delta={delta(gbv, asNumber(k.gbv_prev))}
                explain="Accommodation bookings checking in during the period."
              />
              <DashKpi
                icon={Percent}
                label={`NexG Commission (${asNumber(rules.commission_pct)}%)`}
                value={kesCompact(commission)}
                delta={delta(commission, asNumber(k.commission_prev))}
                explain="Commission recorded on those stays."
              />
              <DashKpi
                icon={Users}
                label="Total Host Payouts"
                value={kesCompact(hostShare)}
                explain="The hosts' share of those stays."
              />
              <DashKpi
                icon={Handshake}
                label={`PM Commissions (${asNumber(rules.pm_share_pct)}%)`}
                value={kesCompact(pmShare)}
                explain="Of NexG's commission after VAT removal, for managed buildings."
              />
              <DashKpi
                icon={CalendarClock}
                label="Management Fees"
                value={kesCompact(fees)}
                href={staysHref('/stays/finance', period, city, { view: 'fees' })}
                explain={`Invoiced for the period's months (${kesFull(asNumber(rules.management_fee_kes))} / property / month after the free trial), and collected from payouts or by M-Pesa.`}
              >
                <span className="text-muted text-[0.8125rem] font-semibold">
                  {kesCompact(feesCollected)} collected
                </span>
              </DashKpi>
              <DashKpi
                icon={CheckCircle2}
                label="Settlements Completed"
                value={pct(shareOf(settled, inPeriod), 0)}
                explain="Hosts in the period whose stays were all paid through NexG and whose payout details Finance verified."
              >
                <span className="text-muted text-[0.8125rem] font-semibold">
                  {n(settled)} of {n(inPeriod)} hosts
                </span>
              </DashKpi>
            </DashKpiGrid>
            <DashCard>
              <GoldTabs label="Payouts" active={view} tabs={PAYOUT_TABS(period, city)} />
            </DashCard>
            {view === 'overview' ? (
              <>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,22rem)]">
                  <DashCard title="Settlement Overview (Period)">
                    {gbv === 0 ? (
                      <Empty>No bookings in this period.</Empty>
                    ) : (
                      <ShareDonut
                        centre={kesCompact(gbv)}
                        caption="Booking Value"
                        unit="kes"
                        data={[
                          {
                            key: 'host',
                            label: 'Host Payouts',
                            value: hostShare,
                            color: '#F5A623',
                          },
                          {
                            key: 'nexg',
                            label: 'NexG Commission',
                            value: Math.max(0, commission - pmShare),
                            color: '#1A1A1A',
                          },
                          {
                            key: 'pm',
                            label: 'PM Commission (of NexG)',
                            value: pmShare,
                            color: '#F5C842',
                          },
                          {
                            key: 'other',
                            label: 'Not split (paid to the host)',
                            value: Math.max(0, gbv - hostShare - commission),
                            color: '#C9C4B8',
                          },
                        ]}
                      />
                    )}
                  </DashCard>
                  <DashCard title="Commission Breakdown" titleNote="(Accommodation Only)">
                    <DataTable
                      caption="Commission breakdown"
                      isEmpty={false}
                      empty=""
                      head={['Item', 'Rate', 'Amount (KES)']}
                    >
                      <tr>
                        <td className="font-semibold">NexG Commission (Booking)</td>
                        <td>{asNumber(rules.commission_pct)}%</td>
                        <td className="font-bold tabular-nums">{n(commission)}</td>
                      </tr>
                      <tr>
                        <td className="font-semibold">Property Manager Commission</td>
                        <td>
                          {asNumber(rules.pm_share_pct)}% of NexG commission (after VAT removal)
                        </td>
                        <td className="font-bold tabular-nums">{n(pmShare)}</td>
                      </tr>
                      <tr>
                        <td className="font-semibold">VAT inside NexG commission</td>
                        <td>{asNumber(rules.vat_pct)}%</td>
                        <td className="font-bold tabular-nums">{n(asNumber(k.vat))}</td>
                      </tr>
                    </DataTable>
                    <p className="mt-3 rounded-lg bg-[#FFF4D6] p-3 text-[0.8125rem] font-semibold text-[#8A5C00]">
                      Commissions apply only to accommodation bookings.
                    </p>
                  </DashCard>
                  <DashCard
                    title="Payout Rules & Business Logic"
                    aside={<CardLink href="/stays/configuration">Edit</CardLink>}
                  >
                    <ul className="space-y-2.5 text-[0.875rem]">
                      <li className="flex gap-2">
                        <CheckCircle2
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#1E9E45]"
                        />
                        <span>
                          <b>NexG commission:</b> {asNumber(rules.commission_pct)}% of each
                          accommodation booking (VAT-inclusive).
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#1E9E45]"
                        />
                        <span>
                          <b>Property manager:</b> {asNumber(rules.pm_share_pct)}% of NexG
                          commission after VAT removal.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#1E9E45]"
                        />
                        <span>
                          <b>Management fee:</b> {kesFull(asNumber(rules.management_fee_kes))} per
                          property / month after a {n(asNumber(rules.trial_months))}-month free
                          trial.
                        </span>
                      </li>
                      <li className="flex gap-2 rounded-lg bg-[#FDE7E5] p-2">
                        <Ban
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#C62D22]"
                        />
                        <span>
                          <b>No payout</b> is made for guest orders (food, groceries, transfers,
                          services). These are not shared with hosts or PMs.
                        </span>
                      </li>
                    </ul>
                  </DashCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <DashCard className="min-w-0" title="Payouts & Settlements">
                    <SegmentTabs
                      label="Group by"
                      active={by}
                      tabs={[
                        {
                          key: 'host',
                          label: 'By Host',
                          href: staysHref('/stays/payouts', period, city, {}),
                        },
                        {
                          key: 'manager',
                          label: 'By Property Manager',
                          href: staysHref('/stays/payouts', period, city, { by: 'manager' }),
                        },
                      ]}
                    />
                    <div className="mt-3">
                      {by === 'host' ? (
                        <DataTable
                          caption="Payouts by host"
                          isEmpty={hosts.length === 0}
                          empty="No host has a booking in this period."
                          head={[
                            'Host / Property',
                            'Bookings',
                            'Booking Value (KES)',
                            'NexG Commission',
                            'Host Payout',
                            'Fee Deducted',
                            'Status',
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
                              <td className="text-center tabular-nums">{n(h.bookings)}</td>
                              <td className="tabular-nums">{n(h.value_kes)}</td>
                              <td className="tabular-nums">{n(h.commission_kes)}</td>
                              <td className="font-bold tabular-nums">{n(h.host_share_kes)}</td>
                              <td className="tabular-nums">
                                {feeTaken(h.host_id) > 0 ? `− ${n(feeTaken(h.host_id))}` : '—'}
                              </td>
                              <td>
                                <Chip
                                  status={
                                    h.all_paid && h.payout_verified
                                      ? 'resolved'
                                      : h.payout_verified
                                        ? 'in_progress'
                                        : 'pending'
                                  }
                                  text={
                                    h.all_paid && h.payout_verified
                                      ? 'Settled'
                                      : h.payout_verified
                                        ? 'In Payout'
                                        : 'Details not verified'
                                  }
                                />
                              </td>
                              <td>{h.rail ? (RAIL[h.rail] ?? h.rail) : '—'}</td>
                            </tr>
                          ))}
                        </DataTable>
                      ) : (
                        <DataTable
                          caption="Payouts by property manager"
                          isEmpty={managers.length === 0}
                          empty="No managed building has a booking in this period."
                          head={[
                            'Property Manager',
                            'Bookings',
                            'Booking Value (KES)',
                            'NexG Commission',
                            'PM Share',
                          ]}
                        >
                          {managers.map((m) => (
                            <tr key={m.id}>
                              <td>
                                <PersonCell name={m.name} />
                              </td>
                              <td className="text-center tabular-nums">{n(m.bookings)}</td>
                              <td className="tabular-nums">{n(m.value_kes)}</td>
                              <td className="tabular-nums">{n(m.commission_kes)}</td>
                              <td className="font-bold tabular-nums">{n(m.share_kes)}</td>
                            </tr>
                          ))}
                        </DataTable>
                      )}
                    </div>
                    <Footnote>
                      Hosts are paid in Finance&rsquo;s weekly payout run once their payout details
                      are verified (Hotels › Hosts). Fee Deducted is the management fee the
                      period&rsquo;s runs take from the host&rsquo;s payout.
                    </Footnote>
                  </DashCard>
                  <div className="grid content-start gap-4">
                    <DashCard
                      title="Management Fee Status"
                      aside={
                        <CardLink
                          href={staysHref('/stays/finance', period, city, { view: 'fees' })}
                        >
                          View All
                        </CardLink>
                      }
                    >
                      <div className="grid grid-cols-2 gap-2 text-center">
                        {[
                          [Coins, 'Active Properties (Paying)', n(asNumber(k.paying_properties))],
                          [Gift, 'On Free Trial', n(asNumber(k.trial_properties))],
                          [CalendarClock, 'Management Fees (Invoiced)', kesCompact(fees)],
                          [CheckCircle2, 'Management Fees (Collected)', kesCompact(feesCollected)],
                        ].map(([Icon, t, v]) => {
                          const I = Icon as typeof Coins;
                          return (
                            <div key={String(t)} className="rounded-xl bg-[#FFFBF0] p-2">
                              <I aria-hidden="true" className="mx-auto h-5 w-5 text-[#E5A800]" />
                              <p className="text-[1.0625rem] font-extrabold">{String(v)}</p>
                              <p className="text-muted text-[0.75rem] font-semibold">{String(t)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </DashCard>
                    <DashCard title="Guest Orders (Concierge, Food, Services)">
                      <p className="text-[0.875rem] font-semibold leading-relaxed">
                        Guest orders ({kesCompact(asNumber(k.guest_orders_kes))} this period) are
                        handled directly by NexG and are <b>not shared</b> with hosts or property
                        managers.
                      </p>
                    </DashCard>
                  </div>
                </div>
              </>
            ) : (
              <PayoutsView data={fin.data} deductions={feeInfo.deductions} />
            )}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
