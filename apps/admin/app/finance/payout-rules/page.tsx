import { Card } from '@nexg/ui';
import { Bike, Handshake, Home, SlidersHorizontal, Store, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  approveChangeSet,
  activateDue,
  discardDraft,
  rejectChangeSet,
  stageChange,
  submitChangeSet,
} from '@/app/settings/actions';
import { ConsoleShell } from '@/components/console-shell';
import { PageHeader, PanelHead } from '@/components/portal/kit';
import { SaveBar, ScheduledBanner, SettingField } from '@/components/settings/controls';
import type { ChangeSetRow, CityRow, DefinitionRow } from '@/components/settings/shared';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Payout rules' };

/**
 * Payout rules: one screen for how every group is paid (owner, 23 Nov 2026:
 * "a single rules screen, configurable for each"). Each rule is a key in the
 * settings registry, so a change is staged here, approved by a second person,
 * and goes live on the registry's schedule, exactly as on Settings.
 */

interface RuleRow {
  party: string;
  sort: number;
  key: string;
  group: string;
  scope_kind: string;
  value_type: string;
  unit: string | null;
  label: string;
  help: string | null;
  city_id: string | null;
  value: unknown;
  constraints: { enum?: unknown; labels?: Record<string, string> } | null;
}

const PARTIES: {
  key: string;
  title: string;
  icon: LucideIcon;
  soon?: string;
  /** Set elsewhere: said instead of "Coming next". */
  elsewhere?: string;
}[] = [
  { key: 'rider', title: 'Riders', icon: Bike },
  {
    key: 'merchant',
    title: 'Merchants',
    icon: Store,
    elsewhere:
      'Each merchant is set on its own page: a Paystack sub-account (Paystack pays them every 2 working days, weekly, monthly, or when Finance releases it), or the payout run. Their commission is on the same page.',
  },
  {
    key: 'host',
    title: 'Hosts',
    icon: Home,
    soon: 'Hosts’ payout schedule and minimum, NexG’s stay commission, and the preset cancellation policies hosts choose from.',
  },
  {
    key: 'experience_partner',
    title: 'Experience partners',
    icon: Handshake,
    soon: 'How often partners are paid and their minimum.',
  },
];

export default async function PayoutRulesPage({
  searchParams,
}: {
  searchParams?: { city?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const s = createClient();

  const [{ data: cities }, { data: definitions }, { data: changeSets }] = await Promise.all([
    s.from('settings_city_v').select('*').order('sort').order('name'),
    s.from('settings_definition_v').select('*').order('sort'),
    s.from('settings_scheduled_v').select('*').order('requested_at', { ascending: false }),
  ]);
  const cityRows = (cities as CityRow[] | null) ?? [];
  const defs = (definitions as DefinitionRow[] | null) ?? [];
  const cityId =
    (cityRows.some((c) => c.city_id === searchParams?.city) ? searchParams?.city : null) ??
    cityRows.find((c) => c.status === 'live')?.city_id ??
    cityRows[0]?.city_id ??
    null;
  const city = cityRows.find((c) => c.city_id === cityId) ?? null;

  const { data: ruleData, error } = await s
    .from('payout_rules_v' as never)
    .select(
      'party, sort, key, group, scope_kind, value_type, unit, label, help, city_id, value, constraints',
    )
    .or(cityId ? `city_id.is.null,city_id.eq.${cityId}` : 'city_id.is.null')
    .order('sort');
  const rules = (ruleData as unknown as RuleRow[] | null) ?? [];

  /* The groups these rules belong to, and whether this person may edit each;
     asked of the database so the locks and the refusals agree. */
  const groups = [...new Set(rules.map((r) => r.group))];
  const editable = new Set<string>();
  await Promise.all(
    groups.map(async (g) => {
      const { data } = await s.rpc('rpc_settings_may_edit', { p_group: g });
      if (data === true) editable.add(g);
    }),
  );

  /* Open drafts for these groups: a city rule's draft is per city, a global one has none. */
  const sets = (changeSets as ChangeSetRow[] | null) ?? [];
  const ruleKeys = new Set(rules.map((r) => r.key));
  const touchesRules = (c: ChangeSetRow) =>
    Object.keys(c.diff ?? {}).some((k) => ruleKeys.has(k.split(':')[0]!));
  const drafts = sets.filter(
    (c) =>
      c.status === 'draft' &&
      groups.includes(c.group) &&
      (c.city_id === null || c.city_id === cityId) &&
      touchesRules(c),
  );

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={SlidersHorizontal}
        title="Payout rules"
        subtitle="How each group is paid. A change is staged here, approved by a second person, then goes live."
        actions={
          <div className="flex flex-col items-end gap-2">
            {drafts.length === 0 ? (
              <SaveBar draft={null} onSubmit={submitChangeSet} onDiscard={discardDraft} />
            ) : (
              drafts.map((d) => (
                <SaveBar
                  key={d.change_set_id}
                  draft={{
                    change_set_id: d.change_set_id,
                    title: d.title,
                    changes: Number(d.changes),
                    diff: d.diff,
                    impact: d.impact,
                    anyImmediateBlocked: Object.keys(d.diff).some(
                      (k) =>
                        defs.find((x) => x.key === k.split(':')[0])?.can_be_immediate === false,
                    ),
                    pair: strictestPair(Object.keys(d.diff), defs),
                  }}
                  onSubmit={submitChangeSet}
                  onDiscard={discardDraft}
                />
              ))
            )}
          </div>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <nav aria-label="City" className="flex flex-wrap gap-2">
          {cityRows.map((c) => (
            <Link
              key={c.city_id}
              href={`/finance/payout-rules?city=${c.city_id}`}
              aria-current={c.city_id === cityId ? 'page' : undefined}
              className={
                c.city_id === cityId
                  ? 'bg-ink rounded-full px-3 py-1.5 text-[0.8125rem] font-extrabold text-white'
                  : 'border-border text-ink hover:border-ink rounded-full border px-3 py-1.5 text-[0.8125rem] font-bold'
              }
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <ScheduledBanner
          sets={sets
            .filter((c) => c.status !== 'draft' && touchesRules(c))
            .map((c) => ({
              change_set_id: c.change_set_id,
              title: c.title,
              status: c.status,
              effective_from: c.effective_from,
              immediate: c.immediate,
              changes: Number(c.changes),
              requested_by_name: c.requested_by_name,
              approved_by_name: c.approved_by_name,
              reason: c.reason,
            }))}
          onApprove={approveChangeSet}
          onReject={rejectChangeSet}
          onActivate={activateDue}
        />

        {error && (
          <Card className="border-danger border-2 p-5">
            <p className="text-danger text-[0.9375rem] font-extrabold">
              Payout rules could not be read.
            </p>
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
              {error.code === '42P01' || error.code === 'PGRST205'
                ? 'This database does not have the payout rules update yet.'
                : error.message}
            </p>
          </Card>
        )}

        {PARTIES.map((p) => {
          const own = rules.filter((r) => r.party === p.key);
          const Icon = p.icon;
          return (
            <Card key={p.key} className="p-5">
              <PanelHead title={p.title}>
                <Icon aria-hidden="true" className="text-gold-text h-5 w-5" />
              </PanelHead>
              {own.length === 0 ? (
                <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
                  {p.elsewhere ?? `Coming next. ${p.soon ?? ''}`}
                </p>
              ) : (
                <div className="divide-border mt-2 divide-y">
                  {own.map((r) => (
                    <div key={r.key}>
                      <SettingField
                        label={r.label}
                        help={
                          r.scope_kind === 'global'
                            ? `${r.help ?? ''} Applies in every city.`.trim()
                            : r.help
                        }
                        group={r.group}
                        cityId={r.scope_kind === 'global' ? null : cityId}
                        settingKey={r.key}
                        value={toValue(r.value)}
                        unit={r.unit}
                        valueType={asType(r.value_type)}
                        options={optionsOf(r)}
                        canEdit={editable.has(r.group)}
                        lockedBy={`Changing ${r.group} rules is Finance's, with a second approver.`}
                        onStage={stageChange}
                      />
                    </div>
                  ))}
                  {city && (
                    <p className="text-muted-light pt-3 text-[0.75rem] font-semibold">
                      Showing {city.name}. Riders on the payout run are paid when Finance approves
                      the weekly run. Any other choice pays them automatically through Paystack to
                      M-Pesa, from the start day; real riders only once real money is switched on.
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </main>
    </ConsoleShell>
  );
}

/* A choice list for an enum rule, with the labels the rule carries. */
function optionsOf(r: RuleRow): { value: string; label: string }[] | undefined {
  const values = r.value_type === 'enum' ? r.constraints?.enum : undefined;
  if (!Array.isArray(values)) return undefined;
  return values
    .filter((v): v is string => typeof v === 'string')
    .map((v) => ({
      value: v,
      label:
        r.constraints?.labels?.[v] ?? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' '),
    }));
}

function toValue(v: unknown): number | string | boolean | null {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : null;
}

function asType(t: string): 'int' | 'money' | 'pct' | 'bool' | 'text' | 'enum' {
  return t === 'int' || t === 'money' || t === 'pct' || t === 'bool' || t === 'enum' ? t : 'text';
}

/* The strictest approval pair in a draft, as the database decides it. */
function strictestPair(keys: string[], defs: DefinitionRow[]): string {
  const rank = (pair: string) =>
    pair.includes('super_admin') ? 4 : pair.startsWith('single:') ? 1 : 3;
  return (
    keys
      .map(
        (k) => defs.find((d) => d.key === k.split(':')[0])?.effective_pair ?? 'single:ops_manager',
      )
      .sort((a, b) => rank(b) - rank(a))[0] ?? 'single:ops_manager'
  );
}
