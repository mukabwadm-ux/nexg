import {
  BedDouble,
  CalendarCheck,
  CalendarDays,
  CalendarSync,
  Coins,
  Copy,
  Layers,
  Moon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

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
import { UnitControls, UpdateAvailabilityButton } from '@/components/stays/client';
import { NotYet, PanelLinks, PanelTabs, QuickTiles } from '@/components/stays/extras';
import {
  RatePlansCard,
  RateRulesCard,
  scopeOptions,
  SeasonsCard,
  UnitRatesFacts,
} from '@/components/stays/rates';
import { SeasonButton } from '@/components/stays/rates-client';
import {
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  PanelHint,
  photoUrl,
  PlaceCell,
  SidePanel,
  StaysHeader,
  WaitingForDatabase,
  WithPanel,
} from '@/components/stays/module';
import { todayInNairobi } from '@/lib/portal';
import {
  asMaybe,
  asNumber,
  asObject,
  filterOf,
  kesCompact,
  kesFull,
  n,
  oneOf,
  optionsFrom,
  PAGE_SIZE,
  pageOf,
  pageSlice,
  staysHref,
  uuidOrNull,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Availability & Rates' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'rates', label: 'Availability & Rates' },
  { key: 'calendar', label: 'Unit Calendar' },
  { key: 'plans', label: 'Rate Plans' },
  { key: 'seasonal', label: 'Seasonal Pricing' },
  { key: 'restrictions', label: 'Restrictions' },
  { key: 'bulk', label: 'Bulk Update' },
  { key: 'rules', label: 'Rate Rules' },
] as const;

const PANEL_TABS = [
  { key: 'rates', label: 'Rates & Plans' },
  { key: 'availability', label: 'Availability' },
  { key: 'restrictions', label: 'Restrictions' },
  { key: 'history', label: 'History' },
];

interface CalendarRow {
  unit_id: string;
  label: string;
  bedrooms: number | null;
  rate_kes: number | null;
  weekend_rate_kes?: number | null;
  weekly_discount_pct?: number | null;
  monthly_discount_pct?: number | null;
  property_name: string | null;
  photo: unknown;
  days: {
    day: string;
    state: 'available' | 'booked' | 'hold' | 'blocked';
    /** That night's rate: the weekend rate and any season applied. */
    rate_kes: number | null;
    season?: string | null;
  }[];
}

const CELL: Record<string, string> = {
  available: 'bg-[#EAF7EE] text-[#1E7B34]',
  booked: 'bg-[#FDE7E5] text-[#C62D22]',
  hold: 'bg-[#FFF1C7] text-[#9A6700]',
  blocked: 'bg-[#EFEDE8] text-[#5E5A52]',
};
const CELL_LABEL: Record<string, string> = {
  available: 'Avail',
  booked: 'Booked',
  hold: 'Hold',
  blocked: 'Blocked',
};
const LEGEND: Record<string, string> = {
  available: 'Available',
  booked: 'Booked',
  hold: 'Hold (Pending)',
  blocked: 'Blocked / Unavailable',
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayHead = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    date: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
  };
};
const bedroomsText = (b: number | null) =>
  b == null ? '—' : b === 0 ? 'Studio' : `${b} Bedroom${b === 1 ? '' : 's'}`;

/**
 * Stays → Availability & Rates: a week of each live unit, booked, held,
 * blocked or free, at that night's rate; a four-week view of one unit; the
 * bulk tools; and weekend, seasonal and long-stay rates (20270331000100).
 * Restrictions per unit are not set up, and the screen says so.
 */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    start?: string;
    q?: string;
    building?: string;
    type?: string;
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
    'rates',
  );
  const start =
    searchParams?.start && DAY.test(searchParams.start) ? searchParams.start : todayInNairobi();
  const q = (searchParams?.q ?? '').slice(0, 120);
  const building = filterOf(searchParams?.building);
  const type = filterOf(searchParams?.type);
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);
  const ptab = oneOf(
    PANEL_TABS.map((t) => t.key),
    searchParams?.ptab,
    'rates',
  );

  const cal = await ctx.read('rpc_console_stays_calendar', {
    p_start: start,
    p_city: city,
    p_q: q || null,
    p_page: 1,
    p_size: 100,
  });
  const o = asObject(cal.data);
  const k = asObject(o.kpis);
  const days = (Array.isArray(o.days) ? o.days : []) as string[];
  const allRows = (Array.isArray(o.rows) ? o.rows : []) as CalendarRow[];
  const filtered = allRows.filter(
    (r) =>
      (!building || r.property_name === building) && (!type || String(r.bedrooms ?? '') === type),
  );
  const rows = pageSlice(filtered, page, PAGE_SIZE);
  const unit = allRows.find((r) => r.unit_id === selected) ?? null;

  /* The Unit Calendar: four weeks of the chosen unit, read a week at a time. */
  const weeks =
    tab === 'calendar' && unit
      ? await Promise.all(
          [0, 7, 14, 21].map((d) =>
            ctx.read('rpc_console_stays_calendar', {
              p_start: shift(start, d),
              p_city: city,
              p_q: unit.label,
              p_page: 1,
              p_size: 100,
            }),
          ),
        )
      : [];
  const month = weeks.flatMap(
    (w) =>
      ((asObject(w.data).rows as CalendarRow[] | undefined) ?? []).find(
        (r) => r.unit_id === unit?.unit_id,
      )?.days ?? [],
  );

  const keep = {
    tab: tab === 'rates' ? null : tab,
    start: searchParams?.start ?? null,
    q: q || null,
    building,
    type,
  };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/availability', period, city, { ...keep, ...params });
  /* Seasons, for the Seasonal Pricing and Rate Rules tabs. */
  const seasons =
    tab === 'seasonal' || tab === 'rules'
      ? await ctx.read('rpc_console_stays_seasons', { p_city: city })
      : null;
  const options = tab === 'seasonal' || unit ? await scopeOptions(ctx, allRows) : null;
  const unitOptions = allRows.map((r) => ({
    id: r.unit_id,
    label: `${r.label}${r.property_name ? ` · ${r.property_name}` : ''}`,
  }));

  const weekNav = (
    <div className="flex gap-2 text-[0.875rem] font-bold">
      <Link
        className="border-border rounded-lg border px-3 py-2"
        href={href({ start: shift(start, tab === 'calendar' ? -28 : -7), page: null })}
      >
        ‹ Before
      </Link>
      <Link
        className="border-border rounded-lg border px-3 py-2"
        href={href({ start: null, page: null })}
      >
        Today
      </Link>
      <Link
        className="border-border rounded-lg border px-3 py-2"
        href={href({ start: shift(start, tab === 'calendar' ? 28 : 7), page: null })}
      >
        After ›
      </Link>
    </div>
  );

  const legend = (
    <div className="mt-3 flex flex-wrap gap-4 text-[0.8125rem] font-semibold">
      {Object.entries(LEGEND).map(([key, text]) => (
        <span key={key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-3 w-3 rounded-full ${CELL[key]}`} />
          {text}
        </span>
      ))}
    </div>
  );

  const notYet = (title: string, body: string) => (
    <DashCard>
      <NotYet
        title={title}
        action={
          <Link
            className="font-bold text-[#826D18] underline underline-offset-4"
            href="/stays/configuration"
          >
            Open Stays Configuration
          </Link>
        }
      >
        {body}
      </NotYet>
    </DashCard>
  );

  let main: React.ReactNode;
  if (tab === 'plans') {
    main = <RatePlansCard rows={filtered} />;
  } else if (tab === 'seasonal') {
    main = (
      <SeasonsCard
        seasons={seasons?.data}
        waiting={Boolean(seasons?.waiting)}
        error={seasons?.error ?? null}
        options={options!}
      />
    );
  } else if (tab === 'restrictions') {
    main = notYet(
      'Minimum and maximum stays apply to every unit',
      'The minimum stay, maximum stay and advance booking window are set once in Stays Configuration. Restrictions per unit or per date are not set up yet; block dates to close a unit.',
    );
  } else if (tab === 'rules') {
    main = (
      <RateRulesCard
        rows={filtered}
        seasonsRunning={Number(asObject(asObject(seasons?.data).counts).current ?? 0)}
      />
    );
  } else if (tab === 'bulk') {
    main = (
      <div className="grid gap-4 xl:grid-cols-2">
        <DashCard title="Block dates on a unit">
          <p className="text-muted mb-3 text-[0.875rem] font-semibold">
            Close a unit to guests for some nights (repairs, owner stay). Refused where a booking or
            hold is already there.
          </p>
          <UpdateAvailabilityButton units={unitOptions} />
        </DashCard>
        <DashCard title="Change a nightly rate">
          <p className="text-muted mb-3 text-[0.875rem] font-semibold">
            New bookings are quoted the new rate; bookings already made keep theirs.
          </p>
          <UnitControls units={unitOptions} />
        </DashCard>
      </div>
    );
  } else if (tab === 'calendar') {
    main = (
      <DashCard title={unit ? `Unit ${unit.label} — four weeks` : 'Unit Calendar'} aside={weekNav}>
        {!unit ? (
          <PanelHint>Choose a unit on Availability & Rates, then open its calendar.</PanelHint>
        ) : (
          <>
            <ul className="grid grid-cols-7 gap-1.5">
              {month.slice(0, 7).map((d) => (
                <li key={`h-${d.day}`} className="text-muted text-center text-[0.75rem] font-bold">
                  {dayHead(d.day).weekday}
                </li>
              ))}
              {month.map((d) => (
                <li
                  key={d.day}
                  title={d.season ?? undefined}
                  className={`rounded-lg p-2 text-center text-[0.8125rem] font-bold ${CELL[d.state]}`}
                >
                  {dayHead(d.day).date}
                  <span className="block text-[0.75rem] font-semibold">{CELL_LABEL[d.state]}</span>
                  {d.rate_kes != null && (
                    <span className="block text-[0.6875rem] font-semibold">
                      {n(d.rate_kes)}
                      {d.season ? ' *' : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {legend}
          </>
        )}
      </DashCard>
    );
  } else {
    main = (
      <DashCard className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <FilterRow>
            <DashSearch
              value={q}
              label="Search units"
              placeholder="Search unit, building or host…"
            />
            <DashSelect
              label="Building"
              param="building"
              value={building ?? 'all'}
              options={optionsFrom(allRows, (r) => r.property_name)}
            />
            <DashSelect
              label="Unit Type"
              param="type"
              value={type ?? 'all'}
              options={[
                ...new Set(allRows.map((r) => r.bedrooms).filter((b): b is number => b != null)),
              ]
                .sort((a, b) => a - b)
                .map((b) => ({ value: String(b), label: bedroomsText(b) }))}
            />
            <DashClear params={['q', 'building', 'type', 'selected', 'start']} />
          </FilterRow>
          {weekNav}
        </div>
        <DataTable
          caption="Unit availability by night"
          isEmpty={rows.length === 0}
          empty="No live units match."
          head={[
            `Unit (${n(filtered.length)})`,
            'Base Rate',
            ...days.map((d) => {
              const h = dayHead(d);
              return (
                <span key={d} className="block text-center leading-tight">
                  {h.weekday}
                  <br />
                  {h.date}
                </span>
              );
            }),
          ]}
        >
          {rows.map((r) => (
            <tr key={r.unit_id} className={r.unit_id === selected ? 'bg-[#FFFBF0]' : undefined}>
              <td>
                <PlaceCell
                  title={r.label}
                  sub={[r.bedrooms != null ? bedroomsText(r.bedrooms) : null, r.property_name]
                    .filter(Boolean)
                    .join(' • ')}
                  photo={photoUrl(r.photo)}
                  href={href({ selected: r.unit_id, page: String(page) })}
                />
              </td>
              <td className="whitespace-nowrap font-bold tabular-nums">{kesFull(r.rate_kes)}</td>
              {r.days.map((d) => (
                <td key={d.day} className="px-1">
                  <span
                    title={d.season ?? undefined}
                    className={`block rounded-md px-1.5 py-1 text-center text-[0.75rem] font-bold ${CELL[d.state]}`}
                  >
                    {d.rate_kes != null ? n(d.rate_kes) : '—'}
                    {d.season ? ' *' : ''}
                    <span className="block font-semibold">{CELL_LABEL[d.state]}</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </DataTable>
        {legend}
        <Pagination
          page={page}
          size={PAGE_SIZE}
          total={filtered.length}
          noun="units"
          href={(p) => href({ page: p > 1 ? String(p) : null })}
        />
        <Footnote>
          Each night starts at check-in time; a hold is a guest paying now. The figure is that
          night&rsquo;s rate (weekend rate and seasons applied; * marks a season), before any
          long-stay discount.
          {asNumber(o.total) > 100
            ? ` Showing the first 100 of ${n(asNumber(o.total))} live units: search to reach the rest.`
            : ''}
        </Footnote>
      </DashCard>
    );
  }

  const panelBody =
    unit &&
    (ptab === 'availability' ? (
      <ul className="grid grid-cols-7 gap-1">
        {unit.days.map((d) => (
          <li
            key={d.day}
            className={`rounded-md p-1 text-center text-[0.6875rem] font-bold ${CELL[d.state]}`}
          >
            {dayHead(d.day).weekday}
            <span className="block">{CELL_LABEL[d.state]}</span>
          </li>
        ))}
      </ul>
    ) : ptab === 'restrictions' ? (
      <p className="text-muted text-[0.875rem] font-semibold">
        The minimum and maximum stay and the booking window from Stays Configuration apply; this
        unit has no rules of its own.
      </p>
    ) : ptab === 'history' ? (
      <p className="text-muted text-[0.875rem] font-semibold">
        Rate changes and blocks are in the{' '}
        <Link className="underline" href="/audit">
          audit log
        </Link>
        .
      </p>
    ) : (
      <UnitRatesFacts ctx={ctx} unitId={unit.unit_id} label={unit.label} />
    ));

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Availability & Rates"
        subtitle="A week of every live unit: booked, held, blocked or free, at its nightly rate."
        period={period}
        cities={ctx.cities}
        city={city}
        noPeriod
        action={<UpdateAvailabilityButton units={unitOptions} />}
      />
      <DashCanvas>
        {cal.waiting ? (
          <WaitingForDatabase />
        ) : cal.error ? (
          <ErrorNote message={cal.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-5">
              <DashKpi
                featured
                icon={BedDouble}
                label="Total Units"
                value={n(asNumber(k.units))}
                explain="Live units."
              />
              <DashKpi
                icon={CalendarCheck}
                label="Available Today"
                value={n(asNumber(k.available_today))}
                explain="No booking, hold or block tonight."
              />
              <DashKpi
                icon={Moon}
                label="Occupied"
                value={n(asNumber(k.occupied_today))}
                explain="Booked or checked in tonight."
              />
              <DashKpi
                icon={Coins}
                label="Avg. Nightly Rate (ADR)"
                value={asMaybe(k.avg_rate_kes) == null ? '—' : kesFull(asNumber(k.avg_rate_kes))}
                explain="The units' standard nightly rates, averaged."
              />
              <DashKpi
                icon={Layers}
                label="Booked Ahead"
                value={kesCompact(asNumber(k.booked_ahead_kes))}
                explain="What confirmed future stays come to."
              />
            </DashKpiGrid>

            <DashCard>
              <GoldTabs
                label="Availability and rates"
                active={tab}
                tabs={TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  href: staysHref('/stays/availability', period, city, {
                    tab: t.key === 'rates' ? null : t.key,
                    selected,
                    start: searchParams?.start ?? null,
                  }),
                }))}
              />
            </DashCard>

            <WithPanel
              panel={
                unit ? (
                  <SidePanel title={`Unit ${unit.label}`} closeHref={href({ selected: null })}>
                    {photoUrl(unit.photo) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl(unit.photo)!}
                        alt=""
                        className="mb-3 h-36 w-full rounded-xl object-cover"
                      />
                    )}
                    <p className="text-muted mb-3 text-[0.875rem] font-semibold">
                      {unit.property_name ?? 'No building'} · {bedroomsText(unit.bedrooms)}
                    </p>
                    <PanelLinks
                      links={[
                        {
                          label: 'View Calendar',
                          icon: CalendarDays,
                          href: href({ tab: 'calendar', selected: unit.unit_id }),
                        },
                        {
                          label: 'View Unit',
                          icon: BedDouble,
                          href: staysHref('/stays/units', period, city, { selected: unit.unit_id }),
                        },
                      ]}
                    />
                    <UnitControls unitId={unit.unit_id} rate={unit.rate_kes} />
                    <div className="mt-3">
                      <PanelTabs
                        tabs={PANEL_TABS}
                        active={ptab}
                        href={(key) =>
                          href({ selected: unit.unit_id, ptab: key === 'rates' ? null : key })
                        }
                      />
                      {panelBody}
                    </div>
                    <h3 className="mb-2 mt-4 text-[0.9375rem] font-extrabold">Quick Actions</h3>
                    <QuickTiles
                      tiles={[
                        {
                          label: 'Bulk Update',
                          icon: Layers,
                          href: href({ tab: 'bulk', selected: unit.unit_id }),
                        },
                        {
                          label: 'Copy Rates',
                          icon: Copy,
                          unavailable: 'Copying rates between units is not built yet.',
                        },
                        {
                          label: 'Apply Seasonal',
                          icon: CalendarDays,
                          node: (
                            <SeasonButton
                              trigger="tile"
                              options={options!}
                              initial={{ scope: 'unit', scopeId: unit.unit_id }}
                            />
                          ),
                        },
                        {
                          label: 'Sync Calendar',
                          icon: CalendarSync,
                          href: '/stays/configuration',
                        },
                      ]}
                    />
                  </SidePanel>
                ) : (
                  <PanelHint>Choose a unit to block dates or change its rate.</PanelHint>
                )
              }
            >
              {main}
            </WithPanel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
