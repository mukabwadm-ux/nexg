import {
  CalendarDays,
  CircleCheck,
  CirclePlus,
  CircleX,
  Coins,
  HandCoins,
  Layers,
  Percent,
  RefreshCw,
  Settings,
  Timer,
  Users,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { ExportSettlements, SettlementMenu } from '@/components/payouts/payouts-client';
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
  HeaderButton,
  MerchantCell,
  Pagination,
  StatusChip,
} from '@/components/portal/dash';
import { DashSelect } from '@/components/portal/dash-filters';
import { merchantPhotoUrl, shortCategory } from '@/lib/merchant-categories';
import { change, kes, money, moneyShort } from '@/lib/performance';
import {
  isPayoutTab,
  isRail,
  PAYOUT_TABS,
  parsePayouts,
  payoutChip,
  RAILS,
  runChip,
  type PayoutTab,
} from '@/lib/payouts';
import { hrefWith, periodLast30 } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Payouts & Settlements' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 5;

const TAB_ICON = {
  all: Wallet,
  pending: RefreshCw,
  settled: CircleCheck,
  failed: CircleX,
  scheduled: CalendarDays,
} as const;

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const day = (iso: string | null) =>
  iso ? dateFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '—';

/**
 * Merchants → Payouts & Settlements: what merchants earned in the period,
 * what NexG kept, what is owed and where each merchant's money stands in
 * the weekly settlement runs. Everything comes from rpc_merchant_payouts.
 * Building and approving runs stays in Finance → Settlements.
 */
export default async function PayoutsPage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    category?: string;
    rail?: string;
    cycle?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}) {
  const staff = await requireStaff();
  if (!staff.modules.some((m) => m.key === 'merchants' || m.key === 'finance'))
    requireModule(staff, 'merchants');
  const reach = (key: string) => staff.isSuperAdmin || staff.modules.some((m) => m.key === key);

  const tab: PayoutTab = isPayoutTab(searchParams?.tab) ? searchParams!.tab : 'all';
  const category = (searchParams?.category ?? 'all').slice(0, 60);
  const rail = isRail(searchParams?.rail) ? searchParams!.rail : null;
  const period = periodLast30(searchParams);
  const explicit = Boolean(searchParams?.from && searchParams?.to);
  const page = Math.max(1, Math.min(10_000, Number(searchParams?.page) || 1));

  const supabase = createClient();
  const [res, categoriesRes] = await Promise.all([
    supabase.rpc('rpc_merchant_payouts', {
      p_from: period.from,
      p_to: period.to,
      p_keys: category === 'all' ? undefined : [category],
      p_rail: rail ?? undefined,
      p_status: tab === 'all' ? undefined : tab,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.from('category_config').select('category, label').eq('is_active', true).order('sort'),
  ]);
  const p = parsePayouts(res.data);
  const k = p.kpis;
  const keep = {
    category: category === 'all' ? null : category,
    rail,
    from: explicit ? period.from : null,
    to: explicit ? period.to : null,
  };
  const tabHref = (t: PayoutTab) =>
    hrefWith('/merchants/payouts', { ...keep, tab: t === 'all' ? null : t });
  const pageHref = (n: number) =>
    hrefWith('/merchants/payouts', {
      ...keep,
      tab: tab === 'all' ? null : tab,
      page: n === 1 ? null : String(n),
    });
  const range = `${day(period.from)} – ${day(period.to)}`;

  return (
    <ConsoleShell staff={staff}>
      <DashHeader
        title="Payouts & Settlements"
        subtitle="Manage merchant payouts, settlements, commissions and payment reconciliations."
        actions={
          <>
            {reach('settings') && (
              <HeaderButton icon={Settings} href="/settings?tab=settlement">
                Settlement Rules
              </HeaderButton>
            )}
            {reach('finance') && (
              <HeaderButton icon={Layers} href="/finance/reconciliation">
                Reconciliation
              </HeaderButton>
            )}
            {reach('finance') && (
              <HeaderButton icon={CirclePlus} gold href="/finance/settlements?tab=batches">
                Create Payout
              </HeaderButton>
            )}
          </>
        }
      />

      <DashCanvas>
        {res.error && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Payouts could not be loaded: {res.error.message}
          </p>
        )}

        <DashKpiGrid>
          <DashKpi
            featured
            icon={Coins}
            label="Gross Transaction Value"
            value={money(k.gtv.now)}
            delta={change(k.gtv.now, k.gtv.before)}
            explain="Merchants' item sales in the period (orders not cancelled, refunded or disputed), against the same number of days before."
          />
          <DashKpi
            icon={Percent}
            label="NEXG Commission"
            value={money(k.commission.now)}
            delta={change(k.commission.now, k.commission.before)}
            explain="Commission on those sales without its VAT: NexG's revenue."
          />
          <DashKpi
            icon={Users}
            label="Merchant Payouts"
            value={money(k.payouts.now)}
            delta={change(k.payouts.now, k.payouts.before)}
            explain="What merchants are owed for the period: sales less commission and its VAT."
          />
          <DashKpi
            icon={Timer}
            label="Pending Payouts"
            value={money(k.pending)}
            explain="Payouts for the period that are not in a settlement run yet, or are held."
          />
          <DashKpi
            icon={CircleCheck}
            iconTone="green"
            label="Settled (This Month)"
            value={money(k.settled_month)}
            explain="Merchant settlement lines paid, sent or netted since the first of this month."
          />
        </DashKpiGrid>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start min-[1600px]:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 space-y-4">
            <GoldTabs
              label="Settlement status"
              active={tab}
              tabs={PAYOUT_TABS.map((t) => ({
                key: t.key,
                label:
                  t.key === 'all'
                    ? t.label
                    : `${t.label} (${p.tabs[t.key].toLocaleString('en-KE')})`,
                icon: TAB_ICON[t.key],
                href: tabHref(t.key),
              }))}
            />

            <section
              aria-label="Filters"
              className="bg-surface flex flex-wrap items-center gap-3 rounded-2xl p-3 sm:p-4"
            >
              <DashSelect
                label="Category"
                param="category"
                value={category}
                options={((categoriesRes.data ?? []) as { category: string; label: string }[]).map(
                  (c) => ({
                    value: c.category,
                    label: shortCategory(c.category, c.label),
                  }),
                )}
                className="min-w-[10rem] flex-1"
              />
              <DashSelect
                label="Payout Type"
                param="rail"
                value={rail ?? 'all'}
                options={RAILS.map((r) => ({ value: r.value, label: r.label }))}
                className="min-w-[10rem] flex-1"
              />
              <DashSelect
                label="Settlement Cycle"
                param="cycle"
                value={searchParams?.cycle === 'weekly' ? 'weekly' : 'all'}
                options={[{ value: 'weekly', label: 'Weekly' }]}
                className="min-w-[11rem] flex-1"
              />
              <RangeControl from={period.from} to={period.to} tone="light" />
              <ExportSettlements
                period={`${period.from}-to-${period.to}`}
                rows={p.rows.map((r) => ({
                  name: r.name,
                  category: r.category_label,
                  gmv: kes(r.gmv),
                  commission: kes(r.commission),
                  vat: kes(r.vat),
                  payout: kes(r.payout),
                  status: payoutChip(r.status, r.status_note).label,
                  payoutDate: r.payout_date ?? '',
                  run: r.run_reference ?? '',
                }))}
              />
            </section>

            <DashCard title={`Merchant Settlements (${p.total.toLocaleString('en-KE')})`}>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left text-[0.8125rem] min-[1600px]:text-[0.875rem]">
                  <caption className="sr-only">Merchant settlements for {range}</caption>
                  <thead>
                    <tr className="text-ink font-bold">
                      <th scope="col" className="bg-bg rounded-l-lg px-3 py-3">
                        Merchant / Outlet
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3">
                        Category
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3 text-right">
                        GMV (Period)
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3 text-right">
                        Commission
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3 text-right">
                        Payout Amount
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3">
                        Status
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3">
                        Payout Date
                      </th>
                      <th scope="col" className="bg-bg rounded-r-lg px-2 py-3 text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-muted px-3 py-10 text-center font-semibold">
                          {tab === 'all' && !rail && category === 'all'
                            ? 'No merchant sales in this period.'
                            : 'Nothing matches these filters.'}
                        </td>
                      </tr>
                    ) : (
                      p.rows.map((r) => {
                        const chip = payoutChip(r.status, r.status_note);
                        const cell = 'border-border border-b px-2 py-2.5';
                        return (
                          <tr key={r.merchant_id}>
                            <td className={`${cell} w-full max-w-0 pl-3`}>
                              <MerchantCell
                                name={r.name}
                                place={r.area}
                                photoUrl={merchantPhotoUrl(r.photo_path)}
                                href={`/merchants/${r.merchant_id}`}
                              />
                            </td>
                            <td className={cell}>
                              <CategoryChip
                                label={shortCategory(r.category_key, r.category_label)}
                                icon={categoryIcon(r.category_key)}
                              />
                            </td>
                            <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>
                              {money(r.gmv)}
                            </td>
                            <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>
                              {money(r.commission)}
                            </td>
                            <td
                              className={`${cell} whitespace-nowrap text-right font-bold tabular-nums`}
                            >
                              {money(r.payout)}
                            </td>
                            <td className={cell}>
                              <span title={r.hold_reason ?? undefined}>
                                <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                              </span>
                            </td>
                            <td className={`${cell} whitespace-nowrap tabular-nums`}>
                              {day(r.payout_date)}
                            </td>
                            <td className={`${cell} text-center`}>
                              <SettlementMenu
                                merchantId={r.merchant_id}
                                name={r.name}
                                canFinance={reach('finance')}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                size={PAGE_SIZE}
                total={p.total}
                noun="settlements"
                href={pageHref}
              />
              <p className="text-muted mt-3 text-[0.8125rem] font-semibold">
                Statements, commission tiers and payout holds:{' '}
                <Link
                  href="/merchants?tab=finance"
                  className="text-[#B57A00] underline underline-offset-4"
                >
                  merchant finance
                </Link>
                .
              </p>
            </DashCard>
          </div>

          <div className="space-y-4">
            <DashCard title="Settlement Summary" titleNote={`(${range})`}>
              {p.summary.gmv === 0 ? (
                <p className="text-muted py-8 text-center text-[0.875rem] font-semibold">
                  No merchant sales in this period.
                </p>
              ) : (
                <>
                  <ShareDonut
                    stacked
                    unit="kes"
                    centre={moneyShort(p.summary.gmv).replace('KES ', 'KES ')}
                    caption="GMV"
                    data={[
                      {
                        key: 'payouts',
                        label: 'Merchant Payouts',
                        value: kes(p.summary.payouts),
                        color: '#F5B800',
                      },
                      {
                        key: 'commission',
                        label: 'NEXG Commission',
                        value: kes(p.summary.commission),
                        color: '#1A1A1A',
                      },
                      {
                        key: 'vat',
                        label: 'VAT (on Commission)',
                        value: kes(p.summary.vat),
                        color: '#C9C6BE',
                      },
                    ]}
                  />
                </>
              )}
            </DashCard>

            <DashCard
              title="Recent Settlements"
              aside={
                reach('finance') ? (
                  <CardLink href="/finance/settlements?tab=batches">View All</CardLink>
                ) : undefined
              }
            >
              {p.runs.length === 0 ? (
                <p className="text-muted py-4 text-[0.875rem] font-semibold">
                  No settlement runs yet. Finance builds them weekly.
                </p>
              ) : (
                <ul>
                  {p.runs.map((r) => {
                    const chip = runChip(r.state);
                    return (
                      <li
                        key={r.reference}
                        className="border-border flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <CircleCheck
                            aria-hidden="true"
                            className={`h-5 w-5 shrink-0 ${chip.tone === 'green' ? 'fill-[#1E9E45] text-white' : 'text-muted-light'}`}
                          />
                          <span className="truncate text-[0.875rem] font-bold">
                            Batch #{r.reference}
                          </span>
                        </span>
                        <span className="text-[0.875rem] font-bold tabular-nums">
                          {moneyShort(r.merchants_cents)}
                        </span>
                        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashCard>

            <section
              aria-label="Next settlement"
              className="grid grid-cols-2 gap-3 rounded-2xl bg-gradient-to-b from-[#FFF3CC] to-[#FFE7A1] p-4 text-[#1A1A1A]"
            >
              <div className="flex items-start gap-2.5">
                <CalendarDays
                  aria-hidden="true"
                  className="mt-0.5 h-6 w-6 shrink-0 text-[#B57A00]"
                />
                <div>
                  <p className="text-[0.8125rem] font-bold">Next Settlement</p>
                  <p className="text-[1.0625rem] font-extrabold">{day(p.next_settlement)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 border-l border-[#E5C76B] pl-3">
                <HandCoins aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#B57A00]" />
                <div>
                  <p className="text-[0.8125rem] font-bold">Estimated Payout</p>
                  <p className="text-[1.0625rem] font-extrabold tabular-nums">
                    {money(p.estimated_payout)}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </DashCanvas>
    </ConsoleShell>
  );
}
