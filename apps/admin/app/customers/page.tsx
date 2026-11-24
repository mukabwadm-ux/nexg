import {
  Activity,
  Ban,
  Crown,
  Repeat,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import { CustomerAvatar, WaitingForDatabase } from '@/components/customers/shared';
import {
  DashCanvas,
  DashCard,
  DashHeader,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  Pagination,
  StatusChip,
} from '@/components/portal/dash';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import {
  ago,
  day,
  displayName,
  isMissingFunction,
  kes,
  oneOf,
  PAGE_SIZE,
  parseList,
  repeatRate,
  SORTS,
  STATUSES,
  type Kind,
  type Sort,
  type Status,
} from '@/lib/customers';
import { hrefWith } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Customers', icon: Users },
  { key: 'accounts', label: 'With an Account', icon: UserCheck },
  { key: 'guests', label: 'Guests (No Account)', icon: UserX },
  { key: 'vip', label: 'VIP', icon: Crown },
  { key: 'suspended', label: 'Suspended', icon: Ban },
] as const;
type Tab = (typeof TABS)[number]['key'];

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'active', label: 'Bought in the last 30 days' },
  { value: 'new', label: 'Joined this month' },
  { value: 'repeat', label: 'Bought more than once' },
  { value: 'never', label: 'Never bought' },
  { value: 'unverified', label: 'Email not verified' },
];

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Newest' },
  { value: 'spend', label: 'Highest spend' },
  { value: 'orders', label: 'Most purchases' },
  { value: 'last', label: 'Last purchase' },
  { value: 'name', label: 'Name A–Z' },
];

/**
 * Customers: everyone who has an account or has bought from NexG, guests who
 * ordered signed out listed under their phone number. KPIs count every
 * customer; the tabs, search and filters choose which rows show. Everything
 * comes from rpc_customer_list; nothing is estimated.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { tab?: string; q?: string; status?: string; sort?: string; page?: string };
}) {
  const staff = await requireStaff();
  if (!staff.isSuperAdmin) requireModule(staff, 'customers');

  const tab: Tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const status: Status =
    tab === 'vip' || tab === 'suspended' ? tab : oneOf(STATUSES, searchParams?.status, 'all');
  const sort: Sort = oneOf(SORTS, searchParams?.sort, 'recent');
  const page = Math.max(1, Math.floor(Number(searchParams?.page) || 1));
  const kind: Kind = tab === 'accounts' ? 'account' : tab === 'guests' ? 'guest' : 'all';

  const { data, error } = await createClient().rpc('rpc_customer_list', {
    p_q: q || undefined,
    p_kind: kind,
    p_status: status,
    p_sort: sort,
    p_page: page,
    p_size: PAGE_SIZE,
  });
  const waiting = isMissingFunction(error);
  const list = parseList(error ? null : data);
  const k = list.kpis;
  const rate = repeatRate(k);
  const keep = {
    q: q || null,
    status: tab === 'vip' || tab === 'suspended' || status === 'all' ? null : status,
    sort: sort === 'recent' ? null : sort,
  };
  const pageHref = (p: number) =>
    hrefWith('/customers', {
      tab: tab === 'all' ? null : tab,
      ...keep,
      page: p > 1 ? String(p) : null,
    });
  const newDelta =
    k.newPrevMonth > 0 ? ((k.newMonth - k.newPrevMonth) / k.newPrevMonth) * 100 : null;

  return (
    <ConsoleShell staff={staff}>
      <DashHeader
        title="Customers"
        subtitle="Everyone who has signed up or bought from NexG: what they bought and booked, what they paid, and their account."
      />

      <DashCanvas>
        {waiting ? (
          <WaitingForDatabase />
        ) : (
          <>
            {error && (
              <p
                role="alert"
                className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Customers could not be loaded: {error.message}
              </p>
            )}

            <DashKpiGrid>
              <DashKpi
                featured
                icon={Users}
                label="Total Customers"
                value={k.total.toLocaleString('en-KE')}
                explain="Everyone with a customer account, and every guest who bought or left a phone number without one."
              >
                <span className="text-muted mt-1.5 block text-[0.8125rem] font-semibold">
                  {k.accounts.toLocaleString('en-KE')} accounts · {k.guests.toLocaleString('en-KE')}{' '}
                  guests
                </span>
              </DashKpi>
              <DashKpi
                icon={UserPlus}
                label="New This Month"
                value={k.newMonth.toLocaleString('en-KE')}
                delta={newDelta}
                explain="Customers who signed up or first bought this calendar month, against all of last month."
                href={hrefWith('/customers', { status: 'new' })}
              />
              <DashKpi
                icon={Activity}
                label="Active (30 Days)"
                value={k.active30.toLocaleString('en-KE')}
                explain="Customers with an order, booking or stay in the last 30 days, cancelled ones not counted."
                href={hrefWith('/customers', { status: 'active' })}
              />
              <DashKpi
                icon={Repeat}
                label="Repeat Rate"
                value={rate == null ? null : `${rate.toFixed(1)}%`}
                explain="Of the customers who paid for something, the share who paid more than once."
                href={hrefWith('/customers', { status: 'repeat' })}
              >
                <span className="text-muted mt-1.5 block text-[0.8125rem] font-semibold">
                  {rate == null
                    ? 'Nobody has paid yet'
                    : `${k.repeat.toLocaleString('en-KE')} of ${k.buyers.toLocaleString('en-KE')} buyers`}
                </span>
              </DashKpi>
              <DashKpi
                icon={Wallet}
                label="Total Spend"
                value={kes(k.spend)}
                explain="Paid orders, bookings and stays across every customer, with issued refunds taken off."
              />
            </DashKpiGrid>

            <GoldTabs
              label="Customers"
              active={tab}
              tabs={TABS.map((t) => ({
                key: t.key,
                label: t.label,
                icon: t.icon,
                href: hrefWith('/customers', { tab: t.key === 'all' ? null : t.key, q: q || null }),
                count:
                  t.key === 'all'
                    ? k.total
                    : t.key === 'accounts'
                      ? k.accounts
                      : t.key === 'guests'
                        ? k.guests
                        : t.key === 'vip'
                          ? k.vip
                          : k.suspended,
              }))}
            />

            <DashCard>
              <div className="mb-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
                <DashSearch
                  value={q}
                  label="Search customers"
                  placeholder="Search by name, phone or email"
                  className="sm:col-span-2 xl:col-span-1"
                />
                {tab === 'vip' || tab === 'suspended' ? (
                  <span className="hidden xl:block" />
                ) : (
                  <DashSelect label="Show" param="status" value={status} options={STATUS_OPTIONS} />
                )}
                <DashSelect label="Sort" param="sort" value={sort} options={SORT_OPTIONS} />
                <DashClear params={['q', 'status', 'sort']} />
              </div>

              <CustomerTable
                rows={list.rows}
                filtered={Boolean(q) || status !== 'all' || tab !== 'all'}
              />

              <Pagination
                page={page}
                size={PAGE_SIZE}
                total={list.total}
                noun="customers"
                href={pageHref}
              />
            </DashCard>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

function CustomerTable({
  rows,
  filtered,
}: {
  rows: ReturnType<typeof parseList>['rows'];
  filtered: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted py-14 text-center font-semibold">
        {filtered
          ? 'No customer matches these filters.'
          : 'No customers yet. They appear here when someone signs up or places an order.'}
      </p>
    );
  }
  return (
    <div className="relative -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[60rem] text-left text-[0.875rem]">
        <caption className="sr-only">Customers</caption>
        <thead>
          <tr className="text-ink font-bold">
            <th scope="col" className="bg-bg rounded-l-lg px-3 py-2.5">
              Customer
            </th>
            <th scope="col" className="bg-bg px-3 py-2.5">
              Phone
            </th>
            <th scope="col" className="bg-bg px-3 py-2.5">
              Joined
            </th>
            <th scope="col" className="bg-bg px-3 py-2.5 text-right">
              Purchases
            </th>
            <th scope="col" className="bg-bg px-3 py-2.5 text-right">
              Spend
            </th>
            <th scope="col" className="bg-bg px-3 py-2.5">
              Last Purchase
            </th>
            <th scope="col" className="bg-bg rounded-r-lg px-3 py-2.5">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const name = displayName(r.name, r.phone, r.email);
            return (
              <tr key={r.id} className="border-border border-b last:border-0">
                <td className="px-3 py-3">
                  <Link
                    href={`/customers/${r.id}`}
                    className="group flex min-w-0 items-center gap-3"
                  >
                    <CustomerAvatar name={name} />
                    <span className="min-w-0">
                      <span className="text-ink block truncate font-bold group-hover:underline">
                        {name}
                      </span>
                      <span className="text-muted block truncate text-[0.8125rem] font-semibold">
                        {!r.hasAccount
                          ? 'Guest · no account'
                          : r.email && r.email !== name
                            ? r.email
                            : 'Account · no name given'}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">
                  {r.phone ?? <span className="text-muted-light">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold">{day(r.joinedAt)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">
                  {r.purchases.toLocaleString('en-KE')}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums">
                  {kes(r.spend)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold">
                  {r.lastPurchaseAt ? (
                    ago(r.lastPurchaseAt)
                  ) : (
                    <span className="text-muted-light">Never</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap gap-1.5">
                    {r.blocked ? (
                      <StatusChip tone="red">Suspended</StatusChip>
                    ) : (
                      <StatusChip tone="green">Active</StatusChip>
                    )}
                    {r.vip && <StatusChip tone="gold">VIP</StatusChip>}
                    {r.hasAccount && r.email && !r.emailConfirmed && (
                      <StatusChip tone="amber">Unverified</StatusChip>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
