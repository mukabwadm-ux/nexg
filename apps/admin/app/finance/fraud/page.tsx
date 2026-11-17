import {
  Activity,
  BadgeCheck,
  ClipboardList,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ConsoleShell } from '@/components/console-shell';
import { FlagsTable, RulesList, RunChecksButton } from '@/components/finance/fraud';
import { PageHeader, Stat, StatGrid, ViewTabs } from '@/components/portal/kit';
import {
  countFlags,
  isSubject,
  parseOverview,
  sinceLabel,
  sortFlags,
  type FraudOverview,
} from '@/lib/fraud';
import { hrefWith } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Fraud checks' };
export const dynamic = 'force-dynamic';

type Tab = 'open' | 'reviewed' | 'checks';

/**
 * Finance → Fraud checks: one queue of flags raised by checks that run
 * every five minutes in the database (payments, riders, customers, staff
 * and office expenses), each waiting for a person to confirm or dismiss it.
 * Finance sees every flag; rider ops, arriving from Riders, see the riders
 * they work.
 */
export default async function FraudChecksPage({
  searchParams,
}: {
  searchParams?: { tab?: string; who?: string };
}) {
  const staff = await requireStaff();
  if (!staff.modules.some((m) => m.key === 'finance' || m.key === 'riders')) {
    requireModule(staff, 'finance');
  }
  const tab: Tab = (['open', 'reviewed', 'checks'] as const).includes(searchParams?.tab as Tab)
    ? (searchParams!.tab as Tab)
    : 'open';
  const who = isSubject(searchParams?.who) ? searchParams!.who : 'all';

  const { data, error } = await createClient().rpc('rpc_fraud_overview', { p_days: 90 });
  const overview: FraudOverview = parseOverview(error ? null : data);
  const counts = countFlags(overview.flags);
  const open = sortFlags(overview.flags.filter((f) => f.status === 'open'));
  const reviewed = sortFlags(overview.flags.filter((f) => f.status !== 'open'));
  const run = overview.last_run;
  const failedChecks = Object.keys(run?.errors ?? {});
  const href = (t: Tab) =>
    hrefWith('/finance/fraud', { tab: t === 'open' ? null : t, who: who === 'all' ? null : who });

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={ShieldAlert}
        title="Fraud checks"
        subtitle="Checks run every five minutes and raise a flag for a person to confirm or dismiss. Nothing is blocked on its own."
        actions={!error ? <RunChecksButton /> : undefined}
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <ViewTabs
          active={tab}
          tabs={[
            {
              key: 'open',
              label: 'Open flags',
              icon: ShieldAlert,
              href: href('open'),
              alert: counts.forMe,
            },
            { key: 'reviewed', label: 'Reviewed', icon: ClipboardList, href: href('reviewed') },
            { key: 'checks', label: 'Checks', icon: SlidersHorizontal, href: href('checks') },
          ]}
        />

        {error && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Fraud checks could not be loaded: {error.message}
          </p>
        )}

        {!error && overview.scope === 'riders' && (
          <p className="bg-info-bg text-info rounded-xl px-4 py-3 text-sm font-semibold">
            You see the flags about riders you work. Finance reviews payments, customers, staff and
            office expenses.
          </p>
        )}

        {!error && failedChecks.length > 0 && (
          <p
            role="alert"
            className="bg-warning-bg text-warning rounded-xl px-4 py-3 text-sm font-semibold"
          >
            The last run could not finish every check ({failedChecks.join(', ')}). The others ran.
            Run the checks again, and tell the engineers if it keeps happening.
          </p>
        )}

        {tab !== 'checks' && !error && (
          <StatGrid>
            <Stat
              icon={ShieldAlert}
              value={counts.open.toLocaleString('en-KE')}
              label="Open flags"
              tone={counts.openHigh > 0 ? 'red' : 'gold'}
              note={counts.openHigh > 0 ? `${counts.openHigh} high` : 'None high'}
              noteTone={counts.openHigh > 0 ? 'bad' : 'muted'}
              href={href('open')}
            />
            <Stat
              icon={UserCheck}
              value={counts.forMe.toLocaleString('en-KE')}
              label="Waiting for you"
              note="Flags you may review"
              noteTone="muted"
            />
            <Stat
              icon={BadgeCheck}
              value={counts.confirmed30.toLocaleString('en-KE')}
              label="Confirmed, 30 days"
              href={href('reviewed')}
            />
            <Stat
              icon={ShieldX}
              value={counts.dismissed30.toLocaleString('en-KE')}
              label="Dismissed, 30 days"
              href={href('reviewed')}
            />
            <Stat
              icon={Activity}
              value={run?.at ? sinceLabel(run.at) : null}
              label="Last checked"
              tone={failedChecks.length > 0 ? 'red' : 'gold'}
              note={
                !run?.at
                  ? 'Not run yet'
                  : failedChecks.length > 0
                    ? 'Some checks failed'
                    : 'Runs every 5 minutes'
              }
              noteTone={failedChecks.length > 0 ? 'bad' : 'muted'}
            />
          </StatGrid>
        )}

        {!error && tab === 'open' && <FlagsTable flags={open} mode="open" initialWho={who} />}
        {!error && tab === 'reviewed' && (
          <FlagsTable flags={reviewed} mode="reviewed" initialWho={who} />
        )}
        {!error && tab === 'checks' && (
          <>
            <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck aria-hidden="true" className="text-success h-5 w-5" />
                {overview.rules.filter((r) => r.automated && r.enabled).length} of{' '}
                {overview.rules.length} checks run on their own
                {run?.at ? `, last ${sinceLabel(run.at)}` : ''}.
              </p>
              {!overview.can_change_rules && (
                <p className="text-muted text-xs font-semibold">
                  Only people with full Finance access change checks.
                </p>
              )}
            </div>
            <RulesList rules={overview.rules} canChange={overview.can_change_rules} />
          </>
        )}
      </main>
    </ConsoleShell>
  );
}
