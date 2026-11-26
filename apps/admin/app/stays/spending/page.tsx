import {
  BellRing,
  CalendarCheck,
  Car,
  Coins,
  LayoutGrid,
  Percent,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Ticket,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
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
import { QuickTiles } from '@/components/stays/extras';
import {
  Chip,
  DataTable,
  Empty,
  ErrorNote,
  FilterRow,
  Footnote,
  PanelHint,
  PersonCell,
  ShareBars,
  StaysHeader,
  WaitingForDatabase,
  WithPanel,
} from '@/components/stays/module';
import { StayPanel, STAY_PANEL_TABS } from '@/components/stays/stay-panel';
import {
  asNumber,
  asObject,
  FILTER_WINDOW,
  filterOf,
  kesCompact,
  kesFull,
  label,
  n,
  oneOf,
  optionsFrom,
  ORDER_CATEGORY_LABEL,
  PAGE_SIZE,
  pageOf,
  pageSlice,
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
  { key: 'concierge', label: 'Concierge Requests' },
  { key: 'analytics', label: 'Service Analytics' },
  { key: 'by_property', label: 'Spend by Property' },
  { key: 'by_service', label: 'Spend by Service' },
] as const;

const PALETTE = ['#F5A623', '#F5C842', '#C58BF2', '#2F80ED', '#9EC5F8', '#1E9E45', '#C9C4B8'];

/** The designs' small icon per service a guest ordered. */
function serviceIcon(category: string): LucideIcon {
  if (/food|restaurant|cafe|bar|bakery|drink/i.test(category)) return UtensilsCrossed;
  if (/grocer|supermarket|market|shop|pharm|convenien/i.test(category)) return ShoppingCart;
  if (/transport|transfer|taxi|car|ride/i.test(category)) return Car;
  if (/experience|tour|event|ticket|cinema/i.test(category)) return Ticket;
  if (/spa|salon|beauty|clean|laundry|service/i.test(category)) return Sparkles;
  return ShoppingBag;
}

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
    building?: string;
    service?: string;
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
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const building = filterOf(searchParams?.building);
  const service = filterOf(searchParams?.service);
  const status = filterOf(searchParams?.status);
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);
  const ptab = oneOf(['spend', ...STAY_PANEL_TABS.map((t) => t.key)], searchParams?.ptab, 'spend');

  const [list, detail, overview] = await Promise.all([
    ctx.read('rpc_console_stays_list', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_view: 'spending',
      p_tab: tab === 'concierge' ? 'concierge' : 'all',
      p_q: q || null,
      p_page: 1,
      p_size: FILTER_WINDOW,
    }),
    selected ? ctx.read('rpc_console_stay_detail', { p_stay_id: selected }) : Promise.resolve(null),
    ctx.read('rpc_console_stays_overview', { p_from: period.from, p_to: period.to, p_city: city }),
  ]);
  const all = paged<StayRow>(list.data);
  const filtered = all.rows.filter(
    (r) =>
      (!building || r.property_name === building) &&
      (!status || r.status === status) &&
      (!service || (r.concierge_categories ?? []).includes(service)),
  );
  const rows = pageSlice(filtered, page, PAGE_SIZE);
  const s = asObject(asObject(list.data).summary);
  const stays = asNumber(s.bookings);
  const total = asNumber(s.value_kes) + asNumber(s.concierge_kes);
  const byService = (
    (asObject(asObject(overview.data).spending).orders as
      | { category: string; kes: number }[]
      | undefined) ?? []
  ).map((o) => ({
    category: o.category,
    kes: asNumber(o.kes),
  }));
  const serviceTotal = byService.reduce((a, b) => a + b.kes, 0);
  const byProperty = Object.values(
    filtered.reduce<
      Record<string, { name: string; stays: number; room: number; concierge: number }>
    >((m, r) => {
      const k = r.property_name ?? 'No building';
      m[k] ??= { name: k, stays: 0, room: 0, concierge: 0 };
      m[k].stays += 1;
      m[k].room += r.value_kes ?? 0;
      m[k].concierge += r.concierge_kes ?? 0;
      return m;
    }, {}),
  ).sort((a, b) => b.room + b.concierge - (a.room + a.concierge));
  const categories = [...new Set(all.rows.flatMap((r) => r.concierge_categories ?? []))];
  const keep = { tab: tab === 'all' ? null : tab, q: q || null, building, service, status };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/spending', period, city, { ...keep, ...params });

  const table = (
    <>
      <FilterRow>
        <DashSearch
          value={q}
          label="Search guests"
          placeholder="Search guest, booking ref, unit or service…"
        />
        <DashSelect
          label="Building"
          param="building"
          value={building ?? 'all'}
          options={optionsFrom(all.rows, (r) => r.property_name)}
        />
        <DashSelect
          label="Service"
          param="service"
          value={service ?? 'all'}
          options={categories.map((c) => ({ value: c, label: label(ORDER_CATEGORY_LABEL, c) }))}
        />
        <DashSelect
          label="Status"
          param="status"
          value={status ?? 'all'}
          options={[
            { value: 'booked', label: 'Confirmed' },
            { value: 'in_stay', label: 'Active (in stay)' },
            { value: 'departed', label: 'Completed' },
          ]}
        />
        <DashClear params={['q', 'building', 'service', 'status', 'selected']} />
      </FilterRow>
      <DataTable
        caption="Guest spending"
        isEmpty={rows.length === 0}
        empty={
          tab === 'concierge'
            ? 'No guest ordered through a unit QR in this period.'
            : 'No stays in this view.'
        }
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
        {rows.map((r) => (
          <tr key={r.stay_id} className={r.stay_id === selected ? 'bg-[#FFFBF0]' : undefined}>
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
              <span className="text-muted block text-[0.8125rem]">({r.nights} nights)</span>
            </td>
            <td className="whitespace-nowrap tabular-nums">{kesFull(r.value_kes)}</td>
            <td className="whitespace-nowrap tabular-nums">{kesFull(r.concierge_kes ?? 0)}</td>
            <td className="whitespace-nowrap font-bold tabular-nums">
              {kesFull((r.value_kes ?? 0) + (r.concierge_kes ?? 0))}
            </td>
            <td>
              {(r.concierge_categories ?? []).length === 0 ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="flex gap-1.5">
                  {(r.concierge_categories ?? []).map((c) => {
                    const I = serviceIcon(c);
                    return (
                      <span key={c} title={label(ORDER_CATEGORY_LABEL, c)}>
                        <I aria-hidden="true" className="h-4 w-4 text-[#E5A800]" />
                        <span className="sr-only">{label(ORDER_CATEGORY_LABEL, c)}</span>
                      </span>
                    );
                  })}
                </span>
              )}
            </td>
            <td>
              <Chip
                status={r.status}
                text={
                  r.status === 'in_stay'
                    ? 'Active'
                    : r.status === 'departed'
                      ? 'Completed'
                      : undefined
                }
              />
            </td>
          </tr>
        ))}
      </DataTable>
      <Pagination
        page={page}
        size={PAGE_SIZE}
        total={filtered.length}
        noun="guests"
        href={(p) => href({ page: p > 1 ? String(p) : null })}
      />
    </>
  );

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
                label="Top Service"
                value={byService[0] ? label(ORDER_CATEGORY_LABEL, byService[0].category) : '—'}
                explain="The service guests spent most on in the period."
              >
                {byService[0] && (
                  <span className="text-muted text-[0.8125rem] font-semibold">
                    {kesCompact(byService[0].kes)} (
                    {pct(shareOf(byService[0].kes, serviceTotal), 0)} of concierge)
                  </span>
                )}
              </DashKpi>
              <DashKpi
                icon={Percent}
                label="Service Attach Rate"
                value={pct(shareOf(asNumber(s.stays_with_orders), stays))}
                explain="Stays with at least one guest order, over all stays."
              />
            </DashKpiGrid>

            <DashCard>
              <GoldTabs
                label="Guest spending"
                active={tab}
                tabs={TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  count:
                    t.key === 'all'
                      ? (all.counts.all ?? 0)
                      : t.key === 'concierge'
                        ? asNumber(s.concierge_orders)
                        : null,
                  href: staysHref('/stays/spending', period, city, {
                    tab: t.key === 'all' ? null : t.key,
                  }),
                }))}
              />
            </DashCard>

            {tab === 'analytics' || tab === 'by_service' ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <DashCard title="Spend by Service">
                  {serviceTotal === 0 ? (
                    <Empty>No guest orders in this period.</Empty>
                  ) : (
                    <ShareDonut
                      centre={kesCompact(serviceTotal)}
                      unit="kes"
                      data={byService.map((o, i) => ({
                        key: o.category,
                        label: label(ORDER_CATEGORY_LABEL, o.category),
                        value: o.kes,
                        color: PALETTE[i % PALETTE.length],
                      }))}
                    />
                  )}
                </DashCard>
                <DashCard title="Service Analytics">
                  <ShareBars
                    empty="No guest orders in this period."
                    rows={byService.map((o) => ({
                      label: label(ORDER_CATEGORY_LABEL, o.category),
                      value: o.kes,
                      text: kesCompact(o.kes),
                      icon: serviceIcon(o.category),
                    }))}
                  />
                  <Footnote>
                    Paid orders through a unit&rsquo;s QR during stays checking in in the period.
                  </Footnote>
                </DashCard>
              </div>
            ) : tab === 'by_property' ? (
              <DashCard title="Spend by Property">
                <DataTable
                  caption="Spend by property"
                  isEmpty={byProperty.length === 0}
                  empty="No stays in this period."
                  head={[
                    'Property',
                    'Stays',
                    'Room Spend',
                    'Concierge Spend',
                    'Total Spend',
                    'Concierge per Stay',
                  ]}
                >
                  {byProperty.map((p) => (
                    <tr key={p.name}>
                      <td className="font-semibold">{p.name}</td>
                      <td className="tabular-nums">{n(p.stays)}</td>
                      <td className="tabular-nums">{kesFull(p.room)}</td>
                      <td className="tabular-nums">{kesFull(p.concierge)}</td>
                      <td className="font-bold tabular-nums">{kesFull(p.room + p.concierge)}</td>
                      <td className="tabular-nums">
                        {kesFull(p.stays > 0 ? p.concierge / p.stays : 0)}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </DashCard>
            ) : (
              <WithPanel
                panel={
                  <div className="grid content-start gap-4">
                    {selected && detail ? (
                      <StayPanel
                        detail={detail.data}
                        variant="spending"
                        closeHref={href({ selected: null })}
                        tab={ptab}
                        tabHref={(k) => href({ selected, ptab: k === 'overview' ? 'spend' : k })}
                      />
                    ) : (
                      <PanelHint>Choose a guest to see their stay and orders.</PanelHint>
                    )}
                    <DashCard title="Request Concierge Service">
                      <QuickTiles
                        cols={3}
                        tiles={[
                          { label: 'Airport Transfer', icon: Car },
                          { label: 'Grocery Delivery', icon: ShoppingCart },
                          { label: 'Food & Dining', icon: UtensilsCrossed },
                          { label: 'Bookings (Tables, Spa)', icon: CalendarCheck },
                          { label: 'Experiences & Tickets', icon: Ticket },
                          { label: 'Other Requests', icon: LayoutGrid },
                        ].map((t) => ({
                          ...t,
                          unavailable:
                            'Ordering for a guest from the console is not built yet; guests order through the QR in their unit.',
                        }))}
                      />
                    </DashCard>
                  </div>
                }
              >
                <DashCard className="min-w-0">{table}</DashCard>
              </WithPanel>
            )}
            <Footnote>
              Concierge spend is paid orders placed through the unit&rsquo;s QR between check-in and
              check-out. Guest orders are not shared with hosts or property managers.
            </Footnote>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
