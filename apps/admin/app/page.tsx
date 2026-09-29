import { Button, KpiTile } from '@nexg/ui';
import { Clock, FileCheck2, ShieldAlert, Store, UserRound } from 'lucide-react';
import Link from 'next/link';

import { decideApproval } from '@/app/merchants/actions';
import { ApprovalsPanel, type PendingApproval } from '@/components/approvals-panel';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/*
 * The six tiles from the Overview artboard. The artboard draws every one of
 * them bracketed, and so does this: orders, GMV, punctuality, the concierge
 * queue and rider presence all come from domains that do not exist yet. They
 * keep their place and their captions so the shape of the screen is right,
 * and they fill in the day the data does (ground rule 3).
 */
const KPIS: { label: string; caption: string; unit?: string }[] = [
  { label: 'Orders today', caption: 'vs last week' },
  { label: 'Live right now', caption: 'waiting for a rider' },
  { label: 'Concierge queue', caption: 'oldest waiting' },
  { label: 'On-time delivery', unit: '%', caption: 'against target' },
  { label: 'GMV today', caption: 'commission' },
  { label: 'Riders online', caption: 'zones covered' },
];

const STALE_DAYS = 2;

export default async function OverviewPage() {
  const staff = await requireStaff();
  const supabase = createClient();

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

  const [staleMerchants, staleRiders, waitingDocuments, approvals, audit, superAdmins] =
    await Promise.all([
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

  const firstName = staff.displayName.replace(/[[\]]/g, '').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <ConsoleShell staff={staff} current="/">
      <ConsoleHeader
        title={`${greeting}, ${firstName}`}
        breadcrumb={new Date().toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      />

      <main className="px-4 py-6 sm:px-8">
        {needsFirstSuperAdmin && (
          <div className="border-warning/40 bg-warning-bg mb-6 rounded-2xl border p-5">
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
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {KPIS.map((kpi) => (
            <li key={kpi.label}>
              <KpiTile
                label={kpi.label}
                value={null}
                {...(kpi.unit ? { unit: kpi.unit } : {})}
                caption={kpi.caption}
              />
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
          <section className="border-border bg-surface rounded-2xl border p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold tracking-tight">Needs a human now</h2>
              <span className="bg-danger-bg text-danger rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide">
                {queue.length} items
              </span>
            </div>

            {queue.length === 0 ? (
              <p className="text-muted mt-4 text-sm font-semibold">
                Nothing is waiting. Every application, document and approval is up to date.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {queue.map((item) => (
                  <li
                    key={item.title}
                    className="border-border bg-bg/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-danger-bg text-danger mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.875rem] font-extrabold">{item.title}</span>
                        <span className="text-muted-light block truncate text-xs font-semibold">
                          {item.detail}
                        </span>
                      </span>
                    </span>
                    <Button size="sm" asChild>
                      <Link href={item.href}>{item.cta}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-6">
            <section
              id="approvals"
              className="border-border bg-surface scroll-mt-6 rounded-2xl border p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold tracking-tight">Approvals waiting</h2>
                <span className="text-muted-light text-xs font-bold">{pending.length}</span>
              </div>
              <div className="mt-4">
                <ApprovalsPanel
                  approvals={pending}
                  onDecide={async (id: string, approve: boolean) => {
                    'use server';
                    return decideApproval(id, approve, '');
                  }}
                />
              </div>
            </section>

            <section className="border-border bg-surface rounded-2xl border p-5">
              <h2 className="text-lg font-extrabold tracking-tight">Recent activity</h2>
              <ul className="mt-4 space-y-2.5">
                {(audit.data ?? []).length === 0 ? (
                  <li className="text-muted-light text-sm font-semibold">Nothing logged yet.</li>
                ) : (
                  (audit.data ?? []).map((event) => (
                    <li key={event.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[0.8125rem] font-semibold">
                        <span className="text-muted-light font-bold">{event.actor_type}</span>{' '}
                        {event.action}
                      </span>
                      <span className="text-muted-light shrink-0 text-[0.6875rem] font-semibold">
                        {new Date(event.at).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </div>

        <section className="border-border bg-surface mt-6 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Clock aria-hidden="true" className="text-muted-light h-4 w-4" />
            <h2 className="text-lg font-extrabold tracking-tight">Live orders</h2>
          </div>
          {/*
           * Not a chart of zeroes. There is no order table yet, and drawing an
           * empty axis would imply a quiet day rather than a missing feature.
           */}
          <p className="text-muted mt-3 text-sm font-semibold leading-[1.7]">
            Orders, dispatch health and the hourly chart arrive with the orders module. Everything
            above this line is live.
          </p>
        </section>
      </main>
    </ConsoleShell>
  );
}
