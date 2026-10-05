import type { Metadata } from 'next';

import {
  approveChangeSet,
  discardDraft,
  rejectChangeSet,
  activateDue,
  submitChangeSet,
} from '@/app/settings/actions';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { SaveBar, ScheduledBanner } from '@/components/settings/controls';
import {
  type ChangeSetRow,
  type CityRow,
  type DefinitionRow,
  type DispatchRow,
  type IntegrationRow,
  type LegalRow,
  type PaymentRow,
  type PricingRow,
  type RailRow,
  type RetentionRow,
  SettingsTabs,
  type SettlementRow,
  TAB_COPY,
  TAB_GROUP,
  TABS,
  type ZoneRow,
} from '@/components/settings/shared';
import {
  BrandingTab,
  CitiesTab,
  FeesTab,
  NotificationsTab,
  PaymentsTab,
  RetentionTab,
  type TabProps,
} from '@/components/settings/tabs';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Control → Settings.
 *
 * The module every other module reads from. Three things hold it
 * together, and all three live in the database rather than here:
 *
 *   · Nothing changes silently. A change is a version with an
 *     effective time, an author and a reason, and the old value
 *     stays readable forever.
 *   · Nothing money-shaped changes without a second person, checked
 *     by id rather than by role — somebody holding both Finance and
 *     Ops is still one person.
 *   · Nothing takes effect mid-day unless somebody says why, and
 *     prices cannot take effect mid-day at all.
 *
 * This page renders that and nothing more. Where a control is
 * disabled, the RPC would refuse anyway.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; city?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'settings');

  const supabase = createClient();
  /* Public wrappers — see the note in actions.ts. */
  const s = supabase;

  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams!.tab! : 'cities';

  const [{ data: cities }, { data: definitions }, { data: changeSets }] = await Promise.all([
    s.from('settings_city_v').select('*').order('sort').order('name'),
    s.from('settings_definition_v').select('*').order('sort'),
    s.from('settings_scheduled_v').select('*').order('requested_at', { ascending: false }),
  ]);

  const cityRows = (cities as CityRow[] | null) ?? [];
  const defs = (definitions as DefinitionRow[] | null) ?? [];
  const sets = (changeSets as ChangeSetRow[] | null) ?? [];

  /* Ordered by the city table's own `sort`, so the default is the
     city the business thinks of first rather than whichever name
     happens to sort earliest. */
  const cityId =
    searchParams?.city ??
    cityRows.find((c) => c.status === 'live')?.city_id ??
    cityRows[0]?.city_id ??
    null;
  const city = cityRows.find((c) => c.city_id === cityId) ?? null;

  /*
   * Which groups this person may edit. Asked of the database rather
   * than inferred from the role list here, so the lock icons and the
   * refusals cannot disagree.
   */
  const groups = [
    'cities',
    'fees',
    'dispatch',
    'settlement',
    'payments',
    'payouts',
    'integrations',
    'notifications',
    'branding',
    'legal',
    'retention',
  ];
  const editable = new Set<string>();
  let permissionError: string | null = null;

  await Promise.all(
    groups.map(async (g) => {
      const { data, error } = await s.rpc('rpc_settings_may_edit', { p_group: g });
      /*
       * An error here is not "you may not edit this". Discarding it
       * rendered the whole module locked with nothing saying why —
       * which is what you see when the settings surface cannot be
       * reached at all, and it reads as a permissions decision
       * somebody made rather than a thing that is broken.
       */
      if (error) permissionError = error.message;
      if (data === true) editable.add(g);
    }),
  );
  const canEdit = (g: string) => editable.has(g);

  if (permissionError) {
    return (
      <ConsoleShell staff={staff} current="/settings">
        <ConsoleHeader title="Settings" breadcrumb="The settings surface could not be reached" />
        <main className="px-4 py-6 sm:px-8">
          <div className="bg-danger-bg border-danger mt-2 rounded-xl border-2 p-5">
            <p className="text-danger text-[0.9375rem] font-extrabold">
              Settings could not be read.
            </p>
            <p className="text-danger mt-2 max-w-[44rem] text-[0.8125rem] font-semibold leading-[1.7]">
              This page is showing nothing rather than a screen of locked controls, because a locked
              control reads as a decision somebody made about your permissions when it actually
              means the page could not look.
            </p>
            <p className="text-muted mt-3 font-mono text-[0.75rem] font-semibold">
              {permissionError}
            </p>
          </div>
        </main>
      </ConsoleShell>
    );
  }

  const [
    { data: zones },
    { data: pricing },
    { data: dispatch },
    { data: settlement },
    { data: payments },
    { data: integrations },
    { data: rails },
    { data: legal },
    { data: retention },
  ] = await Promise.all([
    cityId
      ? s.from('settings_zone_v').select('*').eq('city_id', cityId).order('name')
      : Promise.resolve({ data: [] }),
    cityId
      ? s.from('settings_pricing_v').select('*').eq('city_id', cityId)
      : Promise.resolve({ data: [] }),
    cityId
      ? s.from('settings_dispatch_v').select('*').eq('city_id', cityId).maybeSingle()
      : Promise.resolve({ data: null }),
    cityId
      ? s.from('settings_settlement_v').select('*').eq('city_id', cityId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('payment_method').select('*').order('checkout_order'),
    supabase.from('integration_v').select('*').order('sort'),
    supabase.from('payout_rail').select('*'),
    s.from('settings_legal_v').select('*').order('key'),
    supabase.from('audit_retention_v').select('*').order('subject'),
  ]);

  const props: TabProps = {
    cities: cityRows,
    city,
    zones: (zones as ZoneRow[] | null) ?? [],
    pricing: (pricing as PricingRow[] | null) ?? [],
    dispatch: (dispatch as DispatchRow | null) ?? null,
    settlement: (settlement as SettlementRow | null) ?? null,
    payments: (payments as PaymentRow[] | null) ?? [],
    integrations: (integrations as IntegrationRow[] | null) ?? [],
    rails: (rails as RailRow[] | null) ?? [],
    legal: (legal as LegalRow[] | null) ?? [],
    retention: (retention as RetentionRow[] | null) ?? [],
    definitions: defs,
    changeSets: sets,
    canEdit,
  };

  /* The open draft for this tab and city, which the save bar reads. */
  const group = TAB_GROUP[tab] ?? 'cities';
  const draftSet = sets.find(
    (c) => c.status === 'draft' && c.group === group && (c.city_id ?? null) === (cityId ?? null),
  );

  const anyImmediateBlocked = draftSet
    ? Object.keys(draftSet.diff).some((k) => {
        const key = k.split(':')[0];
        return defs.find((d) => d.key === key)?.can_be_immediate === false;
      })
    : false;

  /* The strictest pair in the draft, computed the same way the
     database computes it, so the dialog does not promise a lighter
     approval than the RPC will demand. */
  const pair = draftSet
    ? (Object.keys(draftSet.diff)
        .map(
          (k) =>
            defs.find((d) => d.key === k.split(':')[0])?.effective_pair ?? 'single:ops_manager',
        )
        .sort((a, b) => rank(b) - rank(a))[0] ?? 'single:ops_manager')
    : 'single:ops_manager';

  return (
    <ConsoleShell staff={staff} current="/settings">
      <ConsoleHeader
        title={TAB_COPY[tab]!.title}
        breadcrumb={TAB_COPY[tab]!.subtitle}
        action={
          <SaveBar
            draft={
              draftSet
                ? {
                    change_set_id: draftSet.change_set_id,
                    title: draftSet.title,
                    changes: Number(draftSet.changes),
                    diff: draftSet.diff,
                    impact: draftSet.impact,
                    anyImmediateBlocked,
                    pair,
                  }
                : null
            }
            onSubmit={submitChangeSet}
            onDiscard={discardDraft}
          />
        }
      />

      <main className="px-4 py-6 sm:px-8">
        <SettingsTabs current={tab} />

        <ScheduledBanner
          sets={sets
            .filter((c) => c.status !== 'draft')
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

        {tab === 'cities' && <CitiesTab {...props} />}
        {tab === 'fees' && <FeesTab {...props} />}
        {tab === 'payments' && <PaymentsTab {...props} />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'branding' && <BrandingTab {...props} />}
        {tab === 'retention' && <RetentionTab {...props} />}
      </main>
    </ConsoleShell>
  );
}

/* The same ordering the database uses in fn_required_pair. */
function rank(pair: string): number {
  if (pair.includes('super_admin')) return 4;
  if (!pair.startsWith('single:')) return 3;
  return 1;
}
