import { Button, StatusBadge, type StatusKey, VALUE_PLACEHOLDER } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { type Controls, requestSuspension, setControls, setPaused } from '@/app/merchants/actions';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { MerchantDetailPanel } from '@/components/merchant-detail-panel';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Merchants' };
export const dynamic = 'force-dynamic';

/** The artboard's filter row. `featured` is a flag, the rest are statuses. */
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'paused', label: 'Paused' },
  { key: 'under_review', label: 'Under review' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'featured', label: 'Featured' },
] as const;

const PENDING = ['applied', 'documents_pending', 'under_review'];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function ageLabel(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return 'date unknown';
  if (days <= 0) return 'applied today';
  if (days === 1) return 'applied yesterday';
  return `applied ${days} days ago`;
}

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams?: { filter?: string; selected?: string };
}) {
  const staff = await requireStaff();
  const supabase = createClient();

  const filter = FILTERS.some((f) => f.key === searchParams?.filter)
    ? (searchParams!.filter as string)
    : 'all';

  const [{ data: merchants }, { data: approvals }] = await Promise.all([
    supabase
      .from('merchant')
      .select(
        'id, trading_name, category, status, featured, concierge_pick, accepting_orders, explore_visible, pay_on_delivery, pay_on_delivery_cap_kes, accepting_orders_changed_at, created_at, went_live_at, city(name)',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('approval_request')
      .select(
        'id, target_id, reason, status, requested_by, staff_user!approval_request_requested_by_fkey(display_name)',
      )
      .eq('kind', 'merchant_suspension')
      .eq('status', 'pending'),
  ]);

  const rows = merchants ?? [];
  const applications = rows.filter((m) => PENDING.includes(m.status));

  const counts = {
    live: rows.filter((m) => m.status === 'live').length,
    suspended: rows.filter((m) => m.status === 'suspended').length,
  };

  const visible = rows.filter((merchant) => {
    if (filter === 'all') return true;
    if (filter === 'featured') return merchant.featured;
    return merchant.status === filter;
  });

  const selected = searchParams?.selected
    ? (rows.find((m) => m.id === searchParams.selected) ?? null)
    : null;

  const pendingSuspension = selected
    ? ((approvals ?? []).find((a) => a.target_id === selected.id) ?? null)
    : null;

  const href = (next: Partial<{ filter: string; selected: string }>) => {
    const params = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== 'all') params.set('filter', f);
    const s = 'selected' in next ? next.selected : searchParams?.selected;
    if (s) params.set('selected', s);
    const query = params.toString();
    return query ? `/merchants?${query}` : '/merchants';
  };

  return (
    <ConsoleShell staff={staff} current="/merchants">
      <ConsoleHeader
        title="Merchants"
        breadcrumb={`${counts.live} live · ${applications.length} applications · ${counts.suspended} suspended`}
      />

      <main className="px-4 py-5 sm:px-8">
        {/* Filters are links, so a filtered console is a URL you can send. */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => {
            const active = option.key === filter;
            const count =
              option.key === 'all'
                ? rows.length
                : option.key === 'featured'
                  ? rows.filter((m) => m.featured).length
                  : rows.filter((m) => m.status === option.key).length;

            return (
              <Link
                key={option.key}
                href={href({ filter: option.key })}
                className={`rounded-full border px-4 py-2 text-[0.8125rem] font-bold transition-colors ${
                  active
                    ? 'border-ink bg-ink text-white'
                    : 'border-border-strong bg-surface text-ink hover:border-ink'
                }`}
              >
                {option.label}
                {count > 0 && (
                  <span className={active ? 'ml-2 text-white/60' : 'text-muted-light ml-2'}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-start">
          <div className="space-y-5">
            {applications.length > 0 && (
              <section className="border-border bg-surface rounded-2xl border p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-extrabold tracking-tight">Applications to review</h2>
                  <span className="bg-gold-soft text-gold-text rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide">
                    {applications.length} ·{' '}
                    {`oldest ${Math.max(...applications.map((a) => daysSince(a.created_at) ?? 0))} days`}
                  </span>
                </div>

                <ul className="mt-4 space-y-3">
                  {applications.map((application) => (
                    <li
                      key={application.id}
                      className="border-border bg-bg/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[0.9375rem] font-extrabold">
                          {application.trading_name}
                        </span>
                        <span className="text-muted-light block truncate text-xs font-semibold">
                          {application.category?.replace(/_/g, ' ') ?? 'category not chosen'} ·{' '}
                          {(application.city as { name: string } | null)?.name} ·{' '}
                          {ageLabel(application.created_at)}
                        </span>
                      </span>
                      <Button size="sm" asChild>
                        <Link href={`/merchants/${application.id}`}>Review</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border-border bg-surface overflow-hidden rounded-2xl border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left">
                  <thead>
                    <tr className="border-border bg-bg/50 border-b">
                      {['Merchant', 'Status', '30d', 'On-time', 'GMV 30d'].map((heading) => (
                        <th
                          key={heading}
                          className="text-muted-light px-4 py-3 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-muted-light px-4 py-10 text-center text-sm font-semibold"
                        >
                          No business matches that filter.
                        </td>
                      </tr>
                    ) : (
                      visible.map((merchant) => {
                        const city = merchant.city as { name: string } | null;
                        const isSelected = merchant.id === selected?.id;

                        return (
                          <tr
                            key={merchant.id}
                            className={`border-border border-b last:border-0 ${
                              isSelected ? 'bg-gold/[0.07]' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <Link
                                href={href({ selected: merchant.id })}
                                className="block min-w-0"
                                scroll={false}
                              >
                                <span className="block truncate text-[0.875rem] font-extrabold">
                                  {merchant.trading_name}
                                </span>
                                <span className="text-muted-light block truncate text-xs font-semibold">
                                  {merchant.category?.replace(/_/g, ' ') ?? 'category not chosen'} ·{' '}
                                  {city?.name}
                                  {merchant.featured && ' · featured'}
                                  {merchant.concierge_pick && ' · pick'}
                                </span>
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={merchant.status as StatusKey} />
                            </td>
                            {/*
                             * Orders, punctuality and GMV all come from an
                             * orders domain that does not exist yet, so they
                             * render bracketed rather than as a zero that
                             * would read as "no trade" (ground rule 3).
                             */}
                            <td className="text-muted px-4 py-3 text-sm font-bold">
                              {VALUE_PLACEHOLDER}
                            </td>
                            <td className="text-muted px-4 py-3 text-sm font-bold">
                              {VALUE_PLACEHOLDER}%
                            </td>
                            <td className="text-muted px-4 py-3 text-sm font-bold">
                              KES {VALUE_PLACEHOLDER}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-muted-light border-border border-t px-4 py-3 text-xs font-semibold">
                Showing {visible.length} of {rows.length} merchants
              </p>
            </section>
          </div>

          {selected ? (
            <MerchantDetailPanel
              merchant={{
                id: selected.id,
                tradingName: selected.trading_name,
                /* A draft may not have chosen one yet. */
                category: selected.category ?? 'other',
                status: selected.status,
                featured: selected.featured,
                cityName: (selected.city as { name: string } | null)?.name ?? null,
                wentLiveAt: selected.went_live_at,
                controls: {
                  accepting_orders: selected.accepting_orders,
                  explore_visible: selected.explore_visible,
                  pay_on_delivery: selected.pay_on_delivery,
                  pay_on_delivery_cap_kes: selected.pay_on_delivery_cap_kes,
                  concierge_pick: selected.concierge_pick,
                  accepting_orders_changed_at: selected.accepting_orders_changed_at,
                },
              }}
              closeHref={href({ selected: undefined })}
              pendingSuspension={
                pendingSuspension
                  ? {
                      reason: pendingSuspension.reason,
                      requestedBy:
                        (pendingSuspension.staff_user as { display_name: string } | null)
                          ?.display_name ?? 'another staff member',
                    }
                  : null
              }
              onSaveControls={async (patch: Controls) => {
                'use server';
                return setControls(selected.id, patch);
              }}
              onPause={async (paused: boolean, reason: string) => {
                'use server';
                return setPaused(selected.id, paused, reason);
              }}
              onRequestSuspension={async (reason: string) => {
                'use server';
                return requestSuspension(selected.id, reason);
              }}
            />
          ) : (
            <aside className="border-border bg-surface hidden rounded-2xl border p-8 text-center xl:block">
              <p className="text-muted text-sm font-semibold">
                Choose a business to see its controls, compliance and payout.
              </p>
            </aside>
          )}
        </div>
      </main>
    </ConsoleShell>
  );
}
