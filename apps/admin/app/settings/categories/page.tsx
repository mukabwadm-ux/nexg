import {
  BadgePercent,
  History,
  Layers,
  Percent,
  Scale,
  Settings2,
  Store,
  UserCog,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import {
  CategoriesScreen,
  HistoryTable,
  OverridesTable,
} from '@/components/category-commissions/screen';
import { WaitingForDatabase } from '@/components/category-commissions/waiting';
import {
  DashCanvas,
  DashCard,
  DashHeader,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  StatusChip,
} from '@/components/portal/dash';
import {
  APPROVAL_LABEL,
  averageRate,
  band,
  parseHistory,
  parseOverrides,
  parseOverview,
  pct,
} from '@/lib/category-commissions';
import { isMissingFunction } from '@/lib/customers';
import { hrefWith } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Categories & Commissions' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'categories', label: 'Categories & Commissions', icon: Layers },
  { key: 'rules', label: 'Commission Rules', icon: Percent },
  { key: 'overrides', label: 'Merchant Overrides', icon: Users },
  { key: 'history', label: 'Change History', icon: History },
  { key: 'settings', label: 'Settings', icon: Settings2 },
] as const;
type Tab = (typeof TABS)[number]['key'];

/**
 * Categories & Commissions (System > Configuration): every master category
 * with the commission merchants in it are charged, its band from the
 * owner's rate card, VAT treatment, fulfilment and approval rule. Pricing
 * reads the same rates (fn_merchant_commission); nothing here is estimated.
 */
export default async function CategoryCommissionsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; category?: string };
}) {
  const staff = await requireStaff();
  const allowed = ['settings', 'categories', 'finance'].some((key) =>
    staff.modules.some((m) => m.key === key),
  );
  if (!allowed && !staff.isSuperAdmin) requireModule(staff, 'settings');

  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'categories';
  const focus = searchParams?.category ?? null;
  const supabase = createClient();

  const [overviewRes, historyRes, overridesRes] = await Promise.all([
    supabase.rpc('rpc_category_commission_overview'),
    tab === 'categories' || tab === 'history'
      ? supabase.rpc('rpc_category_commission_history', { p_limit: 500 })
      : Promise.resolve({ data: [], error: null }),
    tab === 'categories' || tab === 'overrides'
      ? supabase.rpc('rpc_category_commission_overrides')
      : Promise.resolve({ data: [], error: null }),
  ]);

  const waiting = isMissingFunction(overviewRes.error);
  const overview = overviewRes.error ? null : parseOverview(overviewRes.data);
  const history = parseHistory(historyRes.error ? null : historyRes.data);
  const overrides = parseOverrides(overridesRes.error ? null : overridesRes.data);
  const rows = overview?.categories ?? [];
  const active = rows.filter((r) => r.is_active);
  const subcategories = active.reduce((n, r) => n + r.subcategories.length, 0);
  const avg = overview ? averageRate(rows, overview.presets) : null;
  const noBand = active.filter((r) => band(r) === null);

  return (
    <ConsoleShell staff={staff}>
      <DashHeader
        title="Categories & Commission Configuration"
        subtitle="Manage service categories, commission rates, VAT treatment and operational rules across NexG. Checkout charges these rates from their effective date."
      />

      <DashCanvas>
        {waiting ? (
          <WaitingForDatabase />
        ) : (
          <>
            {overviewRes.error && (
              <p
                role="alert"
                className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Categories could not be loaded: {overviewRes.error.message}
              </p>
            )}

            <DashKpiGrid className="xl:grid-cols-4">
              <DashKpi
                featured
                icon={Layers}
                label="Categories"
                value={active.length.toLocaleString('en-KE')}
                explain="Master categories switched on, that merchants can join and guests can browse."
              >
                <span className="text-muted mt-1.5 block text-[0.8125rem] font-semibold">
                  {(rows.length - active.length).toLocaleString('en-KE')} switched off
                </span>
              </DashKpi>
              <DashKpi
                icon={Store}
                label="Subcategories"
                value={subcategories.toLocaleString('en-KE')}
                explain="Subcategories listed under the active categories."
              />
              <DashKpi
                icon={BadgePercent}
                label="Avg. Commission"
                value={avg === null ? null : pct(avg, 1)}
                explain="The plain average of today's own-delivery rate across the active categories: the category rate where one is set, else the preset."
              />
              <DashKpi
                icon={UserCog}
                label="Custom Overrides"
                value={(overview?.overrides_in_force ?? 0).toLocaleString('en-KE')}
                explain="Merchants charged a rate agreed with them today instead of their category's rate."
                href={hrefWith('/settings/categories', { tab: 'overrides' })}
              />
            </DashKpiGrid>

            <GoldTabs
              label="Categories & Commissions"
              active={tab}
              tabs={TABS.map((t) => ({
                key: t.key,
                label: t.label,
                icon: t.icon,
                href: hrefWith('/settings/categories', {
                  tab: t.key === 'categories' ? null : t.key,
                }),
              }))}
            />

            {overview && tab === 'categories' && (
              <CategoriesScreen
                overview={overview}
                history={history}
                overrides={overrides}
                focus={focus}
              />
            )}

            {overview && tab === 'rules' && (
              <>
                <DashCard title="How a merchant's commission is decided">
                  <ol className="text-ink list-decimal space-y-2 pl-5 text-[0.9375rem] leading-relaxed">
                    <li>
                      <strong>A rate agreed with the merchant</strong>, approved on its page and in
                      force that day (unless its category has merchant overrides switched off).
                    </li>
                    <li>
                      <strong>Else its category&apos;s rate</strong> in force that day: the
                      commission rate for orders the merchant delivers itself (own riders, pickup,
                      dining), the NexG-delivery rate for orders a NexG rider delivers.
                    </li>
                    <li>
                      <strong>Else the preset</strong> on Configuration:{' '}
                      {pct(overview.presets.own_delivery_pct, 0)} when the merchant delivers itself,{' '}
                      {pct(overview.presets.nexg_delivery_pct, 0)} when a NexG rider delivers.
                    </li>
                  </ol>
                  <ul className="text-muted mt-4 space-y-1.5 text-sm font-semibold leading-relaxed">
                    <li>
                      A rate applies from its effective day (Nairobi time). Orders already placed
                      keep the rate they were charged; nothing is re-priced.
                    </li>
                    <li>
                      A rate marked VAT exclusive is charged with {pct(overview.presets.vat_pct, 0)}{' '}
                      VAT added (15% becomes{' '}
                      {pct(Math.round(15 * (100 + overview.presets.vat_pct)) / 100)}). VAT inclusive
                      rates are charged as written, and VAT is split out of them in the books.
                    </li>
                    <li>
                      A merchant charged below {pct(overview.presets.standard_pct, 0)} has the
                      guest&apos;s reduced-commission service fee applied, as before.
                    </li>
                  </ul>
                </DashCard>

                <DashCard
                  title="Indicative bands"
                  titleNote="(owner's rate card, 8.2)"
                  bodyClassName="overflow-x-auto"
                >
                  <table className="w-full min-w-[46rem] text-left text-[0.875rem]">
                    <thead className="text-muted text-[0.8125rem] font-bold">
                      <tr className="border-border border-b">
                        <th className="py-2 pr-3">Category</th>
                        <th className="py-2 pr-3">Rate card group</th>
                        <th className="py-2 pr-3">Band</th>
                        <th className="py-2 pr-3">Commission today</th>
                        <th className="py-2 pr-3">NexG-delivery</th>
                        <th className="py-2 pr-3">Next change</th>
                        <th className="py-2">Approval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((r) => (
                        <tr key={r.category} className="border-border border-b last:border-0">
                          <td className="py-2.5 pr-3 font-bold">{r.label}</td>
                          <td className="text-muted py-2.5 pr-3 font-semibold">
                            {r.rate_group ?? 'Not on the card'}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">{band(r) ?? '—'}</td>
                          <td className="py-2.5 pr-3 font-bold tabular-nums">
                            {r.rate
                              ? pct(r.rate.pct)
                              : `${pct(overview.presets.own_delivery_pct)} (preset)`}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">
                            {r.rate?.nexg_delivery_pct != null
                              ? pct(r.rate.nexg_delivery_pct)
                              : `${pct(overview.presets.nexg_delivery_pct)} (preset)`}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">
                            {r.next_rate
                              ? `${pct(r.next_rate.pct)} from ${r.next_rate.starts_on}`
                              : '—'}
                          </td>
                          <td className="text-muted py-2.5 font-semibold">
                            {APPROVAL_LABEL[r.approval]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {noBand.length > 0 && (
                    <p className="text-muted mt-4 text-sm font-semibold">
                      Not on the rate card, so on the preset with no band:{' '}
                      {noBand.map((r) => r.label).join(', ')}.
                    </p>
                  )}
                </DashCard>
              </>
            )}

            {overview && tab === 'overrides' && (
              <DashCard
                title="Merchant overrides"
                titleNote={`(${overrides.length.toLocaleString('en-KE')})`}
                bodyClassName="overflow-x-auto"
              >
                <p className="text-muted mb-4 text-sm font-semibold">
                  Rates agreed with one merchant, in force, starting later or waiting for approval.
                  Each is asked for and approved on the merchant&apos;s page (Commission card).
                </p>
                <OverridesTable rows={overrides} focus={focus} />
              </DashCard>
            )}

            {overview && tab === 'history' && (
              <DashCard title="Change history" bodyClassName="overflow-x-auto">
                <HistoryTable rows={history} categories={rows} focus={focus} />
              </DashCard>
            )}

            {overview && tab === 'settings' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <DashCard title="Presets these rates fall back to">
                  <dl className="grid grid-cols-2 gap-4 text-[0.9375rem]">
                    <Fact label="Merchant delivers itself">
                      {pct(overview.presets.own_delivery_pct)}
                    </Fact>
                    <Fact label="NexG rider delivers">
                      {pct(overview.presets.nexg_delivery_pct)}
                    </Fact>
                    <Fact label="Standard rate (service fee)">
                      {pct(overview.presets.standard_pct)}
                    </Fact>
                    <Fact label="VAT on commission">{pct(overview.presets.vat_pct)}</Fact>
                  </dl>
                  <p className="text-muted mt-4 text-sm font-semibold">
                    The presets are changed, with a second approver, on{' '}
                    <Link
                      href="/settings"
                      className="font-bold text-[#B57A00] underline underline-offset-4"
                    >
                      Configuration
                    </Link>
                    .
                  </p>
                </DashCard>
                <DashCard title="Who may do what">
                  <ul className="space-y-3 text-[0.9375rem]">
                    <li className="flex items-start justify-between gap-3">
                      <span>Change names, status, bands and fulfilment; ask for a new rate</span>
                      <StatusChip tone={overview.can_edit ? 'green' : 'grey'}>
                        {overview.can_edit ? 'You can' : 'Not you'}
                      </StatusChip>
                    </li>
                    <li className="flex items-start justify-between gap-3">
                      <span>
                        Approve a rate, switch merchant overrides, change the approval rule
                      </span>
                      <StatusChip tone={overview.can_decide ? 'green' : 'grey'}>
                        {overview.can_decide ? 'You can' : 'Not you'}
                      </StatusChip>
                    </li>
                    <li className="flex items-start justify-between gap-3">
                      <span>Add a category</span>
                      <StatusChip tone={overview.can_add ? 'green' : 'grey'}>
                        {overview.can_add ? 'You can' : 'Not you'}
                      </StatusChip>
                    </li>
                  </ul>
                  <p className="text-muted mt-4 text-sm font-semibold">
                    Merchant Ops, Finance and super admins change categories; Finance and super
                    admins approve rates. Nobody approves their own request.
                  </p>
                </DashCard>
                <DashCard title="Subcategories and onboarding" className="lg:col-span-2">
                  <p className="text-[0.9375rem] leading-relaxed">
                    Subcategories, onboarding questions and required documents are edited on{' '}
                    <Link
                      href="/categories"
                      className="font-bold text-[#B57A00] underline underline-offset-4"
                    >
                      Merchants › Categories
                    </Link>
                    , because they change what merchants are asked when they apply.
                  </p>
                  <p className="text-muted mt-2 flex items-center gap-2 text-sm font-semibold">
                    <Scale aria-hidden="true" className="h-4 w-4" /> Every change here is kept in
                    Change History and the audit log with who made it and the old and new values.
                  </p>
                </DashCard>
              </div>
            )}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted text-[0.8125rem] font-semibold">{label}</dt>
      <dd className="text-ink mt-0.5 text-[1.25rem] font-extrabold tabular-nums">{children}</dd>
    </div>
  );
}
