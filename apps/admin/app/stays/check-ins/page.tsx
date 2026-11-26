import { BedDouble, Clock, LogIn, LogOut, RefreshCw } from 'lucide-react';
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
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import {
  Chip,
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  GoldLink,
  PanelHint,
  PersonCell,
  StaysHeader,
  WaitingForDatabase,
  WithPanel,
} from '@/components/stays/module';
import { StayPanel, STAY_PANEL_TABS } from '@/components/stays/stay-panel';
import {
  asMaybe,
  asNumber,
  asObject,
  clock,
  FILTER_WINDOW,
  filterOf,
  label,
  minuteClock,
  n,
  oneOf,
  optionsFrom,
  PAGE_SIZE,
  pageOf,
  pageSlice,
  paged,
  pct,
  shareOf,
  shortDate,
  SOURCE_LABEL,
  staysHref,
  uuidOrNull,
  type StayRow,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Check-ins & Check-outs' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'arrivals', label: 'Arrivals / Check-ins' },
  { key: 'departures', label: 'Departures / Check-outs' },
  { key: 'in_house', label: 'In-house' },
  { key: 'no_shows', label: 'No-shows' },
] as const;

const partyTag = (party: number) =>
  party >= 3 ? 'Group / Family' : party === 2 ? 'Couple' : party === 1 ? 'Solo' : undefined;

/**
 * Stays → Check-ins & Check-outs: who arrives and leaves today, who is in,
 * and confirmed stays whose check-in day passed with nobody checked in.
 * Today is Nairobi's today; the period is not used here.
 */
export default async function CheckInsPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
    building?: string;
    status?: string;
    page?: string;
    selected?: string;
    ptab?: string;
  };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'today',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const building = filterOf(searchParams?.building);
  const status = filterOf(searchParams?.status);
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);
  const ptab = oneOf(['stay', ...STAY_PANEL_TABS.map((t) => t.key)], searchParams?.ptab, 'stay');

  const [list, detail] = await Promise.all([
    ctx.read('rpc_console_stays_list', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_view: 'checkins',
      p_tab: tab,
      p_q: q || null,
      p_page: 1,
      p_size: FILTER_WINDOW,
    }),
    selected ? ctx.read('rpc_console_stay_detail', { p_stay_id: selected }) : Promise.resolve(null),
  ]);
  const all = paged<StayRow>(list.data);
  const filtered = all.rows.filter(
    (r) => (!building || r.property_name === building) && (!status || r.status === status),
  );
  const rows = pageSlice(filtered, page, PAGE_SIZE);
  const s = asObject(asObject(list.data).summary);
  const arrivals = all.counts.arrivals ?? 0;
  const departures = all.counts.departures ?? 0;
  const keep = { tab: tab === 'today' ? null : tab, q: q || null, building, status };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/check-ins', period, city, { ...keep, ...params });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Check-ins & Check-outs"
        subtitle="Today's arrivals and departures, guests in-house and no-shows."
        period={period}
        cities={ctx.cities}
        city={city}
        noPeriod
        action={
          <GoldLink href={href({ tab: 'arrivals', selected: null, page: null })} icon={LogIn}>
            Record Check-in / Check-out
          </GoldLink>
        }
      />
      <DashCanvas>
        {list.waiting ? (
          <WaitingForDatabase />
        ) : list.error ? (
          <ErrorNote message={list.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={LogIn}
                label="Today's Check-ins"
                value={n(arrivals)}
                explain="Stays whose check-in day is today."
              />
              <DashKpi
                icon={LogOut}
                label="Today's Check-outs"
                value={n(departures)}
                explain="Stays whose check-out day is today."
              />
              <DashKpi
                icon={BedDouble}
                label="In-house Guests"
                value={n(asNumber(s.guests_in_house))}
                explain="Guests in stays that are checked in now (party size)."
              />
              <DashKpi
                icon={RefreshCw}
                label="Turnover Rate"
                value={pct(shareOf(departures, all.counts.in_house ?? 0))}
                explain="Today's check-outs over the stays in-house."
              />
              <DashKpi
                icon={Clock}
                label="Avg. Check-in Time"
                value={minuteClock(asMaybe(s.avg_check_in_min))}
                explain="When check-ins on these stays were recorded, on average (Nairobi time)."
              />
              <DashKpi
                icon={Clock}
                label="Avg. Check-out Time"
                value={minuteClock(asMaybe(s.avg_check_out_min))}
                explain="When check-outs were recorded, on average."
              />
            </DashKpiGrid>

            <WithPanel
              panel={
                selected && detail ? (
                  <StayPanel
                    detail={detail.data}
                    variant="checkin"
                    closeHref={href({ selected: null })}
                    tab={ptab}
                    tabHref={(k) => href({ selected, ptab: k === 'overview' ? 'stay' : k })}
                  />
                ) : (
                  <PanelHint>Choose a stay to record its check-in or check-out.</PanelHint>
                )
              }
            >
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Arrivals and departures"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    count: all.counts[t.key] ?? 0,
                    href: staysHref('/stays/check-ins', period, city, {
                      ...keep,
                      tab: t.key === 'today' ? null : t.key,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search stays"
                    placeholder="Search by guest, booking ref, unit, building…"
                  />
                  <DashSelect
                    label="Building"
                    param="building"
                    value={building ?? 'all'}
                    options={optionsFrom(all.rows, (r) => r.property_name)}
                  />
                  <DashSelect
                    label="Status"
                    param="status"
                    value={status ?? 'all'}
                    options={[
                      { value: 'booked', label: 'Confirmed' },
                      { value: 'in_stay', label: 'Checked-in' },
                      { value: 'departed', label: 'Checked-out' },
                    ]}
                  />
                  <DashClear params={['q', 'tab', 'building', 'status', 'selected']} />
                </FilterRow>
                <DataTable
                  caption="Check-ins and check-outs"
                  isEmpty={rows.length === 0}
                  empty="Nobody arrives or leaves in this view today."
                  head={[
                    'Booking Ref',
                    'Guest',
                    'Unit & Building',
                    'Check-in',
                    'Check-out',
                    'Nights',
                    'Status',
                    'Method',
                  ]}
                >
                  {rows.map((r) => (
                    <tr
                      key={r.stay_id}
                      className={r.stay_id === selected ? 'bg-[#FFFBF0]' : undefined}
                    >
                      <td className="whitespace-nowrap font-semibold">{r.ref}</td>
                      <td>
                        <PersonCell
                          name={r.guest_name}
                          sub={partyTag(r.party)}
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
                        {shortDate(r.check_in)}
                        <span className="text-muted block text-[0.8125rem]">
                          {r.checked_in_at ? clock(r.checked_in_at) : clock(r.check_in)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        {shortDate(r.check_out)}
                        <span className="text-muted block text-[0.8125rem]">
                          {r.checked_out_at ? clock(r.checked_out_at) : clock(r.check_out)}
                        </span>
                      </td>
                      <td className="text-center tabular-nums">{r.nights}</td>
                      <td>
                        <Chip status={r.status} />
                      </td>
                      <td>{r.paid ? 'Paid via NexG' : label(SOURCE_LABEL, r.source)}</td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={filtered.length}
                  noun="records"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
                <Footnote>
                  No-shows are confirmed stays whose check-in day has passed with nobody checked in.
                  Times under the dates are when it was recorded, or the booked time. The tag under
                  a guest is their party size; NexG does not record business or leisure.
                </Footnote>
              </DashCard>
            </WithPanel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
