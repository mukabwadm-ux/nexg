import {
  BedDouble,
  Coins,
  LayoutGrid,
  Percent,
  Shirt,
  ShoppingCart,
  Star,
  Store,
  Ticket,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wrench,
  BarChart3,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import { ExportPerformance, PerformanceTrend } from '@/components/performance/performance-client';
import { RangeControl } from '@/components/portal/client-kit';
import {
  categoryIcon,
  CardLink,
  CategoryChip,
  DashCanvas,
  DashCard,
  DashHeader,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  MerchantCell,
} from '@/components/portal/dash';
import {
  groupKeys,
  isCategoryGroup,
  merchantPhotoUrl,
  shortCategory,
  type CategoryGroup,
} from '@/lib/merchant-categories';
import {
  byGroup,
  change,
  insights,
  isBoard,
  kes,
  leaderboard,
  money,
  moneyShort,
  parsePerformance,
  type Board,
} from '@/lib/performance';
import { hrefWith, periodLast30 } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Merchant Performance' };
export const dynamic = 'force-dynamic';

const GROUPS: { key: CategoryGroup; label: string; icon: typeof Store }[] = [
  { key: 'all', label: 'All Categories', icon: LayoutGrid },
  { key: 'food', label: 'Food', icon: Utensils },
  { key: 'stays', label: 'Stays', icon: BedDouble },
  { key: 'experiences', label: 'Experiences', icon: Ticket },
  { key: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { key: 'apparel', label: 'Apparel', icon: Shirt },
  { key: 'services', label: 'Services', icon: Wrench },
];

const BOARDS: { key: Board; label: string }[] = [
  { key: 'sales', label: 'Top by Sales' },
  { key: 'orders', label: 'Top by Orders' },
  { key: 'growth', label: 'Top Growth' },
  { key: 'rated', label: 'Top Rated' },
];

function Growth({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-light font-semibold">New</span>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold ${up ? 'text-[#1E7B34]' : 'text-[#C62D22]'}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {up ? '+' : '−'}
      {Math.abs(value)}%
    </span>
  );
}

/**
 * Merchants → Performance: sales, commission, orders, active merchants and
 * ratings for the period against the one before, the trend, the split by
 * category and the leaderboards. Everything comes from
 * rpc_merchant_performance; nothing here is estimated.
 */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams?: { tab?: string; board?: string; from?: string; to?: string };
}) {
  const staff = await requireStaff();
  if (!staff.modules.some((m) => m.key === 'merchants' || m.key === 'finance'))
    requireModule(staff, 'merchants');

  const group: CategoryGroup =
    isCategoryGroup(searchParams?.tab) && searchParams!.tab !== 'more' ? searchParams!.tab : 'all';
  const board: Board = isBoard(searchParams?.board) ? searchParams!.board : 'sales';
  const period = periodLast30(searchParams);
  const explicit = Boolean(searchParams?.from && searchParams?.to);
  const days = Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86_400_000) + 1;

  const supabase = createClient();
  const res =
    group === 'stays'
      ? null
      : await supabase.rpc('rpc_merchant_performance', {
          p_from: period.from,
          p_to: period.to,
          p_keys: groupKeys(group) ?? undefined,
        });
  const p = parsePerformance(res?.data);
  const k = p.kpis;
  const groups = byGroup(p.categories);
  const top = p.merchants.filter((m) => m.gmv > 0).slice(0, 3);
  const board5 = leaderboard(p.merchants, board);
  const notes = insights(p);
  const keep = { from: explicit ? period.from : null, to: explicit ? period.to : null };
  const ratingDelta =
    k.rating.now != null && k.rating.before != null
      ? Math.round((k.rating.now - k.rating.before) * 10) / 10
      : null;

  return (
    <ConsoleShell staff={staff}>
      <DashHeader
        title="Merchant Performance"
        subtitle="Track merchant sales, orders, commissions, growth and overall performance across all categories."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} showPreset />
            <ExportPerformance
              period={`${period.from}-to-${period.to}`}
              rows={p.merchants.map((m) => ({
                name: m.name,
                category: m.category_label,
                gmv: kes(m.gmv),
                commission: kes(m.commission),
                orders: m.orders,
                prevGmv: kes(m.prev_gmv),
                rating: m.rating == null ? '' : String(m.rating),
              }))}
            />
          </>
        }
      />

      <DashCanvas>
        {res?.error && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Performance could not be loaded: {res.error.message}
          </p>
        )}

        <DashKpiGrid>
          <DashKpi
            featured
            icon={Coins}
            label="GMV (Total Sales)"
            value={money(k.gmv.now)}
            delta={change(k.gmv.now, k.gmv.before)}
            explain="The item subtotal of orders placed in the period that were not cancelled, refunded or disputed, against the same number of days before. Delivery and service fees are not sales."
          />
          <DashKpi
            icon={Percent}
            label="NEXG Commission"
            value={money(k.commission.now)}
            delta={change(k.commission.now, k.commission.before)}
            explain="Commission on those orders without its VAT: what NexG earns from merchants."
          />
          <DashKpi
            icon={ShoppingCart}
            label="Total Orders"
            value={k.orders.now.toLocaleString('en-KE')}
            delta={change(k.orders.now, k.orders.before)}
            explain="Orders placed in the period that were not cancelled, refunded or disputed."
          />
          <DashKpi
            icon={Store}
            label="Active Merchants"
            value={k.active.now.toLocaleString('en-KE')}
            delta={change(k.active.now, k.active.before)}
            explain="Merchants live at the end of the period, against those live at its start."
          />
          <DashKpi
            icon={Star}
            label="Avg. Merchant Rating"
            value={k.rating.now == null ? null : `${k.rating.now.toFixed(1)} / 5`}
            deltaText={
              ratingDelta == null
                ? undefined
                : `${ratingDelta >= 0 ? '+' : '-'}${Math.abs(ratingDelta).toFixed(1)}`
            }
            explain="The average of customers' order ratings in the period. Nobody has been asked to rate an order yet, so there are none."
          >
            {k.rating.now == null && (
              <span className="text-muted mt-1 block text-[0.8125rem] font-semibold">
                No ratings yet
              </span>
            )}
          </DashKpi>
        </DashKpiGrid>

        <GoldTabs
          label="Categories"
          active={group}
          tabs={GROUPS.map((g) => ({
            key: g.key,
            label: g.label,
            icon: g.icon,
            href: hrefWith('/merchants/performance', {
              tab: g.key === 'all' ? null : g.key,
              board: board === 'sales' ? null : board,
              ...keep,
            }),
          }))}
        />

        {group === 'stays' ? (
          <DashCard>
            <p className="text-muted py-12 text-center font-semibold">
              Stays are sold by hosts, not merchants. Their bookings and earnings are under{' '}
              <Link href="/hotels" className="text-[#B57A00] underline underline-offset-4">
                NEXG Stays
              </Link>
              .
            </p>
          </DashCard>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
              <DashCard>
                <PerformanceTrend series={p.series} />
              </DashCard>

              <DashCard title="Category Performance">
                <table className="w-full text-left text-[0.75rem] min-[1600px]:text-[0.8125rem]">
                  <caption className="sr-only">Sales by category</caption>
                  <thead>
                    <tr className="text-ink font-bold">
                      <th scope="col" className="bg-bg rounded-l-lg px-1.5 py-2.5">
                        Category
                      </th>
                      <th scope="col" className="bg-bg px-1.5 py-2.5 text-right">
                        GMV
                      </th>
                      <th scope="col" className="bg-bg px-1.5 py-2.5 text-right">
                        Commission
                      </th>
                      <th scope="col" className="bg-bg rounded-r-lg px-1.5 py-2.5 text-right">
                        Growth
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const Icon = categoryIcon(g.group === 'more' ? 'other' : g.label);
                      return (
                        <tr key={g.group} className="border-border border-b last:border-b-0">
                          <td className="px-1.5 py-2.5 font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Icon
                                aria-hidden="true"
                                className="hidden h-4 w-4 shrink-0 text-[#B57A00] min-[1600px]:block"
                              />
                              {g.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2.5 text-right tabular-nums">
                            {moneyShort(g.gmv)}
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2.5 text-right tabular-nums">
                            {moneyShort(g.commission)}
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2.5 text-right">
                            {g.gmv === 0 && g.prev === 0 ? (
                              <span className="text-muted-light">—</span>
                            ) : (
                              <Growth value={g.growth} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DashCard>

              <DashCard
                title="Top Performing Merchants"
                aside={
                  <CardLink
                    href={
                      hrefWith('/merchants/performance', {
                        tab: group === 'all' ? null : group,
                        board: 'sales',
                        ...keep,
                      }) + '#leaderboard'
                    }
                  >
                    View All
                  </CardLink>
                }
              >
                {top.length === 0 ? (
                  <p className="text-muted py-8 text-center text-[0.875rem] font-semibold">
                    No sales in this period.
                  </p>
                ) : (
                  <ul>
                    {top.map((m) => (
                      <li
                        key={m.id}
                        className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-b-0"
                      >
                        <MerchantCell
                          name={m.name}
                          photoUrl={merchantPhotoUrl(m.photo_path)}
                          href={`/merchants/${m.id}`}
                        />
                        <span className="shrink-0 text-right">
                          <span className="text-ink block text-[0.9375rem] font-extrabold tabular-nums">
                            {moneyShort(m.gmv)}
                          </span>
                          <span className="text-[0.8125rem]">
                            <Growth value={change(m.gmv, m.prev_gmv)} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
              <div id="leaderboard" className="min-w-0">
                <DashCard
                  title="Merchant Leaderboard"
                  aside={
                    <nav aria-label="Leaderboard" className="flex flex-wrap gap-1.5">
                      {BOARDS.map((b) => (
                        <Link
                          key={b.key}
                          href={hrefWith('/merchants/performance', {
                            tab: group === 'all' ? null : group,
                            board: b.key === 'sales' ? null : b.key,
                            ...keep,
                          })}
                          scroll={false}
                          aria-current={board === b.key ? 'page' : undefined}
                          className={`rounded-full px-3 py-1.5 text-[0.8125rem] font-bold transition-colors ${
                            board === b.key
                              ? 'bg-gradient-to-b from-[#FFE07A] to-[#F7C02B] text-[#1A1A1A]'
                              : 'bg-bg text-ink hover:bg-[#EFEDE8]'
                          }`}
                        >
                          {b.label}
                        </Link>
                      ))}
                    </nav>
                  }
                >
                  <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-[0.875rem]">
                      <caption className="sr-only">Merchant leaderboard</caption>
                      <thead>
                        <tr className="text-ink text-[0.8125rem] font-bold">
                          <th scope="col" className="bg-bg w-10 rounded-l-lg px-3 py-2.5">
                            #
                          </th>
                          <th scope="col" className="bg-bg px-2 py-2.5">
                            Merchant
                          </th>
                          <th scope="col" className="bg-bg px-2 py-2.5">
                            Category
                          </th>
                          <th scope="col" className="bg-bg px-2 py-2.5 text-right">
                            GMV ({days} Days)
                          </th>
                          <th scope="col" className="bg-bg px-2 py-2.5 text-right">
                            Commission
                          </th>
                          <th scope="col" className="bg-bg px-2 py-2.5 text-right">
                            Orders
                          </th>
                          <th scope="col" className="bg-bg rounded-r-lg px-3 py-2.5 text-right">
                            Rating
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {board5.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="text-muted px-3 py-10 text-center font-semibold"
                            >
                              {board === 'rated'
                                ? 'No ratings yet.'
                                : board === 'growth'
                                  ? 'Growth needs sales in the period before as well.'
                                  : 'No sales in this period.'}
                            </td>
                          </tr>
                        ) : (
                          board5.map((m, i) => (
                            <tr key={m.id}>
                              <td className="border-border border-b px-3 py-2.5 font-extrabold">
                                {i < 3 ? (
                                  <span
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.75rem] ${
                                      i === 0
                                        ? 'bg-[#F5B800] text-[#1A1A1A]'
                                        : i === 1
                                          ? 'bg-[#C9C6BE] text-[#1A1A1A]'
                                          : 'bg-[#E0A86A] text-[#1A1A1A]'
                                    }`}
                                  >
                                    {i + 1}
                                  </span>
                                ) : (
                                  <span className="pl-1.5">{i + 1}</span>
                                )}
                              </td>
                              <td className="border-border w-full max-w-0 border-b px-2 py-2.5">
                                <MerchantCell
                                  name={m.name}
                                  photoUrl={merchantPhotoUrl(m.photo_path)}
                                  href={`/merchants/${m.id}`}
                                />
                              </td>
                              <td className="border-border border-b px-2 py-2.5">
                                <CategoryChip
                                  label={shortCategory(m.category_key, m.category_label)}
                                  icon={categoryIcon(m.category_key)}
                                />
                              </td>
                              <td className="border-border whitespace-nowrap border-b px-2 py-2.5 text-right tabular-nums">
                                {money(m.gmv)}
                              </td>
                              <td className="border-border whitespace-nowrap border-b px-2 py-2.5 text-right tabular-nums">
                                {money(m.commission)}
                              </td>
                              <td className="border-border border-b px-2 py-2.5 text-right tabular-nums">
                                {m.orders.toLocaleString('en-KE')}
                              </td>
                              <td className="border-border whitespace-nowrap border-b px-3 py-2.5 text-right">
                                {m.rating == null ? (
                                  <span className="text-muted-light">—</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-bold">
                                    <Star
                                      aria-hidden="true"
                                      className="h-4 w-4 fill-[#F5B800] text-[#F5B800]"
                                    />
                                    {m.rating.toFixed(1)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </DashCard>
              </div>

              <DashCard>
                <h2 className="flex items-center gap-2 text-[1.25rem] font-extrabold tracking-[-0.01em]">
                  <BarChart3 aria-hidden="true" className="h-5 w-5 text-[#E5A800]" />
                  Performance Insights
                </h2>
                <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
                  Health scores and strikes:{' '}
                  <Link
                    href="/merchants?tab=health"
                    className="text-[#B57A00] underline underline-offset-4"
                  >
                    merchant health
                  </Link>
                  .
                </p>
                <ul className="mt-4 space-y-3">
                  {notes.map((n) => (
                    <li
                      key={n}
                      className="border-border flex items-start gap-2.5 rounded-xl border p-3 text-[0.875rem] font-semibold"
                    >
                      {['down', 'fell', 'decreased'].some((w) => n.includes(` ${w} `)) ? (
                        <TrendingDown
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#C62D22]"
                        />
                      ) : (
                        <TrendingUp
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#1E9E45]"
                        />
                      )}
                      {n}
                    </li>
                  ))}
                </ul>
              </DashCard>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
