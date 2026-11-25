import { formatRange } from '@nexg/ui';
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  Folder,
  FolderOpen,
  PiggyBank,
  Plus,
  Receipt,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut, TrendArea } from '@/components/charts';
import { QuickFolders, type FolderRow } from '@/components/company/files';
import {
  AddExpense,
  BudgetsEditor,
  CategoryGlyph,
  ExpensesTable,
  type BudgetRow,
  type Choice,
  type ExpenseRow,
} from '@/components/finance/office';
import { MonthlyReportLinks } from '@/components/finance/monthly-report-links';
import { OfficeReport } from '@/components/finance/office-report';
import { ConsoleShell } from '@/components/console-shell';
import { RangeControl } from '@/components/portal/client-kit';
import {
  PageHeader,
  PanelHead,
  Ring,
  Sheet,
  Stat,
  StatGrid,
  ViewTabs,
} from '@/components/portal/kit';
import {
  budgetFor,
  byCategory,
  lastMonths,
  monthlySpend,
  monthsBetween,
  previousPeriod,
  spendBetween,
  SPEND,
  utilisation,
  vsLabel,
} from '@/lib/office-finance';
import {
  change,
  hrefWith,
  kes,
  kesShort,
  periodFrom,
  periodQuery,
  todayInNairobi,
} from '@/lib/portal';
import { companyAccess } from '@/lib/company';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Office Finance' };
export const dynamic = 'force-dynamic';

type Tab = 'expenses' | 'approvals' | 'budgets' | 'reports' | 'files';

const EXPENSE_COLUMNS =
  '*, submitter:staff_user!fin_office_expense_submitted_by_fkey(display_name, email), decider:staff_user!fin_office_expense_decided_by_fkey(display_name), vendor:company_vendor(name), location:company_location(name)';

/**
 * Finance → Office finance: what NexG spends on running itself, approved
 * by a second person, paid with a reference, and measured against monthly
 * budgets. Every figure is summed from fin_office_expense and
 * fin_office_budget; spend means approved and paid expenses.
 */
export default async function OfficeFinancePage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string; month?: string; new?: string };
}) {
  const staff = await requireStaff();
  const mod = requireModule(staff, 'finance');
  const canWrite = staff.isSuperAdmin || mod.level === 'full';
  const tab: Tab = (['expenses', 'approvals', 'budgets', 'reports', 'files'] as const).includes(
    searchParams?.tab as Tab,
  )
    ? (searchParams!.tab as Tab)
    : 'expenses';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const today = todayInNairobi();
  const trendMonths = lastMonths(period.to, 6);
  const reportMonths = lastMonths(today, 6);
  const budgetMonth =
    searchParams?.month && /^\d{4}-\d{2}-01$/.test(searchParams.month)
      ? searchParams.month
      : `${today.slice(0, 7)}-01`;
  const before = previousPeriod(period.from, period.to);
  const earliest = [trendMonths[0]!, before.from, reportMonths[0]!, budgetMonth].sort()[0]!;
  const supabase = createClient();

  /* Files tab: Company folders marked office_finance, read through Company's
     own rules, so it needs Company access as well. */
  const companyMod = staff.modules.find((m) => m.key === 'company');
  const companyCan = companyAccess(companyMod?.level, staff.isSuperAdmin);
  const seesCompany = staff.isSuperAdmin || !!companyMod;

  const [expensesRes, budgetsRes, vendorsRes, locationsRes, foldersRes] = await Promise.all([
    supabase
      .from('fin_office_expense')
      .select(EXPENSE_COLUMNS)
      .gte('spent_on', earliest)
      .order('spent_on', { ascending: false })
      .order('submitted_at', { ascending: false })
      .limit(5000),
    supabase
      .from('fin_office_budget')
      .select('month, category, amount_cents')
      .gte('month', earliest),
    supabase.from('company_vendor').select('id, name').eq('status', 'active').order('name'),
    supabase.from('company_location').select('id, name').eq('active', true).order('name'),
    tab === 'files' && seesCompany
      ? supabase.from('company_folder_v').select('*').order('name')
      : Promise.resolve({ data: [], error: null }),
  ]);

  const allFolders = ((foldersRes.data ?? []) as Partial<FolderRow & { area: string | null }>[])
    .filter((f) => f.id)
    .map((f) => ({
      id: f.id!,
      name: f.name ?? '',
      color: f.color ?? 'gold',
      last_change: f.last_change ?? null,
      file_count: Number(f.file_count ?? 0),
      bytes: Number(f.bytes ?? 0),
      parent_id: f.parent_id ?? null,
      sort: Number(f.sort ?? 1000),
      sub_count: Number(f.sub_count ?? 0),
      all_file_count: Number(f.all_file_count ?? f.file_count ?? 0),
      all_bytes: Number(f.all_bytes ?? f.bytes ?? 0),
      area: f.area ?? null,
    }));
  const financeTops = allFolders
    .filter((f) => !f.parent_id && f.area === 'office_finance')
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const financeFolders: FolderRow[] = allFolders.filter((f) =>
    financeTops.some((t) => t.id === f.id || t.id === f.parent_id),
  );

  const all = (expensesRes.data ?? []) as unknown as ExpenseRow[];
  const budgets = (budgetsRes.data ?? []) as BudgetRow[];
  const vendors = (vendorsRes.data ?? []) as Choice[];
  const locations = (locationsRes.data ?? []) as Choice[];
  const failed = expensesRes.error || budgetsRes.error || foldersRes.error;

  const inPeriod = all.filter((e) => e.spent_on >= period.from && e.spent_on <= period.to);
  const spent = spendBetween(all, period.from, period.to);
  const spentBefore = spendBetween(all, before.from, before.to);
  const periodMonths = monthsBetween(period.from, period.to);
  const budget = budgetFor(budgets, periodMonths);
  const used = utilisation(spent, budget);
  const transactions = inPeriod.filter((e) => SPEND.has(e.status)).length;
  const waiting = all.filter((e) => e.status === 'submitted');
  const waitingForMe = waiting.filter(
    (e) => canWrite && (e.submitted_by !== staff.staffId || staff.isSuperAdmin),
  );
  const categories = byCategory(inPeriod);
  const trend = monthlySpend(all, trendMonths).map((m) => ({
    day: m.month,
    spend: Math.round(m.cents / 100),
    budget: Math.round(budgetFor(budgets, [m.month]) / 100),
  }));
  const hasBudget = trend.some((t) => t.budget > 0);

  const href = (t: string, extra: Record<string, string | null> = {}) =>
    hrefWith('/finance/office', {
      tab: t === 'expenses' ? null : t,
      ...extra,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  /* Budgets tab: spend in the chosen month, per category. */
  const monthSpend: Record<string, number> = {};
  for (const e of all) {
    if (SPEND.has(e.status) && e.spent_on.slice(0, 7) === budgetMonth.slice(0, 7)) {
      monthSpend[e.category] = (monthSpend[e.category] ?? 0) + e.amount_cents;
    }
  }
  const budgetMonths = [...lastMonths(today, 6), ...nextMonths(today, 3)].map((m) => ({
    value: m,
    label: new Date(`${m}T12:00:00Z`).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    }),
  }));

  /* Reports tab: spend by category and month. */
  const matrix: Record<string, Record<string, number>> = {};
  for (const e of all) {
    if (!SPEND.has(e.status)) continue;
    const m = `${e.spent_on.slice(0, 7)}-01`;
    if (!reportMonths.includes(m)) continue;
    matrix[e.category] ??= {};
    matrix[e.category]![m] = (matrix[e.category]![m] ?? 0) + e.amount_cents;
  }
  const monthBudgets = Object.fromEntries(reportMonths.map((m) => [m, budgetFor(budgets, [m])]));

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={FolderOpen}
        title="Office Finance"
        subtitle="Manage and track all office expenses, budgets, and approvals."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canWrite && <AddExpense vendors={vendors} locations={locations} />}
          </>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <ViewTabs
          active={tab}
          tabs={[
            { key: 'expenses', label: 'Expenses', icon: Receipt, href: href('expenses') },
            ...(canWrite
              ? [
                  {
                    key: 'add',
                    label: 'Add Expense',
                    icon: Plus,
                    href: href('expenses', { new: '1' }),
                  },
                ]
              : []),
            {
              key: 'approvals',
              label: 'Approvals',
              icon: ClipboardCheck,
              href: href('approvals'),
              alert: waitingForMe.length,
            },
            { key: 'budgets', label: 'Budgets', icon: PiggyBank, href: href('budgets') },
            { key: 'reports', label: 'Reports', icon: FileText, href: href('reports') },
            { key: 'files', label: 'Files', icon: Folder, href: href('files') },
          ]}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Office finance could not be loaded in full: {failed.message}
          </p>
        )}

        {tab === 'expenses' && (
          <>
            <StatGrid>
              <Stat
                icon={Wallet}
                value={kes(spent)}
                label="Total Office Expenses"
                delta={
                  change(spent, spentBefore) == null
                    ? null
                    : { value: change(spent, spentBefore)!, upIsBad: true }
                }
                deltaNote={vsLabel(before)}
                note={spentBefore === 0 ? 'Approved and paid this period' : undefined}
              />
              <Stat
                icon={PiggyBank}
                value={budget ? kes(budget) : null}
                label={periodMonths.length > 1 ? 'Budget for These Months' : 'Budget This Month'}
                note={budget ? undefined : 'No budget set'}
                href={href('budgets')}
              />
              <Stat
                icon={BarChart3}
                visual={<Ring value={used} label="Budget used" />}
                value={used == null ? null : `${Math.round(used)}%`}
                label="Budget Used"
                tone={used != null && used > 100 ? 'red' : 'gold'}
                note={
                  used == null
                    ? 'Set budgets to measure this'
                    : used > 100
                      ? `Over by ${kes(spent - budget)}`
                      : `${kes(budget - spent)} left`
                }
                noteTone={used != null && used > 100 ? 'bad' : 'good'}
              />
              <Stat
                icon={Receipt}
                value={transactions.toLocaleString('en-KE')}
                label="Expense Transactions"
                note={waiting.length ? `${waiting.length} waiting for approval` : undefined}
                href={waiting.length ? href('approvals') : undefined}
              />
            </StatGrid>

            <div className="grid gap-5 xl:grid-cols-2">
              <Sheet>
                <PanelHead title="Expenses by Category" aside={formatRange(period)} />
                <div className="mt-4">
                  {categories.length ? (
                    <ShareDonut
                      unit="kes"
                      centre={kesShort(spent)}
                      caption="Spent"
                      data={categories.map((c) => ({
                        key: c.key,
                        label: c.label,
                        value: Math.round(c.cents / 100),
                        color: c.color,
                      }))}
                    />
                  ) : (
                    <p className="text-muted-light py-12 text-center text-sm">
                      No approved or paid office expenses in this period.
                    </p>
                  )}
                </div>
              </Sheet>
              <Sheet>
                <PanelHead title="Monthly Office Expenses" aside="last six months" />
                <div className="mt-4">
                  {trend.some((t) => t.spend > 0) ? (
                    <TrendArea
                      data={trend}
                      unit="kes"
                      step="month"
                      series={[
                        { key: 'spend', label: 'Spent', color: '#F5B800', fill: true },
                        ...(hasBudget
                          ? [{ key: 'budget', label: 'Budget', color: '#141414' }]
                          : []),
                      ]}
                    />
                  ) : (
                    <p className="text-muted-light py-12 text-center text-sm">
                      Nothing spent in the last six months yet.
                    </p>
                  )}
                </div>
              </Sheet>
            </div>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Sheet>
                <ExpensesTable
                  rows={inPeriod}
                  me={staff.staffId}
                  isSuperAdmin={staff.isSuperAdmin}
                  canWrite={canWrite}
                  vendors={vendors}
                  locations={locations}
                  title="Recent Office Expenses"
                  compact
                />
              </Sheet>
              <Sheet>
                <PanelHead title="Top Expense Categories" aside={formatRange(period)} />
                {categories.length === 0 ? (
                  <p className="text-muted-light py-8 text-center text-sm">Nothing to rank yet.</p>
                ) : (
                  <ul className="mt-4 space-y-4">
                    {categories.slice(0, 6).map((c) => (
                      <li key={c.key} className="flex items-center gap-3">
                        <span className="bg-gold-soft text-gold-text flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                          <CategoryGlyph category={c.key} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate font-bold">{c.label}</span>
                            <span className="font-extrabold tabular-nums">{kes(c.cents)}</span>
                          </span>
                          <span className="mt-1.5 flex items-center gap-2">
                            <span className="bg-border/70 h-2 flex-1 overflow-hidden rounded-full">
                              <span
                                className="from-gold-deep to-gold block h-full rounded-full bg-gradient-to-r"
                                style={{ width: `${c.share}%` }}
                              />
                            </span>
                            <span className="text-muted w-10 text-right text-xs font-bold tabular-nums">
                              {Math.round(c.share)}%
                            </span>
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Sheet>
            </div>
          </>
        )}

        {tab === 'approvals' && (
          <Sheet>
            <ExpensesTable
              rows={waiting}
              me={staff.staffId}
              isSuperAdmin={staff.isSuperAdmin}
              canWrite={canWrite}
              vendors={vendors}
              locations={locations}
              title={
                canWrite ? 'Waiting for Approval' : 'Waiting for Approval (full Finance decides)'
              }
              approvals
            />
          </Sheet>
        )}

        {tab === 'budgets' && (
          <Sheet>
            <BudgetsEditor
              month={budgetMonth}
              months={budgetMonths}
              budgets={budgets}
              spend={monthSpend}
              canWrite={canWrite}
            />
          </Sheet>
        )}

        {tab === 'reports' && (
          <>
            <MonthlyReportLinks today={today} />
            <Sheet>
              <OfficeReport months={reportMonths} matrix={matrix} budgets={monthBudgets} />
            </Sheet>
          </>
        )}

        {tab === 'files' &&
          (!seesCompany ? (
            <Sheet>
              <p className="text-muted text-sm">
                These folders live in Company files. Ask an admin for Company access to open them.
              </p>
            </Sheet>
          ) : financeTops.length === 0 ? (
            <Sheet>
              <p className="text-muted text-sm">No Office Finance folders yet.</p>
            </Sheet>
          ) : (
            financeTops.map((f) => (
              <Sheet key={f.id}>
                <QuickFolders
                  folders={financeFolders}
                  canWrite={companyCan.canWrite}
                  period={pq}
                  parent={f}
                  title={f.name}
                />
              </Sheet>
            ))
          ))}
      </main>
    </ConsoleShell>
  );
}

/** The first days of the next n months after the month of `day`. */
function nextMonths(day: string, n: number): string[] {
  let y = Number(day.slice(0, 4));
  let m = Number(day.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
  }
  return out;
}
