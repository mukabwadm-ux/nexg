import type { Metadata } from 'next';
import Link from 'next/link';

import {
  type ActivityRow,
  type AlertRow,
  type BreakGlassRow,
  type DataAccessRow,
  type ExportRow,
  type HealthRow,
  type HoldRow,
  type ModuleRow,
  type MoneyRow,
  type PackRow,
  type RetentionRow,
  type SignInRow,
} from '@/components/audit/shared';
import {
  ActivityTab,
  DataAccessTab,
  EvidenceTab,
  MoneyTab,
  SignInsTab,
} from '@/components/audit/tabs';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'activity', label: 'Activity' },
  { key: 'sign_ins', label: 'Sign-ins & security' },
  { key: 'money', label: 'Money trail' },
  { key: 'data_access', label: 'Data access' },
  { key: 'evidence', label: 'Evidence & retention' },
] as const;

const SUBTITLE: Record<string, string> = {
  activity:
    'Every state change in the system, hash-chained · an event cannot be edited or deleted, by anybody',
  sign_ins: 'Who signed in, from where, on what · and every use of emergency access',
  money: 'Every event that moved money, with the second approver where one was required',
  data_access: 'Who looked at whose personal details, and why · the value itself is never logged',
  evidence: 'The chain, retention, legal holds and the packs built for people outside',
};

/** How many rows a tab pulls. Deliberately a page, not everything. */
const PAGE = 200;

/**
 * Control → Audit log.
 *
 * The one console whose job is to be read rather than used. Four of
 * the five tabs are filters over the same chained table, which is the
 * point: there is one record of what happened, and these are
 * questions asked of it, not separate stories.
 *
 * What this page shows depends on who is reading. The DPO and a super
 * admin see everything; a finance lead sees the money trail; an ops
 * manager sees their own modules; everybody else sees what they
 * themselves did. None of that is decided here — `audit.fn_visible`
 * and the RLS policy under it decide, so the same limits hold from
 * psql, from a script, and from anything written later.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams?: { tab?: string; filter?: string; module?: string; event?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'audit');

  const supabase = createClient();
  const audit = supabase.schema('audit');

  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams!.tab! : 'activity';
  const filter = searchParams?.filter ?? 'all';
  const moduleFilter = searchParams?.module ?? null;

  const { data: healthRaw, error: healthError } = await audit
    .from('console_health_v')
    .select('*')
    .maybeSingle();

  /*
   * If the log cannot be read, say so. The temptation is to fall back
   * to a row of zeroes so the page still renders — and on this
   * console that is the worst thing it could do, because a page of
   * zeroes reads as "nothing has happened" when it means "we could
   * not look".
   */
  if (healthError || !healthRaw) {
    return (
      <ConsoleShell staff={staff} current="/audit">
        <ConsoleHeader title="Audit log" breadcrumb="The log could not be read" />
        <main className="px-4 py-6 sm:px-8">
          <div className="bg-danger-bg border-danger mt-2 rounded-xl border-2 p-5">
            <p className="text-danger text-[0.9375rem] font-extrabold">
              The audit log could not be read.
            </p>
            <p className="text-danger mt-2 max-w-[44rem] text-[0.8125rem] font-semibold leading-[1.7]">
              This page shows nothing rather than zeroes, because a screen of zeroes would read as
              &ldquo;nothing has happened&rdquo; when it means &ldquo;we could not look&rdquo;.
            </p>
            <p className="text-muted mt-3 font-mono text-[0.75rem] font-semibold">
              {healthError?.message ?? 'The health view returned no row.'}
            </p>
          </div>
        </main>
      </ConsoleShell>
    );
  }

  const health = healthRaw as HealthRow;

  return (
    <ConsoleShell staff={staff} current="/audit">
      <ConsoleHeader title="Audit log" breadcrumb={SUBTITLE[tab]!} />

      <main className="px-4 py-6 sm:px-8">
        <nav
          className="border-border -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
          aria-label="Audit sections"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/audit?tab=${t.key}`}
              className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-bold transition-colors ${
                tab === t.key ? 'border-gold text-ink' : 'text-muted hover:text-ink border-transparent'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === 'activity' &&
          (await loadActivity(supabase, health, filter, moduleFilter, searchParams?.event))}
        {tab === 'sign_ins' && (await loadSignIns(supabase, health))}
        {tab === 'money' && (await loadMoney(supabase))}
        {tab === 'data_access' && (await loadDataAccess(supabase))}
        {tab === 'evidence' && (await loadEvidence(supabase, health))}
      </main>
    </ConsoleShell>
  );
}

type Supabase = ReturnType<typeof createClient>;

async function loadActivity(
  supabase: Supabase,
  health: HealthRow,
  filter: string,
  moduleFilter: string | null,
  eventId: string | undefined,
) {
  const audit = supabase.schema('audit');

  let q = audit.from('console_activity_v').select('*').order('id', { ascending: false }).limit(PAGE);

  if (filter === 'needs_review') q = q.eq('review_state', 'needs_review');
  if (filter === 'high') q = q.eq('severity', 'high');
  if (filter === 'two_person') q = q.eq('needs_two_people', true);
  if (filter === 'unregistered') q = q.eq('unregistered', true);
  if (moduleFilter) q = q.eq('module', moduleFilter);

  const [{ data: events }, { data: modules }] = await Promise.all([
    q,
    audit.from('console_module_v').select('*').order('events', { ascending: false }),
  ]);

  const rows = (events as ActivityRow[] | null) ?? [];

  /* The panel reads the selected row from the page already fetched
     where it can; only a row outside the window costs a second
     query. */
  const inPage = eventId ? rows.find((r) => String(r.id) === eventId) : undefined;
  let selected = inPage ?? null;
  if (eventId && !inPage) {
    const { data } = await audit
      .from('console_activity_v')
      .select('*')
      .eq('id', Number(eventId))
      .maybeSingle();
    selected = (data as ActivityRow | null) ?? null;
  }

  return (
    <ActivityTab
      health={health}
      events={rows}
      modules={(modules as ModuleRow[] | null) ?? []}
      selected={selected}
      filter={filter}
      moduleFilter={moduleFilter}
    />
  );
}

async function loadSignIns(supabase: Supabase, health: HealthRow) {
  const audit = supabase.schema('audit');

  const [{ data: signIns }, { data: alerts }, { data: breakGlass }] = await Promise.all([
    audit.from('console_sign_in_v').select('*').order('at', { ascending: false }).limit(PAGE),
    audit
      .from('console_alert_v')
      .select('*')
      .in('state', ['open', 'acknowledged'])
      .order('raised_at', { ascending: false }),
    audit.from('console_break_glass_v').select('*').order('opened_at', { ascending: false }).limit(50),
  ]);

  return (
    <SignInsTab
      health={health}
      signIns={(signIns as SignInRow[] | null) ?? []}
      alerts={(alerts as AlertRow[] | null) ?? []}
      breakGlass={(breakGlass as BreakGlassRow[] | null) ?? []}
    />
  );
}

async function loadMoney(supabase: Supabase) {
  const { data } = await supabase
    .schema('audit')
    .from('console_money_v')
    .select('*')
    .order('id', { ascending: false })
    .limit(PAGE);

  return <MoneyTab rows={(data as MoneyRow[] | null) ?? []} />;
}

async function loadDataAccess(supabase: Supabase) {
  const audit = supabase.schema('audit');

  const [{ data: rows }, { data: exports }] = await Promise.all([
    audit.from('console_data_access_v').select('*').order('id', { ascending: false }).limit(PAGE),
    audit.from('console_export_v').select('*').order('at', { ascending: false }).limit(50),
  ]);

  return (
    <DataAccessTab
      rows={(rows as DataAccessRow[] | null) ?? []}
      exports={(exports as ExportRow[] | null) ?? []}
    />
  );
}

async function loadEvidence(supabase: Supabase, health: HealthRow) {
  const audit = supabase.schema('audit');

  const [{ data: packs }, { data: holds }, { data: retention }] = await Promise.all([
    audit.from('console_evidence_v').select('*').order('created_at', { ascending: false }),
    audit.from('console_legal_hold_v').select('*').order('placed_at', { ascending: false }),
    audit.from('console_retention_v').select('*').order('subject'),
  ]);

  return (
    <EvidenceTab
      health={health}
      packs={(packs as PackRow[] | null) ?? []}
      holds={(holds as HoldRow[] | null) ?? []}
      retention={(retention as RetentionRow[] | null) ?? []}
    />
  );
}
