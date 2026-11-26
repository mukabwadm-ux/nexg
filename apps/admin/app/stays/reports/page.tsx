import {
  AlertTriangle,
  BarChart3,
  BedDouble,
  Building2,
  CalendarCheck,
  Coins,
  ConciergeBell,
  Download,
  FileSpreadsheet,
  FileText,
  Handshake,
  LineChart,
  Percent,
  Star,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashCard, DashKpi, DashKpiGrid, GoldTabs } from '@/components/portal/dash';
import {
  DataTable,
  ErrorNote,
  Footnote,
  StaysHeader,
  WaitingForDatabase,
} from '@/components/stays/module';
import { todayInNairobi } from '@/lib/portal';
import {
  asMaybe,
  asNumber,
  asObject,
  delta,
  kesCompact,
  n,
  oneOf,
  pct,
  ppDelta,
  REPORTS,
  shortDate,
  staysHref,
  when,
  type ReportKey,
} from '@/lib/stays-module';
import { REPORT_TABS, ReportsView } from '@/components/stays/tab-views';
import { SavedReportsView, ScheduledReportsView } from '@/components/stays/report-plans-view';
import { plansFrom } from '@/lib/stays-report-plans';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Reports' };
export const dynamic = 'force-dynamic';

const ICON: Record<ReportKey, LucideIcon> = {
  bookings: BedDouble,
  revenue: BarChart3,
  occupancy: Building2,
  hosts: Users,
  managers: Handshake,
  units: Building2,
  guests: User,
  concierge: ConciergeBell,
  reviews: Star,
  cases: AlertTriangle,
};

interface RunRow {
  id: string;
  report: string;
  period_from: string;
  period_to: string;
  rows_exported: number;
  generated_at: string;
  generated_by_name: string | null;
}

const shift = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Stays → Reports: the report library (each a CSV or a branded PDF of the
 * period with the screen's own figures), quick reports for common periods,
 * reports emailed on a schedule, saved reports, and every export staff ran.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; city?: string; view?: string };
}) {
  const ctx = await staysContext(searchParams);
  const view = oneOf(
    ['overview', ...REPORT_TABS.map((t) => t.key).filter((k) => k !== 'library')],
    searchParams?.view,
    'overview',
  );
  const { period, city } = ctx;
  const plansNeeded = view === 'scheduled' || view === 'saved';
  const [fin, perf, runs, plansRead] = await Promise.all([
    ctx.read('rpc_console_stays_finance', { p_from: period.from, p_to: period.to, p_city: city }),
    ctx.read('rpc_console_stays_performance', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
    }),
    ctx.read('rpc_console_stays_report_runs', { p_limit: 10 }),
    plansNeeded ? ctx.read('rpc_console_stays_report_plans', {}) : null,
  ]);
  const plans = plansFrom(plansRead?.data);
  const f = asObject(asObject(fin.data).kpis);
  const rules = asObject(asObject(fin.data).rules);
  const p = asObject(asObject(perf.data).kpis);
  const recent = (Array.isArray(runs.data) ? runs.data : []) as RunRow[];
  const today = todayInNairobi();
  const exportHref = (report: string, from = period.from, to = period.to) =>
    staysHref('/stays/export', { from, to }, city, { report });
  const pdfHref = (report: string) =>
    staysHref('/stays/export', period, city, { report, format: 'pdf' });
  const quick: { label: string; href: string; icon: LucideIcon }[] = [
    { label: "Today's Bookings", href: exportHref('bookings', today, today), icon: CalendarCheck },
    {
      label: "This Week's Performance",
      href: exportHref('occupancy', shift(today, -6), today),
      icon: LineChart,
    },
    {
      label: "This Month's Revenue",
      href: exportHref('revenue', `${today.slice(0, 7)}-01`, today),
      icon: Coins,
    },
    { label: 'Top Performing Properties', href: exportHref('units'), icon: Building2 },
    { label: 'Hosts', href: exportHref('hosts'), icon: Users },
    { label: 'Open Incidents & Disputes', href: exportHref('cases'), icon: AlertTriangle },
    {
      label: `Commission Summary (${asNumber(rules.commission_pct)}%)`,
      href: exportHref('revenue'),
      icon: Percent,
    },
    { label: 'Property Managers', href: exportHref('managers'), icon: Handshake },
  ];
  const titleOf = (key: string) => REPORTS.find((r) => r.key === key)?.title ?? key;

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Reports"
        subtitle="Ready-to-use reports for the period, downloaded as spreadsheets or PDFs."
        period={period}
        cities={ctx.cities}
        city={city}
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
                icon={BedDouble}
                label="Total Bookings"
                value={n(asNumber(f.bookings))}
                delta={delta(asNumber(p.bookings), asNumber(p.bookings_prev))}
                explain="Stays checking in during the period."
              />
              <DashKpi
                icon={Coins}
                label="Booking Value (GBV)"
                value={kesCompact(asNumber(f.gbv))}
                delta={delta(asNumber(f.gbv), asNumber(f.gbv_prev))}
                explain="What those stays came to."
              />
              <DashKpi
                icon={Percent}
                label={`NexG Commission (${asNumber(rules.commission_pct)}%)`}
                value={kesCompact(asNumber(f.commission))}
                delta={delta(asNumber(f.commission), asNumber(f.commission_prev))}
                explain="Recorded on those stays."
              />
              <DashKpi
                icon={Users}
                label="Host Payouts"
                value={kesCompact(asNumber(f.host_payouts))}
                explain="The hosts' share."
              />
              <DashKpi
                icon={CalendarCheck}
                label="Management Fees"
                value={kesCompact(asNumber(f.management_fees))}
                explain="Billable by the rule in the period."
              />
              <DashKpi
                icon={LineChart}
                label="Occupancy Rate"
                value={pct(asMaybe(p.occupancy_pct))}
                deltaText={ppDelta(asMaybe(p.occupancy_pct), asMaybe(p.occupancy_prev_pct))}
                explain="Booked nights over live units × days."
              />
            </DashKpiGrid>
            <DashCard>
              <GoldTabs
                label="Reports"
                active={view === 'overview' ? 'library' : view}
                tabs={REPORT_TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  href: staysHref('/stays/reports', period, city, {
                    view: t.key === 'library' ? null : t.key,
                  }),
                }))}
              />
            </DashCard>
            {view === 'overview' ? (
              <>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <DashCard
                    title="Report Library"
                    titleNote={`(${shortDate(period.from)} – ${shortDate(period.to)})`}
                  >
                    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
                      {REPORTS.map((r) => {
                        const Icon = ICON[r.key];
                        return (
                          <li
                            key={r.key}
                            className="flex h-full flex-col items-center rounded-xl border border-[#F5E2B0] bg-[#FFFBF0] p-3 text-center"
                          >
                            <Icon
                              aria-hidden="true"
                              className="h-8 w-8 text-[#E5A800]"
                              strokeWidth={1.6}
                            />
                            <span className="mt-2 font-extrabold">{r.title}</span>
                            <span className="text-muted mt-1 text-[0.8125rem] font-semibold">
                              {r.blurb}
                            </span>
                            <span className="mt-auto flex gap-1 pt-2">
                              <a
                                href={exportHref(r.key)}
                                download
                                aria-label={`${r.title} as CSV`}
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[0.8125rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6]"
                              >
                                <Download aria-hidden="true" className="h-3.5 w-3.5" /> CSV
                              </a>
                              <a
                                href={pdfHref(r.key)}
                                download
                                aria-label={`${r.title} as PDF`}
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[0.8125rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6]"
                              >
                                <FileText aria-hidden="true" className="h-3.5 w-3.5" /> PDF
                              </a>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <Footnote>
                      The CSV opens in Excel or Google Sheets; the PDF is the same rows on the NexG
                      letterhead. Change the period in the header first.
                    </Footnote>
                  </DashCard>
                  <DashCard title="Quick Reports">
                    <ul>
                      {quick.map((qr) => (
                        <li key={qr.label} className="border-border border-b last:border-b-0">
                          <a
                            href={qr.href}
                            download
                            className="hover:bg-bg -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 font-semibold"
                          >
                            <span className="flex items-center gap-3">
                              <qr.icon
                                aria-hidden="true"
                                className="h-5 w-5 text-[#E5A800]"
                                strokeWidth={1.8}
                              />
                              {qr.label}
                            </span>
                            <span aria-hidden="true">›</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </DashCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <DashCard title="Recent Reports">
                    <DataTable
                      caption="Recent reports"
                      isEmpty={recent.length === 0}
                      empty="Nobody has exported a stays report yet."
                      head={[
                        'Report Name',
                        'Period',
                        'Generated By',
                        'Generated On',
                        'Rows',
                        'Download',
                      ]}
                    >
                      {recent.map((r) => (
                        <tr key={r.id}>
                          <td className="font-semibold">
                            <FileSpreadsheet
                              aria-hidden="true"
                              className="mr-2 inline h-4 w-4 text-[#E5A800]"
                            />
                            {titleOf(r.report)}
                          </td>
                          <td className="whitespace-nowrap">
                            {shortDate(r.period_from)} – {shortDate(r.period_to)}
                          </td>
                          <td>{r.generated_by_name ?? '—'}</td>
                          <td className="whitespace-nowrap">{when(r.generated_at)}</td>
                          <td className="tabular-nums">{n(r.rows_exported)}</td>
                          <td>
                            <a
                              className="font-bold underline"
                              href={exportHref(r.report, r.period_from, r.period_to)}
                              download
                            >
                              Again
                            </a>
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </DashCard>
                  <DashCard title="Report Actions">
                    <div className="grid gap-2">
                      <a
                        href={exportHref('bookings')}
                        download
                        className="flex h-11 items-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 font-bold text-[#8A5C00]"
                      >
                        <FileSpreadsheet aria-hidden="true" className="h-4 w-4" /> Export to
                        spreadsheet (CSV)
                      </a>
                      <a
                        href={pdfHref('bookings')}
                        download
                        className="flex h-11 items-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 font-bold text-[#8A5C00]"
                      >
                        <FileText aria-hidden="true" className="h-4 w-4" /> Export to PDF
                      </a>
                      <a
                        href={staysHref('/stays/reports', period, city, { view: 'scheduled' })}
                        className="flex h-11 items-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 font-bold text-[#8A5C00]"
                      >
                        <CalendarCheck aria-hidden="true" className="h-4 w-4" /> Schedule a report
                      </a>
                      <a
                        href={staysHref('/stays/reports', period, city, { view: 'saved' })}
                        className="flex h-11 items-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 font-bold text-[#8A5C00]"
                      >
                        <FileSpreadsheet aria-hidden="true" className="h-4 w-4" /> Saved reports
                      </a>
                    </div>
                    <Footnote>
                      The exports are the Bookings Report for the period; every other report is in
                      the library. Branded PDFs for invoices and settlements are in Finance.
                    </Footnote>
                  </DashCard>
                </div>
              </>
            ) : plansNeeded && plansRead?.waiting ? (
              <WaitingForDatabase />
            ) : plansNeeded && plansRead?.error ? (
              <ErrorNote message={plansRead.error} />
            ) : view === 'scheduled' ? (
              <ScheduledReportsView plans={plans} cities={ctx.cities} city={city} />
            ) : view === 'saved' ? (
              <SavedReportsView
                plans={plans}
                cities={ctx.cities}
                period={period}
                city={city}
                today={today}
              />
            ) : (
              <ReportsView
                view={view}
                runs={runs.data}
                period={period}
                city={city}
                cities={ctx.cities}
              />
            )}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
