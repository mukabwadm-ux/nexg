import { categoryName } from '@nexg/contracts';
import { Button } from '@nexg/ui';
import {
  Bike,
  CircleDollarSign,
  FileCheck2,
  MessageSquare,
  Percent,
  ReceiptText,
  ShieldAlert,
  ShoppingBag,
  Store,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';

import { decideApproval } from '@/app/merchants/actions';
import { ApprovalsPanel, type PendingApproval } from '@/components/approvals-panel';
import { change, Kpi, KpiGrid, kesCompact, Panel } from '@/components/console-kit';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { ShareDonut, TrendArea, type Slice } from '@/components/charts';
import { RangeMenu, rangeFrom } from '@/components/range-menu';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STALE_DAYS = 2;

/* Orders that never became a sale do not count towards order value. */
const NOT_SALES = new Set(['cancelled', 'refunded']);

/* A merchant's category by its current name; an unknown key reads as itself. */
const categoryLabel = (key: string) => {
  const name = categoryName(key);
  if (name) return name;
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: { denied?: string; range?: string };
}) {
  const staff = await requireStaff();
  const supabase = createClient();

  const reachesSupport = staff.modules.some((m) => m.key === 'support');

  const staleBefore = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();
  const pendingStatuses = ['applied', 'documents_pending', 'under_review'];

  /*
   * Whether anyone holds super_admin yet. Until someone does, nobody can
   * add staff, edit a city or change a fee — and the page that fixes that
   * is itself behind the role, so it has to be offered from here.
   */
  const superAdminCount = supabase
    .from('role_grant')
    .select('role!inner(key)', { count: 'exact', head: true })
    .is('revoked_at', null)
    .eq('role.key', 'super_admin');

  const range = rangeFrom(searchParams?.range);
  const now = Date.now();
  const start = new Date(now - range.days * 86_400_000);
  const before = new Date(now - 2 * range.days * 86_400_000);
  const seesOrders = staff.modules.some((m) => m.key === 'orders' || m.key === 'live_ops');

  const ordersBatch = Promise.all([
    seesOrders
      ? supabase
          .from('order' as never)
          .select(
            'created_at, total_cents, commission_cents, stage, merchant:merchant_id(category)',
          )
          .gte('created_at', before.toISOString())
          .order('created_at', { ascending: true })
          .limit(20_000)
      : Promise.resolve({ data: null }),
    supabase.from('merchant').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    supabase.from('rider').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  /*
   * One batch for the whole page: each await used to be its own trip to
   * the database, one after another.
   */
  const [
    staleMerchants,
    staleRiders,
    waitingDocuments,
    approvals,
    audit,
    superAdmins,
    openTickets,
    { data: deniedModule },
    [ordersRes, liveMerchants, liveRiders],
  ] = await Promise.all([
    supabase
      .from('merchant')
      .select('id, trading_name, city(name)')
      .in('status', pendingStatuses)
      .lt('created_at', staleBefore),
    supabase
      .from('rider')
      .select('id, first_name, last_name, city(name)')
      .in('status', pendingStatuses)
      .lt('created_at', staleBefore),
    supabase
      .from('document')
      .select('id, owner_type', { count: 'exact' })
      .eq('status', 'uploaded')
      .is('superseded_at', null),
    supabase
      .from('approval_request')
      .select(
        'id, kind, reason, requested_by, created_at, staff_user!approval_request_requested_by_fkey(display_name)',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    /* Through an RPC, not the table: see migration 20260101002700. */
    supabase.rpc('rpc_audit_recent', { p_limit: 6 }),
    superAdminCount,
    /*
     * Open tickets from the Help page. Only asked for when this person can
     * open the desk — a row telling somebody about work they are not allowed
     * to see is a leak with a link on it.
     */
    reachesSupport
      ? supabase
          .from('support_ticket')
          .select('created_at', { count: 'exact' })
          .eq('status', 'open')
          .order('created_at', { ascending: true })
          .limit(1)
      : Promise.resolve({ count: 0, data: [] as { created_at: string }[] }),
    /*
     * requireModule sends people here with the module they tried in the URL.
     * Landing on the overview with no explanation reads as a bug — it did once
     * already — so say which door was shut and why.
     */
    searchParams?.denied
      ? supabase.from('console_module').select('label').eq('key', searchParams.denied).maybeSingle()
      : Promise.resolve({ data: null }),
    ordersBatch,
  ]);

  const needsFirstSuperAdmin = (superAdmins.count ?? 0) === 0;

  /*
   * "Needs a human now". Every row here is a real query — an empty list means
   * there is genuinely nothing waiting, which is worth being able to trust.
   */
  const queue: {
    icon: React.ReactNode;
    title: string;
    detail: string;
    href: string;
    cta: string;
  }[] = [];

  if ((staleMerchants.data ?? []).length > 0) {
    const names = (staleMerchants.data ?? [])
      .slice(0, 3)
      .map((m) => `${m.trading_name}, ${(m.city as { name: string } | null)?.name ?? '—'}`);
    queue.push({
      icon: <Store className="h-4 w-4" />,
      title: `${staleMerchants.data!.length} merchant application${staleMerchants.data!.length === 1 ? '' : 's'} older than ${STALE_DAYS} days`,
      detail: names.join(' · '),
      href: '/merchants',
      cta: 'Open queue',
    });
  }

  if ((staleRiders.data ?? []).length > 0) {
    const names = (staleRiders.data ?? [])
      .slice(0, 3)
      .map((r) => `${r.first_name} ${r.last_name}`.trim());
    queue.push({
      icon: <UserRound className="h-4 w-4" />,
      title: `${staleRiders.data!.length} rider application${staleRiders.data!.length === 1 ? '' : 's'} older than ${STALE_DAYS} days`,
      detail: names.join(' · '),
      href: '/riders',
      cta: 'Open queue',
    });
  }

  if ((waitingDocuments.count ?? 0) > 0) {
    queue.push({
      icon: <FileCheck2 className="h-4 w-4" />,
      title: `${waitingDocuments.count} document${waitingDocuments.count === 1 ? '' : 's'} awaiting verification`,
      detail: 'Uploaded by applicants and not yet checked',
      href: '/riders',
      cta: 'Review',
    });
  }

  if ((openTickets.count ?? 0) > 0) {
    const oldest = openTickets.data?.[0]?.created_at;
    const hours = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 3_600_000) : null;
    queue.push({
      icon: <MessageSquare className="h-4 w-4" />,
      title: `${openTickets.count} support ticket${openTickets.count === 1 ? '' : 's'} nobody has picked up`,
      detail:
        hours === null
          ? 'Raised from the forms on the website'
          : `Raised from the forms on the website · oldest waiting ${hours < 1 ? 'under an hour' : hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`}`,
      href: '/support',
      cta: 'Open the desk',
    });
  }

  if ((approvals.data ?? []).length > 0) {
    queue.push({
      icon: <ShieldAlert className="h-4 w-4" />,
      title: `${approvals.data!.length} approval${approvals.data!.length === 1 ? '' : 's'} waiting for a second pair of eyes`,
      detail: 'Nothing moves until someone other than the requester decides',
      href: '#approvals',
      cta: 'See them',
    });
  }

  const pending: PendingApproval[] = (approvals.data ?? []).map((request) => ({
    id: request.id,
    title: request.kind === 'merchant_suspension' ? 'Suspend a merchant' : String(request.kind),
    detail: `“${request.reason}” — asked by ${(request.staff_user as { display_name: string } | null)?.display_name ?? 'a colleague'}`,
    ownRequest: request.requested_by === staff.staffId,
  }));

  /*
   * The period's money, from the order table itself. Read only when this
   * person's role reaches orders (the table's RLS says the same); for
   * anyone else the tiles say the figure is not theirs to see rather than
   * showing a zero.
   */

  type OrderRow = {
    created_at: string;
    total_cents: number;
    commission_cents: number | null;
    stage: string;
    merchant: { category: string } | null;
  };
  const orders = (ordersRes.data ?? []) as unknown as OrderRow[];
  const sales = orders.filter((o) => !NOT_SALES.has(o.stage));
  const current = sales.filter((o) => new Date(o.created_at) >= start);
  const previous = sales.filter((o) => new Date(o.created_at) < start);

  const sum = (rows: OrderRow[], pick: (o: OrderRow) => number) =>
    rows.reduce((total, o) => total + pick(o), 0);
  const gmv = sum(current, (o) => o.total_cents);
  const gmvBefore = sum(previous, (o) => o.total_cents);
  const commission = sum(current, (o) => o.commission_cents ?? 0);
  const commissionBefore = sum(previous, (o) => o.commission_cents ?? 0);
  const aov = current.length ? gmv / current.length : 0;
  const aovBefore = previous.length ? gmvBefore / previous.length : 0;

  const delta = (a: number, b: number) => {
    const c = change(a, b);
    return c === null ? null : { value: c, unit: '%' as const };
  };

  /* One point per day, including the quiet ones, so the line is honest. */
  const nairobiDay = (at: Date | number) =>
    new Date(at).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const byDay = new Map<string, { gmv: number; commission: number }>();
  for (let i = range.days - 1; i >= 0; i--) {
    byDay.set(nairobiDay(now - i * 86_400_000), { gmv: 0, commission: 0 });
  }
  for (const o of current) {
    const point = byDay.get(nairobiDay(new Date(o.created_at)));
    if (!point) continue;
    point.gmv += o.total_cents / 100;
    point.commission += (o.commission_cents ?? 0) / 100;
  }
  const trend = [...byDay].map(([day, v]) => ({
    day,
    gmv: Math.round(v.gmv),
    commission: Math.round(v.commission),
  }));

  const byCategory = new Map<string, number>();
  for (const o of current) {
    const key = o.merchant?.category ?? 'other';
    byCategory.set(key, (byCategory.get(key) ?? 0) + o.total_cents / 100);
  }
  const sorted = [...byCategory].sort((a, b) => b[1] - a[1]);
  const slices: Slice[] = sorted.slice(0, 5).map(([key, value]) => ({
    key,
    label: categoryLabel(key),
    value: Math.round(value),
  }));
  const rest = sorted.slice(5).reduce((total, [, v]) => total + v, 0);
  if (rest > 0) slices.push({ key: 'rest', label: 'Everything else', value: Math.round(rest) });

  const gmvDelta = seesOrders ? delta(gmv, gmvBefore) : null;

  const firstName = staff.displayName.replace(/[[\]]/g, '').split(' ')[0];
  const hour = Number(
    new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }),
  );
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <ConsoleShell staff={staff} current="/">
      <ConsoleHeader
        title={`${greeting}, ${firstName}`}
        breadcrumb="How NexG is doing across orders, partners and the queues that need a person."
        action={<RangeMenu base="/" current={range} />}
      />

      <main className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        {searchParams?.denied && (
          <div className="border-border-strong bg-surface rounded-2xl border p-4">
            <p className="text-[0.8125rem] font-extrabold">
              {deniedModule?.label ?? 'That section'} is not open to your role
            </p>
            <p className="text-muted mt-1.5 max-w-3xl text-xs font-semibold leading-[1.7]">
              You hold {staff.roles.join(', ') || 'no role'}. A super admin can widen that on Staff
              &amp; roles, where the permission matrix shows exactly which roles reach it.
            </p>
          </div>
        )}

        {needsFirstSuperAdmin && (
          <div className="border-warning/40 bg-warning-bg rounded-2xl border p-5">
            <p className="text-warning text-[0.9375rem] font-extrabold">Nobody can add staff yet</p>
            <p className="text-warning mt-2 max-w-3xl text-[0.8125rem] font-semibold leading-[1.7]">
              This project has no super admin, so adding colleagues, opening a city and changing
              fees are all closed. The first one cannot be countersigned — there is nobody to
              countersign it — so claiming it is recorded in the audit trail as exactly that.
            </p>
            <Button className="mt-4" asChild>
              <Link href="/staff">Set up staff &amp; roles</Link>
            </Button>
          </div>
        )}

        <KpiGrid>
          <Kpi
            featured
            icon={CircleDollarSign}
            label="Gross order value"
            value={seesOrders ? kesCompact(gmv) : null}
            delta={gmvDelta}
            note={!seesOrders ? 'Needs the orders module' : gmvDelta ? ' vs previous' : range.label}
          />
          <Kpi
            icon={Percent}
            label="NexG commission"
            value={seesOrders ? kesCompact(commission) : null}
            delta={seesOrders ? delta(commission, commissionBefore) : null}
            note={seesOrders ? range.label : 'Needs the orders module'}
          />
          <Kpi
            icon={ShoppingBag}
            label="Orders"
            value={seesOrders ? current.length.toLocaleString('en-KE') : null}
            delta={seesOrders ? delta(current.length, previous.length) : null}
            note={seesOrders ? range.label : 'Needs the orders module'}
          />
          <Kpi
            icon={ReceiptText}
            label="Average order"
            value={seesOrders && current.length ? kesCompact(aov) : null}
            delta={seesOrders && current.length ? delta(aov, aovBefore) : null}
            note={
              !seesOrders
                ? 'Needs the orders module'
                : current.length
                  ? range.label
                  : 'No orders yet'
            }
          />
          <Kpi
            icon={Store}
            label="Live merchants"
            value={liveMerchants.count == null ? null : liveMerchants.count.toLocaleString('en-KE')}
            note="Verified and selling"
          />
          <Kpi
            icon={Bike}
            label="Active riders"
            value={liveRiders.count == null ? null : liveRiders.count.toLocaleString('en-KE')}
            note="Cleared to deliver"
          />
        </KpiGrid>

        {seesOrders && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <Panel
              title="Order value & commission"
              aside={range.label}
              action={{ href: '/orders', label: 'Open orders' }}
            >
              {current.length === 0 ? (
                <EmptyChart text={`No orders in the ${range.label.toLowerCase()}.`} />
              ) : (
                <TrendArea
                  data={trend}
                  unit="kes"
                  series={[
                    { key: 'gmv', label: 'Gross order value' },
                    { key: 'commission', label: 'NexG commission' },
                  ]}
                />
              )}
            </Panel>
            <Panel title="Order value by category" aside={range.label}>
              {slices.length === 0 ? (
                <EmptyChart text="Categories appear once orders come in." />
              ) : (
                <ShareDonut
                  data={slices}
                  unit="kes"
                  centre={kesCompact(gmv).replace('KES ', '')}
                  caption="Order value"
                />
              )}
            </Panel>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] xl:items-start">
          <Panel
            title={
              <span className="flex items-center gap-2">
                Needs attention
                {queue.length > 0 && (
                  <span className="bg-danger flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-extrabold text-white">
                    {queue.length}
                  </span>
                )}
              </span>
            }
          >
            {queue.length === 0 ? (
              <p className="text-muted text-sm font-semibold">
                Nothing is waiting. Every application, document and approval is up to date.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {queue.map((item) => (
                  <li
                    key={item.title}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-warning-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#C2410C]"
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.875rem] font-bold">{item.title}</span>
                      <span className="text-muted-light block truncate text-xs font-semibold">
                        {item.detail}
                      </span>
                    </span>
                    <Link
                      href={item.href}
                      className="bg-gold-soft text-ink hover:bg-gold shrink-0 rounded-lg border border-[#F3DE8A] px-3 py-1.5 text-xs font-bold transition-colors"
                    >
                      {item.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
            <Panel
              id="approvals"
              title="Approvals waiting"
              aside={String(pending.length)}
              className="scroll-mt-24"
            >
              <ApprovalsPanel
                approvals={pending}
                onDecide={async (id: string, approve: boolean) => {
                  'use server';
                  return decideApproval(id, approve, '');
                }}
              />
            </Panel>

            <Panel title="Recent activity" action={{ href: '/audit', label: 'Audit log' }}>
              <ul className="space-y-2.5">
                {(audit.data ?? []).length === 0 ? (
                  <li className="text-muted-light text-sm font-semibold">Nothing logged yet.</li>
                ) : (
                  (audit.data ?? []).map((event) => (
                    <li key={event.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[0.8125rem] font-semibold">
                        <span className="text-muted-light font-bold">{event.actor_type}</span>{' '}
                        {event.action}
                      </span>
                      <span className="text-muted-light shrink-0 text-[0.6875rem] font-semibold tabular-nums">
                        {new Date(event.at).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Africa/Nairobi',
                        })}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          </div>
        </div>
      </main>
    </ConsoleShell>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="border-border text-muted flex h-[15rem] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm font-semibold">
      {text}
    </div>
  );
}
