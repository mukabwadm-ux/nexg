import {
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  Coins,
  LogOut,
  Percent,
  XCircle,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ConsoleShell } from '@/components/console-shell';
import {
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  Pagination,
} from '@/components/portal/dash';
import { DashClear, DashSearch } from '@/components/portal/dash-filters';
import { LogCaseButton } from '@/components/stays/client';
import {
  Chip,
  DataTable,
  ErrorNote,
  FilterRow,
  PanelHint,
  PersonCell,
  StaysHeader,
  WaitingForDatabase,
  WithPanel,
} from '@/components/stays/module';
import { StayPanel } from '@/components/stays/stay-panel';
import {
  asNumber,
  asObject,
  kesCompact,
  kesFull,
  label,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  paged,
  shortDate,
  SOURCE_LABEL,
  staysHref,
  uuidOrNull,
  type StayRow,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Reservations' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Reservations' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'checked_in', label: 'Checked-in' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

/**
 * Stays → Reservations: every stay overlapping the period, by state, with
 * the stay's own panel. Holds and blocked dates are not reservations.
 */
export default async function ReservationsPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
    page?: string;
    selected?: string;
  };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);

  const [list, detail] = await Promise.all([
    ctx.read('rpc_console_stays_list', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_view: 'reservations',
      p_tab: tab,
      p_q: q || null,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    selected ? ctx.read('rpc_console_stay_detail', { p_stay_id: selected }) : Promise.resolve(null),
  ]);
  const rows = paged<StayRow>(list.data);
  const summary = asObject(asObject(list.data).summary);
  const keep = { tab: tab === 'all' ? null : tab, q: q || null };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/reservations', period, city, { ...keep, ...params });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Reservations"
        subtitle="Every stay booked on NexG or entered by a host, by its state."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'bookings' })}
        action={<LogCaseButton label="Log a case" />}
      />
      <DashCanvas>
        {list.waiting ? (
          <WaitingForDatabase />
        ) : list.error ? (
          <ErrorNote message={list.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-7">
              <DashKpi
                featured
                icon={CalendarCheck}
                label="Total Reservations"
                value={n(rows.counts.all ?? 0)}
                explain="Stays overlapping the period, cancelled ones included."
              />
              <DashKpi
                icon={CheckCircle2}
                label="Confirmed"
                value={n(rows.counts.confirmed ?? 0)}
                explain="Booked and due to arrive or arriving, not yet checked in."
              />
              <DashKpi
                icon={BedDouble}
                label="Checked-in (Active)"
                value={n(rows.counts.checked_in ?? 0)}
                explain="Guests in the unit now."
              />
              <DashKpi
                icon={LogOut}
                label="Checked-out"
                value={n(rows.counts.completed ?? 0)}
                explain="Stays that have ended."
              />
              <DashKpi
                icon={XCircle}
                label="Cancelled"
                value={n(rows.counts.cancelled ?? 0)}
                explain="Cancelled stays and refunds."
              />
              <DashKpi
                icon={Coins}
                label="Booking Value"
                value={kesCompact(asNumber(summary.value_kes))}
                explain="What guests paid or were quoted for the stays that were not cancelled."
              />
              <DashKpi
                icon={Percent}
                label="NexG Commission"
                value={kesCompact(asNumber(summary.commission_kes))}
                explain="Commission recorded on those stays, VAT-inclusive."
              />
            </DashKpiGrid>

            <WithPanel
              panel={
                selected && detail ? (
                  <StayPanel
                    detail={detail.data}
                    closeHref={href({ selected: null, page: String(page) })}
                  />
                ) : (
                  <PanelHint>Choose a reservation to see its details.</PanelHint>
                )
              }
            >
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Reservation state"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    count: rows.counts[t.key] ?? 0,
                    href: staysHref('/stays/reservations', period, city, {
                      tab: t.key === 'all' ? null : t.key,
                      q: q || null,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search reservations"
                    placeholder="Search by guest name, booking ref, unit, building…"
                  />
                  <DashClear params={['q', 'tab', 'selected']} />
                </FilterRow>
                <DataTable
                  caption="Reservations"
                  isEmpty={rows.rows.length === 0}
                  empty="No reservations match. Clear the filters or widen the period."
                  head={[
                    'Booking Ref',
                    'Guest',
                    'Unit & Building',
                    'Dates (Check-in → Check-out)',
                    'Nights',
                    'Amount',
                    'Status',
                    'Source',
                  ]}
                >
                  {rows.rows.map((r) => (
                    <tr
                      key={r.stay_id}
                      className={r.stay_id === selected ? 'bg-[#FFFBF0]' : undefined}
                    >
                      <td className="whitespace-nowrap font-semibold">
                        <a
                          className="hover:underline"
                          href={href({ selected: r.stay_id, page: String(page) })}
                        >
                          {r.ref}
                        </a>
                      </td>
                      <td>
                        <PersonCell
                          name={r.guest_name}
                          sub={
                            r.party > 0 ? `${r.party} guest${r.party === 1 ? '' : 's'}` : undefined
                          }
                          href={href({ selected: r.stay_id, page: String(page) })}
                        />
                      </td>
                      <td>
                        <span className="block font-bold">{r.unit_label ?? '—'}</span>
                        <span className="text-muted block text-[0.8125rem] font-semibold">
                          {r.property_name ?? ''}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        {shortDate(r.check_in)} →<br />
                        {shortDate(r.check_out)}
                      </td>
                      <td className="text-center tabular-nums">{r.nights}</td>
                      <td className="whitespace-nowrap font-bold tabular-nums">
                        {kesFull(r.value_kes)}
                      </td>
                      <td>
                        <Chip status={r.bucket ?? r.status} />
                      </td>
                      <td>{label(SOURCE_LABEL, r.source)}</td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={rows.total}
                  noun="reservations"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
              </DashCard>
            </WithPanel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
