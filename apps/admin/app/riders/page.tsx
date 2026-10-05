import type { Metadata } from 'next';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { Directory } from '@/components/riders/directory';
import { RIDER_TABS, RiderTabs, SosBanner, type SosRow } from '@/components/riders/shell';
import { num, type Badges, type RiderRow } from '@/components/riders/shared';
import {
  CashTab,
  CommsTab,
  DocumentsTab,
  HealthTab,
  PipelineTab,
  SettlementTab,
  SupplyTab,
  type AutomationRule,
  type BonusRuleRow,
  type CashEventRow,
  type CashRuleRow,
  type DepositRow,
  type DocumentRow,
  type FraudRuleRow,
  type IncidentRow,
  type MessageRow,
  type PipelineRider,
  type RateCardRow,
  type RunRow,
  type SettlementLineRow,
  type TemplateRow,
  type Weight,
  type ZoneRow,
} from '@/components/riders/tabs';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Riders' };
export const dynamic = 'force-dynamic';

type Supabase = ReturnType<typeof createClient>;

/**
 * Operate → Riders & cash ledger.
 *
 * Eight tabs over one domain. Each loads only its own data — the page
 * is dynamic and somebody looking at Comms has no reason to pay for the
 * settlement query.
 *
 * Filters live in the URL so a link pasted into Slack opens the same
 * screen the sender was looking at.
 *
 * Everything that depends on the orders domain renders [—]. There is no
 * order service, so trips, acceptance, on-time and earnings are not
 * measured — and a zero in those columns would read as "this rider did
 * nothing", which is what gets somebody a coaching call they do not
 * deserve.
 */
export default async function RidersPage({
  searchParams,
}: {
  searchParams?: { tab?: string; filter?: string; selected?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();

  const tab = RIDER_TABS.some((t) => t.key === searchParams?.tab)
    ? searchParams!.tab!
    : 'directory';
  const filter = searchParams?.filter ?? 'all';
  const selected = searchParams?.selected ?? null;

  const [{ data: badgesRaw }, { data: directory }, { data: sos }] = await Promise.all([
    supabase.rpc('rpc_rider_console_counts', {}),
    supabase
      .from('console_rider_directory_v')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('incident')
      .select('id, rider_id, happened_at, description, rider:rider_id(first_name, last_name)')
      .eq('kind', 'sos')
      .is('acknowledged_at', null)
      .order('happened_at', { ascending: false }),
  ]);

  const badges = (badgesRaw as Badges | null) ?? ({} as Badges);
  const rows = (directory as RiderRow[] | null) ?? [];

  return (
    <ConsoleShell staff={staff} current="/riders">
      <ConsoleHeader
        title="Riders"
        breadcrumb={`${num(badges.active)} active · ${num(badges.onboarding)} onboarding · ${num(
          badges.on_cooldown,
        )} on cooldown · ${num(badges.suspended)} suspended`}
      />

      <main className="px-4 py-6 sm:px-8">
        {/*
         * Above the tabs, on every route. An SOS nobody has picked up
         * is not a thing you should be able to navigate away from.
         */}
        <SosBanner incidents={((sos as SosRow[] | null) ?? []).slice(0, 3)} />

        <div className={sos && sos.length > 0 ? 'mt-5' : ''}>
          <RiderTabs current={tab} />
        </div>

        {tab === 'directory' && (
          <Directory rows={rows} badges={badges} filter={filter} selected={selected} />
        )}

        {tab === 'pipeline' && <PipelineTab riders={await loadPipeline(supabase, rows)} />}

        {tab === 'health' && (await loadHealth(supabase, rows, badges))}

        {tab === 'cash' && (await loadCash(supabase, rows, badges, selected))}

        {tab === 'settlement' && (await loadSettlement(supabase))}

        {tab === 'supply' && (await loadSupply(supabase, badges))}

        {tab === 'documents' && (await loadDocuments(supabase, rows))}

        {tab === 'comms' && (await loadComms(supabase, rows, selected))}
      </main>
    </ConsoleShell>
  );
}

// ──────────────────────────────────────────────────── loaders

async function loadPipeline(supabase: Supabase, rows: RiderRow[]): Promise<PipelineRider[]> {
  const onboarding = rows.filter((r) => r.status !== 'offboarded');
  if (onboarding.length === 0) return [];
  const ids = onboarding.map((r) => r.id);

  const [
    { data: riders },
    { data: training },
    { data: trips },
    { data: documents },
    { data: reqs },
  ] = await Promise.all([
    supabase
      .from('rider')
      .select('id, background_check, kit_issued_at, kit_deposit_status, vehicle')
      .in('id', ids),
    supabase.from('rider_training').select('rider_id, module, passed').in('rider_id', ids),
    supabase.from('rider_test_trip').select('rider_id, outcome').in('rider_id', ids),
    supabase
      .from('document')
      .select('owner_id, status')
      .eq('owner_type', 'rider')
      .in('owner_id', ids)
      .is('superseded_at', null),
    supabase
      .from('document_requirement')
      .select('kind, applies_when')
      .eq('owner_type', 'rider')
      .eq('required', true),
  ]);

  const extra = new Map(
    (riders ?? []).map((r) => [
      r.id,
      r as {
        background_check: Record<string, unknown> | null;
        kit_issued_at: string | null;
        kit_deposit_status: string | null;
        vehicle: string | null;
      },
    ]),
  );
  const basics = new Set(
    (training ?? []).filter((t) => t.module === 'basics' && t.passed).map((t) => t.rider_id),
  );
  const tested = new Set(
    (trips ?? []).filter((t) => t.outcome === 'passed').map((t) => t.rider_id),
  );

  const verified = new Map<string, number>();
  for (const d of documents ?? []) {
    if (d.status !== 'verified') continue;
    verified.set(d.owner_id, (verified.get(d.owner_id) ?? 0) + 1);
  }

  /* Required is a function of the vehicle — the same rule
     fn_rider_required_docs applies server-side. */
  const requiredFor = (vehicle: string | null) =>
    (reqs ?? []).filter((r) => {
      const when = r.applies_when as Record<string, string[]> | null;
      const vehicles = when?.['vehicle'];
      return !vehicles || (vehicle ? vehicles.includes(vehicle) : false);
    }).length;

  return onboarding.map((r) => {
    const e = extra.get(r.id);
    return {
      ...r,
      background_status: (e?.background_check?.['status'] as string | undefined) ?? null,
      basics_passed: basics.has(r.id),
      test_trip_passed: tested.has(r.id),
      kit_issued_at: e?.kit_issued_at ?? null,
      kit_deposit_status: e?.kit_deposit_status ?? null,
      docs_verified: verified.get(r.id) ?? 0,
      docs_required: requiredFor(r.vehicle),
      last_note: null,
    };
  });
}

async function loadHealth(supabase: Supabase, rows: RiderRow[], badges: Badges) {
  const [{ data: incidents }, { data: weights }, { data: fraud }] = await Promise.all([
    supabase
      .from('incident')
      .select(
        'id, kind, severity, status, happened_at, description, resolution, acknowledged_at, rider:rider_id(first_name, last_name)',
      )
      .order('happened_at', { ascending: false })
      .limit(40),
    supabase.from('rider_health_weight_config').select('key, label, weight_pct'),
    supabase.from('fraud_rule').select('kind, label, enabled'),
  ]);

  return (
    <HealthTab
      riders={rows}
      incidents={(incidents as IncidentRow[] | null) ?? []}
      weights={(weights as Weight[] | null) ?? []}
      fraudRules={(fraud as FraudRuleRow[] | null) ?? []}
      badges={badges}
    />
  );
}

async function loadCash(
  supabase: Supabase,
  rows: RiderRow[],
  badges: Badges,
  selected: string | null,
) {
  const [{ data: events }, { data: deposits }, { data: rules }] = await Promise.all([
    supabase
      .from('cash_event')
      .select('id, rider_id, kind, amount_kes, order_reference, note, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('cash_deposit')
      .select('id, provider_ref, msisdn, amount_kes, account_reference, paid_at, match_status')
      .order('paid_at', { ascending: false })
      .limit(60),
    supabase.from('cash_rule').select('*, city:city_id(name)'),
  ]);

  const cashRules = (
    (rules as (CashRuleRow & { city: { name: string } | null })[] | null) ?? []
  ).map((r) => ({ ...r, city_name: r.city?.name ?? null }));

  return (
    <CashTab
      riders={rows}
      events={(events as CashEventRow[] | null) ?? []}
      deposits={(deposits as DepositRow[] | null) ?? []}
      rules={cashRules}
      selected={selected}
      badges={badges}
    />
  );
}

async function loadSettlement(supabase: Supabase) {
  const { data: runs } = await supabase
    .from('rider_settlement_run')
    .select('*')
    .order('period_end', { ascending: false })
    .limit(1);

  const run = ((runs as RunRow[] | null) ?? [])[0] ?? null;

  const [{ data: lines }, { data: cards }, { data: bonuses }] = await Promise.all([
    run
      ? supabase
          .from('rider_settlement_line')
          .select('*, rider:rider_id(first_name, last_name, status)')
          .eq('run_id', run.id)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from('rider_rate_card').select('*').eq('status', 'current').limit(1),
    supabase.from('rider_bonus_rule').select('id, key, enabled, params'),
  ]);

  return (
    <SettlementTab
      run={run}
      lines={(lines as SettlementLineRow[] | null) ?? []}
      rateCard={((cards as RateCardRow[] | null) ?? [])[0] ?? null}
      bonuses={(bonuses as BonusRuleRow[] | null) ?? []}
    />
  );
}

async function loadSupply(supabase: Supabase, badges: Badges) {
  const [{ data: zones }, { data: commitments }, { data: bonuses }] = await Promise.all([
    supabase.from('zone').select('id, name, tier').eq('active', true).order('name'),
    supabase
      .from('shift_commitment')
      .select('zone_id, status')
      .eq('date', new Date().toISOString().slice(0, 10)),
    supabase.from('rider_bonus_rule').select('id, key, enabled, params'),
  ]);

  const committedByZone = new Map<string, number>();
  for (const c of commitments ?? []) {
    if (c.status !== 'committed') continue;
    committedByZone.set(c.zone_id, (committedByZone.get(c.zone_id) ?? 0) + 1);
  }

  /*
   * fn_zone_supply_gap per zone rather than one query: the gap depends
   * on the forecast row for this hour, and there are a handful of zones,
   * not thousands. If that stops being true this becomes one call.
   */
  const gaps = await Promise.all(
    (zones ?? []).map(async (z) => {
      const { data } = await supabase.rpc('fn_zone_supply_gap', { p_zone_id: z.id });
      const g = ((data as
        | {
            online_now: number;
            on_trip: number;
            riders_needed: number | null;
            gap: number | null;
          }[]
        | null) ?? [])[0];
      return {
        id: z.id,
        name: z.name,
        tier: z.tier,
        online_now: g?.online_now ?? 0,
        on_trip: g?.on_trip ?? 0,
        riders_needed: g?.riders_needed ?? null,
        gap: g?.gap ?? null,
        committed: committedByZone.get(z.id) ?? 0,
      } satisfies ZoneRow;
    }),
  );

  return (
    <SupplyTab
      zones={gaps}
      badges={badges}
      liveBonuses={(bonuses as BonusRuleRow[] | null) ?? []}
    />
  );
}

async function loadDocuments(supabase: Supabase, rows: RiderRow[]) {
  const [{ data: documents }, { data: automation }, { data: current }, { data: accepted }] =
    await Promise.all([
      supabase
        .from('document')
        .select(
          'id, owner_id, status, expires_at, requirement:requirement_id(label, essential), rider:owner_id(first_name, last_name)',
        )
        .eq('owner_type', 'rider')
        .is('superseded_at', null)
        .order('expires_at', { ascending: true, nullsFirst: false }),
      supabase.from('rider_document_automation_rule').select('key, label, enabled'),
      supabase.from('rider_agreement_version').select('id').eq('status', 'current').limit(1),
      supabase.from('rider_agreement_acceptance').select('rider_id'),
    ]);

  const currentId = ((current as { id: string }[] | null) ?? [])[0]?.id;
  const signed = currentId
    ? new Set((accepted as { rider_id: string }[] | null)?.map((a) => a.rider_id) ?? [])
    : null;
  const activeCount = rows.filter((r) => r.status === 'active').length;

  const shaped = (
    (documents as
      | {
          id: string;
          owner_id: string;
          status: string;
          expires_at: string | null;
          requirement: { label: string; essential: boolean } | null;
          rider: { first_name: string | null; last_name: string | null } | null;
        }[]
      | null) ?? []
  ).map((d) => ({
    id: d.id,
    owner_id: d.owner_id,
    status: d.status,
    expires_at: d.expires_at,
    label: d.requirement?.label ?? '[Document]',
    essential: d.requirement?.essential ?? false,
    rider: d.rider,
  })) satisfies DocumentRow[];

  return (
    <DocumentsTab
      documents={shaped}
      automation={(automation as AutomationRule[] | null) ?? []}
      /* No current agreement means the percentage is not zero, it is
         unmeasurable — there is nothing to have signed. */
      agreementPct={
        signed === null || activeCount === 0
          ? null
          : Math.round(
              (rows.filter((r) => r.status === 'active' && signed.has(r.id)).length / activeCount) *
                100,
            )
      }
    />
  );
}

async function loadComms(supabase: Supabase, rows: RiderRow[], selected: string | null) {
  const [{ data: messages }, { data: templates }] = await Promise.all([
    supabase
      .from('rider_message')
      .select('*, rider:rider_id(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('message_template').select('id, name, channel').limit(12),
  ]);

  return (
    <CommsTab
      messages={(messages as MessageRow[] | null) ?? []}
      templates={(templates as TemplateRow[] | null) ?? []}
      riders={rows}
      selected={selected}
    />
  );
}
