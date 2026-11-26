import { Building2, Home, MessageSquare, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
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
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
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
  { key: 'published', label: 'Published' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'hidden', label: 'Hidden' },
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
  nights: number;
}

function StarRow({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
      <span aria-hidden="true" className="text-[#F5B400]">
        {'★'.repeat(Math.round(value))}
        <span className="text-[#E5E0D6]">{'★'.repeat(5 - Math.round(value))}</span>
      </span>
      <span className="tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

/**
 * Stays → Reviews & Ratings: what guests said after their stays, and the
 * moderation staff do on it (publish, hide, feature, reply). Hidden reviews
 * stay on record but are not shown on the stays screens.
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
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);

  const [list, waiting] = await Promise.all([
    ctx.read('rpc_console_stays_reviews', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_tab: tab,
      p_q: q || null,
      p_rating: rating,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    ctx.read('rpc_console_stays_reviews', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_tab: 'under_review',
      p_q: null,
      p_rating: null,
      p_page: 1,
      p_size: 1,
    }),
  ]);
  const o = asObject(list.data);
  const k = asObject(o.kpis);
  const counts = asObject(o.counts);
  const rows = (Array.isArray(o.rows) ? o.rows : []) as ReviewRow[];
  const stars = (Array.isArray(o.stars) ? o.stars : []) as { stars: number; n: number }[];
  const themes = (Array.isArray(o.themes) ? o.themes : []) as { theme: string; n: number }[];
  const reviews = asNumber(k.reviews);
  const avg = asMaybe(k.avg);
  const r = rows.find((x) => x.stay_id === selected) ?? null;
  const next = ((asObject(waiting.data).rows as ReviewRow[] | undefined) ?? [])[0];
  const keep = {
    tab: tab === 'all' ? null : tab,
    q: q || null,
    rating: rating ? String(rating) : null,
  };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/reviews', period, city, { ...keep, ...params });

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
            href={
              next
                ? staysHref('/stays/reviews', period, city, {
                    tab: 'under_review',
                    selected: next.stay_id,
                  })
                : null
            }
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
                  label="Moderation"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    count: asNumber(counts[t.key]),
                    href: staysHref('/stays/reviews', period, city, {
                      tab: t.key === 'all' ? null : t.key,
                      q: q || null,
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
                  <DashClear params={['q', 'tab', 'rating', 'selected']} />
                </FilterRow>
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
                          {x.text ? `“${x.text}”` : <span className="text-muted">Stars only</span>}
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
                  total={asNumber(o.total)}
                  noun="reviews"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
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
                <DashCard title="What Guests Mention">
                  {themes.length === 0 ? (
                    <Empty>No review themes recorded yet.</Empty>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
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
                  <SidePanel
                    title="Review"
                    closeHref={href({ selected: null })}
                    badge={<Chip status={r.moderation} />}
                  >
                    <PersonCell
                      name={r.guest_name}
                      sub={`${r.property_name ?? ''} ${r.unit_label ?? ''} · ${r.nights} nights`}
                    />
                    <p className="mt-2">
                      <StarRow value={r.rating} />
                    </p>
                    <p className="mt-2 text-[0.9375rem] leading-relaxed">
                      {r.text ? `“${r.text}”` : 'The guest left stars only.'}
                    </p>
                    {r.staff_reply && (
                      <p className="bg-bg mt-2 rounded-lg p-3 text-[0.875rem]">
                        <span className="font-bold">NexG replied:</span> {r.staff_reply}
                      </p>
                    )}
                    <div className="mt-4">
                      <ReviewControls
                        stayId={r.stay_id}
                        moderation={r.moderation}
                        featured={r.featured}
                      />
                    </div>
                  </SidePanel>
                ) : (
                  <PanelHint>Choose a review to respond, feature or hide it.</PanelHint>
                )}
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
