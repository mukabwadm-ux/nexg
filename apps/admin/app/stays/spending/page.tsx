import { BellRing, Coins, Percent, ShoppingBag, Star, Users } from 'lucide-react';
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
import {
  Chip,
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
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
  ORDER_CATEGORY_LABEL,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  shareOf,
  shortDate,
  staysHref,
  uuidOrNull,
  type StayRow,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Guest Spending & Concierge' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'Guest Spending' },
  { key: 'concierge', label: 'With Concierge Orders' },
] as const;

/**
 * Stays → Guest Spending & Concierge: each stay's room spend next to what
 * the guest ordered through the unit's QR while they stayed. Guest orders
 * are NexG's; they are not shared with hosts or property managers.
 */
export default async function SpendingPage({
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
      p_view: 'spending',
      p_tab: tab,
      p_q: q || null,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    selected ? ctx.read('rpc_console_stay_detail', { p_stay_id: selected }) : Promise.resolve(null),
  ]);
  const rows = paged<StayRow>(list.data);
  const s = asObject(asObject(list.data).summary);
  const stays = asNumber(s.bookings);
  const total = asNumber(s.value_kes) + asNumber(s.concierge_kes);
  const keep = { tab: tab === 'all' ? null : tab, q: q || null };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/spending', period, city, { ...keep, ...params });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Guest Spending & Concierge"
        subtitle="What guests spent on their stay and on orders while they stayed."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'concierge' })}
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
                icon={Coins}
                label="Total Guest Spend"
                value={kesCompact(total)}
                explain="Room spend plus guest orders, for stays overlapping the period."
              />
              <DashKpi
                icon={Users}
                label="Avg. Spend per Guest"
                value={stays > 0 ? kesCompact(total / stays) : '—'}
                explain="Total guest spend over the stays (one per booking)."
              />
              <DashKpi
                icon={BellRing}
                label="Concierge Orders"
                value={n(asNumber(s.concierge_orders))}
                explain="Paid orders placed through a unit's QR during a stay."
              />
              <DashKpi
                icon={ShoppingBag}
                label="Concierge Revenue"
                value={kesCompact(asNumber(s.concierge_kes))}
                explain="What those orders came to."
              />
              <DashKpi
                icon={Star}
                label="Stays with Orders"
                value={n(asNumber(s.stays_with_orders))}
                explain="Stays where the guest ordered at least once."
              />
              <DashKpi
                icon={Percent}
                label="Service Attach Rate"
                value={pct(shareOf(asNumber(s.stays_with_orders), stays))}
                explain="Stays with an order over all stays."
              />
            </DashKpiGrid>

            <WithPanel
              panel={
                selected && detail ? (
                  <StayPanel detail={detail.data} closeHref={href({ selected: null })} />
                ) : (
                  <PanelHint>Choose a guest to see their stay and orders.</PanelHint>
                )
              }
            >
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Guest spending"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    count: rows.counts[t.key] ?? 0,
                    href: staysHref('/stays/spending', period, city, {
                      tab: t.key === 'all' ? null : t.key,
                      q: q || null,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search guests"
                    placeholder="Search guest, booking ref, unit…"
                  />
                  <DashClear params={['q', 'tab', 'selected']} />
                </FilterRow>
                <DataTable
                  caption="Guest spending"
                  isEmpty={rows.rows.length === 0}
                  empty="No stays in this view."
                  head={[
                    'Guest',
                    'Booking Ref',
                    'Property / Unit',
                    'Stay Dates',
                    'Room Spend',
                    'Concierge Spend',
                    'Total Spend',
                    'Concierge Services',
                    'Status',
                  ]}
                >
                  {rows.rows.map((r) => (
                    <tr
                      key={r.stay_id}
                      className={r.stay_id === selected ? 'bg-[#FFFBF0]' : undefined}
                    >
                      <td>
                        <PersonCell
                          name={r.guest_name}
                          href={href({ selected: r.stay_id, page: String(page) })}
                        />
                      </td>
                      <td className="whitespace-nowrap font-semibold">{r.ref}</td>
                      <td>
                        <span className="block font-bold">{r.property_name ?? '—'}</span>
                        <span className="text-muted block text-[0.8125rem] font-semibold">
                          {r.unit_label ?? ''}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        {shortDate(r.check_in)} – {shortDate(r.check_out)}
                        <span className="text-muted block text-[0.8125rem]">
                          ({r.nights} nights)
                        </span>
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{kesFull(r.value_kes)}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {kesFull(r.concierge_kes ?? 0)}
                      </td>
                      <td className="whitespace-nowrap font-bold tabular-nums">
                        {kesFull((r.value_kes ?? 0) + (r.concierge_kes ?? 0))}
                      </td>
                      <td className="text-[0.8125rem]">
                        {(r.concierge_categories ?? []).length === 0
                          ? '—'
                          : (r.concierge_categories ?? [])
                              .map((c) => label(ORDER_CATEGORY_LABEL, c))
                              .join(', ')}
                      </td>
                      <td>
                        <Chip status={r.status} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={rows.total}
                  noun="guests"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
                <Footnote>
                  Concierge spend is paid orders placed through the unit&rsquo;s QR between check-in
                  and check-out. Guest orders are not shared with hosts or property managers.
                </Footnote>
              </DashCard>
            </WithPanel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
