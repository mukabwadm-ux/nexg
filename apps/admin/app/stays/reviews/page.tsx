import {
  Building2,
  ConciergeBell,
  Home,
  type LucideIcon,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Wallet,
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
import { ModerateNextButton, ReviewControls } from '@/components/stays/client';
import {
  Chip,
  DataTable,
  Empty,
  ErrorNote,
  FilterRow,
  Footnote,
  MeterRows,
  PanelHint,
  PersonCell,
  SidePanel,
  StaysHeader,
  WaitingForDatabase,
} from '@/components/stays/module';
import {
  asMaybe,
  asNumber,
  asObject,
  FILTER_WINDOW,
  filterOf,
  n,
  oneOf,
  optionsFrom,
  PAGE_SIZE,
  pageOf,
  pageSlice,
  pct,
  shareOf,
  shortDate,
  staysHref,
  uuidOrNull,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Reviews & Ratings' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Reviews' },
  { key: 'property', label: 'By Property' },
  { key: 'unit', label: 'By Unit' },
  { key: 'host', label: 'By Host' },
  { key: 'service', label: 'By Service (Concierge)' },
] as const;

interface ReviewRow {
  stay_id: string;
  rating: number;
  text: string | null;
  themes: string[] | null;
  answered_at: string;
  moderation: string;
  staff_reply: string | null;
  featured: boolean;
  ref: string;
  guest_name: string;
  unit_label: string | null;
  property_name: string | null;
  property_id: string | null;
  host_id: string;
  host_name: string;
  unit_id: string | null;
  nights: number;
  check_in: string;
  rating_cleanliness?: number | null;
  rating_location?: number | null;
  rating_service?: number | null;
  rating_facilities?: number | null;
  rating_security?: number | null;
  rating_value?: number | null;
}

/** The six things guests rate besides the overall stars (20270332000400). */
const CATEGORIES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'cleanliness', label: 'Cleanliness', icon: Sparkles },
  { key: 'location', label: 'Location', icon: MapPin },
  { key: 'service', label: 'Service', icon: ConciergeBell },
  { key: 'facilities', label: 'Facilities', icon: Building2 },
  { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'value', label: 'Value', icon: Wallet },
];

const categoryOf = (row: ReviewRow, key: string) => {
  const v = (row as unknown as Record<string, unknown>)[`rating_${key}`];
  return typeof v === 'number' ? v : null;
};

function StarRow({ value }: { value: number }) {
  const v = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
      <span aria-hidden="true" className="text-[#F5B400]">
        {'★'.repeat(v)}
        <span className="text-[#E5E0D6]">{'★'.repeat(5 - v)}</span>
      </span>
      <span className="tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

/** Reviews grouped by one field: count, average and share of 4–5 stars. */
function group(rows: ReviewRow[], key: (r: ReviewRow) => string | null) {
  const m = new Map<string, { name: string; n: number; sum: number; good: number }>();
  for (const r of rows) {
    const k = key(r) ?? '—';
    const g = m.get(k) ?? { name: k, n: 0, sum: 0, good: 0 };
    g.n += 1;
    g.sum += r.rating;
    g.good += r.rating >= 4 ? 1 : 0;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

/**
 * Stays → Reviews & Ratings: what guests said after their stays, grouped by
 * property, unit and host, and the moderation staff do on it (publish,
 * hide, feature, reply). Hidden reviews stay on record.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
    rating?: string;
    property?: string;
    status?: string;
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
  const rating = ['1', '2', '3', '4', '5'].includes(searchParams?.rating ?? '')
    ? Number(searchParams!.rating)
    : null;
  const property = filterOf(searchParams?.property);
  const status = filterOf(searchParams?.status);
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);

  const list = await ctx.read('rpc_console_stays_reviews', {
    p_from: period.from,
    p_to: period.to,
    p_city: city,
    p_tab: status ?? 'all',
    p_q: q || null,
    p_rating: rating,
    p_page: 1,
    p_size: FILTER_WINDOW,
  });
  const o = asObject(list.data);
  const k = asObject(o.kpis);
  const counts = asObject(o.counts);
  const all = (Array.isArray(o.rows) ? o.rows : []) as ReviewRow[];
  const filtered = all.filter((r) => !property || r.property_name === property);
  const rows = pageSlice(filtered, page, PAGE_SIZE);
  const stars = (Array.isArray(o.stars) ? o.stars : []) as { stars: number; n: number }[];
  const themes = (Array.isArray(o.themes) ? o.themes : []) as { theme: string; n: number }[];
  const cats = asObject(o.categories);
  const categoryRows = CATEGORIES.map((c) => {
    const v = asObject(cats[c.key]);
    return { ...c, avg: asMaybe(v.avg), n: asNumber(v.n) };
  });
  const categoryRated = categoryRows.some((c) => c.n > 0);
  const reviews = asNumber(k.reviews);
  const avg = asMaybe(k.avg);
  const r = all.find((x) => x.stay_id === selected) ?? null;
  const next = all.find((x) => x.moderation === 'under_review');
  const latest = all[0] ?? null;
  const keep = {
    tab: tab === 'all' ? null : tab,
    q: q || null,
    rating: rating ? String(rating) : null,
    property,
    status,
  };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/reviews', period, city, { ...keep, ...params });

  const groups =
    tab === 'property'
      ? group(filtered, (x) => x.property_name)
      : tab === 'unit'
        ? group(filtered, (x) =>
            x.unit_label
              ? `${x.unit_label}${x.property_name ? ` · ${x.property_name}` : ''}`
              : null,
          )
        : tab === 'host'
          ? group(filtered, (x) => x.host_name)
          : [];

  const reviewCard = (x: ReviewRow, title: string, close: boolean) => (
    <SidePanel
      title={title}
      closeHref={close ? href({ selected: null }) : href({})}
      badge={<Chip status={x.moderation} />}
    >
      <PersonCell
        name={x.guest_name}
        sub={`${x.property_name ?? ''} ${x.unit_label ?? ''}`.trim()}
      />
      <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
        {shortDate(x.answered_at)} · {x.nights} nights
      </p>
      <p className="mt-2">
        <StarRow value={x.rating} />
      </p>
      {CATEGORIES.some((c) => categoryOf(x, c.key) !== null) && (
        <ul className="mt-2 grid gap-1">
          {CATEGORIES.filter((c) => categoryOf(x, c.key) !== null).map((c) => {
            const Icon = c.icon;
            return (
              <li key={c.key} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                <span className="flex items-center gap-2 font-semibold">
                  <Icon aria-hidden="true" className="h-4 w-4 text-[#E5A800]" />
                  {c.label}
                </span>
                <StarRow value={categoryOf(x, c.key)!} />
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[0.9375rem] leading-relaxed">
        {x.text ? `“${x.text}”` : 'The guest left stars only.'}
      </p>
      {x.staff_reply && (
        <p className="bg-bg mt-2 rounded-lg p-3 text-[0.875rem]">
          <span className="font-bold">NexG replied:</span> {x.staff_reply}
        </p>
      )}
      <div className="mt-4">
        <ReviewControls stayId={x.stay_id} moderation={x.moderation} featured={x.featured} />
      </div>
    </SidePanel>
  );

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Reviews & Ratings"
        subtitle="What guests said about their stays, and the reviews waiting for moderation."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'reviews' })}
        action={
          <ModerateNextButton
            href={next ? href({ status: 'under_review', selected: next.stay_id }) : null}
          />
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
                icon={Star}
                label="Overall Rating"
                value={avg == null ? '—' : `${avg.toFixed(1)} / 5`}
                explain="Average of the stars guests gave for stays reviewed in the period."
              />
              <DashKpi
                icon={MessageSquare}
                label="Total Reviews"
                value={n(reviews)}
                explain="Reviews guests left in the period."
              />
              <DashKpi
                icon={Building2}
                label="Rated Properties"
                value={n(asNumber(k.properties))}
                explain="Properties with at least one review."
              />
              <DashKpi
                icon={Home}
                label="Rated Units"
                value={n(asNumber(k.units))}
                explain="Units with at least one review."
              />
              <DashKpi
                icon={ThumbsUp}
                iconTone="green"
                label="Positive Reviews"
                value={pct(asMaybe(k.positive_pct), 0)}
                explain="4 or 5 stars."
              />
              <DashKpi
                icon={ThumbsDown}
                iconTone="red"
                label="Needs Attention"
                value={pct(asMaybe(k.attention_pct), 0)}
                explain="3 stars or fewer."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Reviews"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.key === 'all' ? `${t.label} (${n(asNumber(counts.all))})` : t.label,
                    href: staysHref('/stays/reviews', period, city, {
                      ...keep,
                      tab: t.key === 'all' ? null : t.key,
                      page: null,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search reviews"
                    placeholder="Search by guest, property, unit or review…"
                  />
                  <DashSelect
                    label="Rating"
                    param="rating"
                    value={rating ? String(rating) : 'all'}
                    options={[5, 4, 3, 2, 1].map((s) => ({
                      value: String(s),
                      label: `${s} stars`,
                    }))}
                  />
                  <DashSelect
                    label="Property"
                    param="property"
                    value={property ?? 'all'}
                    options={optionsFrom(all, (x) => x.property_name)}
                  />
                  <DashSelect
                    label="Status"
                    param="status"
                    value={status ?? 'all'}
                    options={[
                      { value: 'published', label: `Published (${n(asNumber(counts.published))})` },
                      {
                        value: 'under_review',
                        label: `Under Review (${n(asNumber(counts.under_review))})`,
                      },
                      { value: 'hidden', label: `Hidden (${n(asNumber(counts.hidden))})` },
                    ]}
                  />
                  <DashClear params={['q', 'rating', 'property', 'status', 'selected']} />
                </FilterRow>
                {tab === 'service' ? (
                  <Empty>
                    Guests review their stay, not the orders they placed while staying, so there are
                    no concierge reviews yet. Order ratings are on the merchants&rsquo; pages.
                  </Empty>
                ) : tab !== 'all' ? (
                  <DataTable
                    caption="Reviews grouped"
                    isEmpty={groups.length === 0}
                    empty="No reviews in this period."
                    head={[
                      tab === 'property' ? 'Property' : tab === 'unit' ? 'Unit' : 'Host',
                      'Reviews',
                      'Average',
                      'Positive (4–5★)',
                    ]}
                  >
                    {groups.map((g) => (
                      <tr key={g.name}>
                        <td className="font-semibold">{g.name}</td>
                        <td className="tabular-nums">{n(g.n)}</td>
                        <td>
                          <StarRow value={g.sum / g.n} />
                        </td>
                        <td className="tabular-nums">{pct(shareOf(g.good, g.n), 0)}</td>
                      </tr>
                    ))}
                  </DataTable>
                ) : (
                  <>
                    <DataTable
                      caption="Reviews"
                      isEmpty={rows.length === 0}
                      empty="No reviews in this period."
                      head={[
                        'Guest',
                        'Property / Unit',
                        'Rating',
                        'Review (Summary)',
                        'Date',
                        'Status',
                      ]}
                    >
                      {rows.map((x) => (
                        <tr
                          key={x.stay_id}
                          className={x.stay_id === selected ? 'bg-[#FFFBF0]' : undefined}
                        >
                          <td>
                            <PersonCell
                              name={x.guest_name}
                              sub={x.ref}
                              href={href({ selected: x.stay_id, page: String(page) })}
                            />
                          </td>
                          <td>
                            <span className="block font-bold">{x.property_name ?? '—'}</span>
                            <span className="text-muted block text-[0.8125rem]">
                              {x.unit_label ?? ''}
                            </span>
                          </td>
                          <td>
                            <StarRow value={x.rating} />
                          </td>
                          <td className="max-w-[18rem]">
                            <span className="line-clamp-2 text-[0.875rem]">
                              {x.text ? (
                                `“${x.text}”`
                              ) : (
                                <span className="text-muted">Stars only</span>
                              )}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">{shortDate(x.answered_at)}</td>
                          <td>
                            <Chip status={x.moderation} />
                            {x.featured && (
                              <span className="ml-1 text-[0.75rem] font-bold text-[#B57A00]">
                                ★ Featured
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                    <Pagination
                      page={page}
                      size={PAGE_SIZE}
                      total={filtered.length}
                      noun="reviews"
                      href={(p) => href({ page: p > 1 ? String(p) : null })}
                    />
                  </>
                )}
              </DashCard>

              <div className="grid content-start gap-4">
                <DashCard title="Rating Overview">
                  {reviews === 0 ? (
                    <Empty>No reviews yet.</Empty>
                  ) : (
                    <div className="grid items-center gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                      <ShareDonut
                        stacked
                        centre={avg == null ? '—' : avg.toFixed(1)}
                        caption="out of 5"
                        data={[
                          { key: 'score', label: 'Score', value: avg ?? 0, color: '#F5A623' },
                          {
                            key: 'rest',
                            label: 'Rest',
                            value: Math.max(0, 5 - (avg ?? 0)),
                            color: '#EFEDE8',
                          },
                        ]}
                      />
                      <MeterRows
                        empty="No ratings."
                        rows={stars.map((s) => ({
                          label: `${s.stars} ★`,
                          value: shareOf(asNumber(s.n), reviews),
                          text: pct(shareOf(asNumber(s.n), reviews), 0),
                          tone: 'gold' as const,
                        }))}
                      />
                    </div>
                  )}
                </DashCard>
                <DashCard title="Ratings by Category">
                  {!categoryRated ? (
                    <Empty>
                      No guest has rated a category in this period yet. Guests rate cleanliness,
                      location, service, facilities, security and value when they review a stay.
                    </Empty>
                  ) : (
                    <>
                      <MeterRows
                        empty="No ratings."
                        rows={categoryRows.map((c) => ({
                          label: c.label,
                          icon: c.icon,
                          value: c.avg == null ? 0 : (c.avg / 5) * 100,
                          text: c.avg == null ? '—' : c.avg.toFixed(1),
                          tone: 'gold' as const,
                        }))}
                      />
                      <Footnote>
                        Average out of 5 from the guests who rated each category (
                        {categoryRows.map((c) => `${c.label.toLowerCase()} ${n(c.n)}`).join(', ')}).
                        Categories are optional; the overall rating is not.
                      </Footnote>
                    </>
                  )}
                  {themes.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {themes.map((t) => (
                        <li
                          key={t.theme}
                          className="rounded-lg bg-[#FFF4D6] px-2.5 py-1 text-[0.8125rem] font-bold text-[#8A5C00]"
                        >
                          {t.theme} · {n(t.n)}
                        </li>
                      ))}
                    </ul>
                  )}
                </DashCard>
                {r ? (
                  reviewCard(r, 'Review', true)
                ) : latest ? (
                  reviewCard(latest, 'Recent Review', false)
                ) : (
                  <PanelHint>No review to show.</PanelHint>
                )}
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
