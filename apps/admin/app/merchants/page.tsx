import type { Metadata } from 'next';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { Directory, type Application } from '@/components/merchants/directory';
import { MERCHANT_TABS, MerchantTabs } from '@/components/merchants/shell';
import { num, type Counts, type DirectoryRow } from '@/components/merchants/shared';
import {
  BranchesTab,
  CatalogueTab,
  DisputesTab,
  DocumentsTab,
  FinanceTab,
  HealthTab,
  HoursTab,
  PipelineTab,
  type DisputeRow,
  type DocumentRow,
  type HoursRow,
  type StatementRow,
  type Weight,
} from '@/components/merchants/tabs';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Merchants' };
export const dynamic = 'force-dynamic';

/**
 * Grow → Partners → Merchants.
 *
 * Twelve tabs over one domain. Each loads only its own data — the page
 * is dynamic and a staff member looking at Disputes has no reason to
 * pay for the document expiry query.
 *
 * Filters live in the URL so a link pasted into Slack opens the same
 * screen the sender was looking at.
 */
export default async function MerchantsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; filter?: string; selected?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  const supabase = createClient();

  const tab = MERCHANT_TABS.some((t) => t.key === searchParams?.tab && t.built)
    ? searchParams!.tab!
    : 'directory';
  const filter = searchParams?.filter ?? 'all';

  const [{ data: countsRaw }, { data: directory }] = await Promise.all([
    supabase.rpc('rpc_merchant_console_counts', {}),
    supabase.from('console_merchant_directory_v').select('*').order('created_at', {
      ascending: false,
    }),
  ]);

  const counts = (countsRaw as Counts | null) ?? ({} as Counts);
  const rows = (directory as DirectoryRow[] | null) ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  return (
    <ConsoleShell staff={staff} current="/merchants">
      <ConsoleHeader
        title="Merchants"
        breadcrumb={`${num(counts.live)} live · ${num(counts.applications)} application${
          counts.applications === 1 ? '' : 's'
        } · ${num(counts.suspended)} suspended`}
      />

      <main className="px-4 py-6 sm:px-8">
        <MerchantTabs current={tab} />

        {tab === 'directory' && (
          <Directory
            rows={rows}
            applications={await loadApplications(supabase, rows)}
            counts={counts}
            filter={filter}
            selected={searchParams?.selected ?? null}
          />
        )}

        {tab === 'pipeline' && <PipelineTab rows={rows} counts={counts} />}

        {tab === 'health' && <HealthTab {...await loadHealth(supabase, rows)} />}

        {tab === 'disputes' && <DisputesTab rows={await loadDisputes(supabase, byId)} />}

        {tab === 'hours' && <HoursTab {...await loadHours(supabase, rows)} />}

        {tab === 'catalogue' && <CatalogueTab {...await loadCatalogue(supabase, byId)} />}

        {tab === 'finance' && <FinanceTab {...await loadFinance(supabase, byId, rows)} />}

        {tab === 'documents' && <DocumentsTab {...await loadDocuments(supabase, byId)} />}

        {tab === 'branches' && <BranchesTab chains={await loadChains(supabase, rows)} />}
      </main>
    </ConsoleShell>
  );
}

type Db = ReturnType<typeof createClient>;

/**
 * Applications waiting on a person, with the state of each document and
 * whether somebody already has the file open.
 */
async function loadApplications(supabase: Db, rows: DirectoryRow[]): Promise<Application[]> {
  const pending = rows.filter((r) =>
    ['applied', 'documents_pending', 'under_review'].includes(r.status),
  );
  if (pending.length === 0) return [];

  const ids = pending.map((p) => p.id);
  const [{ data: docs }, { data: reviews }] = await Promise.all([
    supabase
      .from('document')
      .select('owner_id, status, document_requirement(kind, label, essential)')
      .eq('owner_type', 'merchant')
      .in('owner_id', ids)
      .is('superseded_at', null),
    supabase
      .from('merchant_review')
      .select('merchant_id, started_at, staff_user(display_name)')
      .in('merchant_id', ids)
      .is('finished_at', null),
  ]);

  const docsByMerchant = new Map<string, Application['docs']>();
  for (const d of (docs ?? []) as Record<string, unknown>[]) {
    const req = d.document_requirement as {
      kind: string;
      label: string;
      essential: boolean;
    } | null;
    if (!req) continue;
    const list = docsByMerchant.get(d.owner_id as string) ?? [];
    list.push({
      kind: req.kind,
      label: req.label,
      status: d.status as string,
      essential: req.essential,
    });
    docsByMerchant.set(d.owner_id as string, list);
  }

  const reviewByMerchant = new Map(
    ((reviews ?? []) as Record<string, unknown>[]).map((r) => [
      r.merchant_id as string,
      {
        name: (r.staff_user as { display_name: string } | null)?.display_name ?? null,
        started: r.started_at as string,
      },
    ]),
  );

  return pending
    .map((p) => ({
      id: p.id,
      trading_name: p.trading_name,
      category: p.category,
      city_name: p.city_name,
      branch_name: p.branch_name,
      submitted_at: p.submitted_at,
      created_at: p.created_at,
      docs: (docsByMerchant.get(p.id) ?? []).filter((d) => d.essential).slice(0, 4),
      reviewer: reviewByMerchant.get(p.id)?.name ?? null,
      review_started_at: reviewByMerchant.get(p.id)?.started ?? null,
    }))
    .sort(
      (a, b) =>
        new Date(a.submitted_at ?? a.created_at ?? 0).getTime() -
        new Date(b.submitted_at ?? b.created_at ?? 0).getTime(),
    );
}

async function loadHealth(supabase: Db, rows: DirectoryRow[]) {
  const [{ data: weights }, { data: strikes }] = await Promise.all([
    supabase
      .from('health_weight_config')
      .select('key, label, weight_pct, target')
      .order('weight_pct', { ascending: false }),
    supabase.from('merchant_strike').select('level').is('cleared_at', null),
  ]);

  const tally = new Map<number, number>();
  for (const s of (strikes ?? []) as { level: number }[]) {
    tally.set(s.level, (tally.get(s.level) ?? 0) + 1);
  }

  return {
    rows,
    weights: (weights as Weight[] | null) ?? [],
    strikes: [1, 2, 3].map((level) => ({ level, count: tally.get(level) ?? 0 })),
  };
}

async function loadDisputes(supabase: Db, byId: Map<string, DirectoryRow>) {
  const { data } = await supabase
    .from('dispute')
    .select(
      'id, order_reference, merchant_id, reason, fault, status, amount_claimed_kes, amount_refunded_kes, merchant_reply_due_at, opened_at, guest_note, merchant_reply',
    )
    .order('opened_at', { ascending: false })
    .limit(100);

  return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    ...(d as unknown as DisputeRow),
    merchant_name: byId.get(d.merchant_id as string)?.trading_name ?? null,
  }));
}

async function loadHours(supabase: Db, rows: DirectoryRow[]) {
  const live = rows.filter((r) => r.status === 'live');

  const [{ data: merchants }, { data: exceptions }, { data: autoRules }] = await Promise.all([
    supabase
      .from('merchant')
      .select(
        'id, trading_name, category, status, accepting_orders, accepting_orders_source, busy_mode_until, closed_early_at, capacity_per_15min, prep_minutes, city(name)',
      )
      .eq('status', 'live'),
    supabase
      .from('city_hours_exception')
      .select('id, label, date, default_close, enabled')
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date')
      .limit(8),
    supabase.from('auto_message_rule').select('id, key, enabled').is('city_id', null),
  ]);

  /*
   * Effective hours come from the function rather than the weekly
   * table, so an override or a city exception shows here exactly as it
   * shows to a guest. One query per merchant is fine at this scale and
   * honest at any — there is no way to ask the question in bulk without
   * duplicating the resolution order.
   */
  const hours = await Promise.all(
    ((merchants ?? []) as Record<string, unknown>[]).map(async (m) => {
      const { data: h } = await supabase.rpc('fn_merchant_effective_hours', {
        p_merchant_id: m.id as string,
      });
      const first = (
        h as
          | { opens: string | null; closes: string | null; closed: boolean; source: string }[]
          | null
      )?.[0];
      return {
        id: m.id as string,
        trading_name: m.trading_name as string | null,
        category: m.category as string | null,
        city_name: (m.city as { name: string } | null)?.name ?? null,
        status: m.status as string,
        accepting_orders: m.accepting_orders as boolean | null,
        accepting_orders_source: m.accepting_orders_source as string | null,
        busy_mode_until: m.busy_mode_until as string | null,
        closed_early_at: m.closed_early_at as string | null,
        capacity_per_15min: m.capacity_per_15min as number | null,
        prep_minutes: m.prep_minutes as number | null,
        opens: first?.opens ?? null,
        closes: first?.closes ?? null,
        closed: first?.closed ?? null,
        hours_source: first?.source ?? null,
      } satisfies HoursRow;
    }),
  );

  return {
    rows:
      hours.length > 0
        ? hours
        : live.map((l) => ({
            id: l.id,
            trading_name: l.trading_name,
            category: l.category,
            city_name: l.city_name,
            status: l.status,
            accepting_orders: l.accepting_orders,
            accepting_orders_source: null,
            busy_mode_until: null,
            closed_early_at: null,
            capacity_per_15min: null,
            prep_minutes: null,
            opens: null,
            closes: null,
            closed: null,
            hours_source: null,
          })),
    exceptions:
      (exceptions as
        | {
            id: string;
            label: string;
            date: string;
            default_close: string | null;
            enabled: boolean;
          }[]
        | null) ?? [],
    autoRules: (autoRules as { id: string; key: string; enabled: boolean }[] | null) ?? [],
  };
}

async function loadCatalogue(supabase: Db, byId: Map<string, DirectoryRow>) {
  const [{ data: flags }, { data: edits }, { data: photos }, { data: imports }, { count }] =
    await Promise.all([
      supabase
        .from('catalogue_price_flag')
        .select('id, merchant_id, app_price_kes, observed_price_kes, drift_pct, status')
        .order('observed_at', { ascending: false })
        .limit(20),
      supabase
        .from('catalogue_edit_request')
        .select('id, merchant_id, kind, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('catalogue_photo_task').select('id, merchant_id, status').limit(20),
      supabase.from('catalogue_import').select('id, merchant_id, source, status').limit(20),
      supabase.from('catalogue_public').select('id', { count: 'exact', head: true }),
    ]);

  const name = (id: unknown) => byId.get(id as string)?.trading_name ?? null;

  return {
    flags: ((flags ?? []) as Record<string, unknown>[]).map((f) => ({
      id: f.id as string,
      merchant_name: name(f.merchant_id),
      app_price_kes: f.app_price_kes as number | null,
      observed_price_kes: f.observed_price_kes as number | null,
      drift_pct: f.drift_pct as number | null,
      status: f.status as string,
    })),
    edits: ((edits ?? []) as Record<string, unknown>[]).map((e) => ({
      id: e.id as string,
      merchant_name: name(e.merchant_id),
      kind: e.kind as string,
      status: e.status as string,
      created_at: e.created_at as string,
    })),
    photoTasks: ((photos ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      merchant_name: name(p.merchant_id),
      status: p.status as string,
    })),
    imports: ((imports ?? []) as Record<string, unknown>[]).map((i) => ({
      id: i.id as string,
      merchant_name: name(i.merchant_id),
      source: i.source as string,
      status: i.status as string,
    })),
    itemsLive: count ?? 0,
  };
}

async function loadFinance(supabase: Db, byId: Map<string, DirectoryRow>, rows: DirectoryRow[]) {
  const [{ data: statements }, { data: tiers }] = await Promise.all([
    supabase
      .from('merchant_statement')
      .select(
        'id, merchant_id, period_start, period_end, gross_kes, commission_kes, adjustments_kes, net_kes, status',
      )
      .order('period_end', { ascending: false })
      .limit(50),
    supabase.from('commission_tier').select('code, label, default_pct, criteria').order('code'),
  ]);

  return {
    statements: ((statements ?? []) as Record<string, unknown>[]).map((s) => ({
      ...(s as unknown as StatementRow),
      merchant_name: byId.get(s.merchant_id as string)?.trading_name ?? null,
    })),
    tiers:
      (tiers as
        | { code: string; label: string; default_pct: number | null; criteria: string | null }[]
        | null) ?? [],
    heldCount: rows.filter((r) => r.payout_hold).length,
  };
}

async function loadDocuments(supabase: Db, byId: Map<string, DirectoryRow>) {
  const [{ data: docs }, { data: terms }, { data: automation }] = await Promise.all([
    supabase
      .from('document')
      .select('id, owner_id, expires_at, status, document_requirement(label, essential)')
      .eq('owner_type', 'merchant')
      .is('superseded_at', null)
      .limit(300),
    supabase
      .from('merchant_terms_version')
      .select('id, version, status, effective_from')
      .order('effective_from', { ascending: false }),
    supabase.from('document_automation_rule').select('key, label, enabled').order('key'),
  ]);

  return {
    rows: ((docs ?? []) as Record<string, unknown>[]).map((d) => {
      const req = d.document_requirement as { label: string; essential: boolean } | null;
      return {
        id: d.id as string,
        merchant_id: d.owner_id as string,
        merchant_name: byId.get(d.owner_id as string)?.trading_name ?? null,
        label: req?.label ?? 'Document',
        expires_at: d.expires_at as string | null,
        status: d.status as string,
        essential: req?.essential ?? false,
      } satisfies DocumentRow;
    }),
    terms:
      (terms as { id: string; version: string; status: string; effective_from: string }[] | null) ??
      [],
    automation: (automation as { key: string; label: string; enabled: boolean }[] | null) ?? [],
  };
}

async function loadChains(supabase: Db, rows: DirectoryRow[]) {
  const parents = rows.filter((r) => rows.some((b) => b.parent_merchant_id === r.id));
  if (parents.length === 0) return [];

  const { data: settings } = await supabase
    .from('merchant_chain_setting')
    .select('parent_id, shared_catalogue, shared_hours, consolidated_statement')
    .in(
      'parent_id',
      parents.map((p) => p.id),
    );

  const settingsById = new Map(
    ((settings ?? []) as Record<string, unknown>[]).map((s) => [
      s.parent_id as string,
      {
        shared_catalogue: s.shared_catalogue as boolean,
        shared_hours: s.shared_hours as boolean,
        consolidated_statement: s.consolidated_statement as boolean,
      },
    ]),
  );

  return parents.map((parent) => ({
    parent,
    branches: rows.filter((b) => b.parent_merchant_id === parent.id),
    settings: settingsById.get(parent.id) ?? null,
  }));
}
