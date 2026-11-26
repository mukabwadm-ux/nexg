import {
  BedDouble,
  Building2,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Coins,
  Home,
  Percent,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
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
import { DashCanvas, DashCard, DashKpi, DashKpiGrid } from '@/components/portal/dash';
import { SaveBar, ScheduledBanner, SettingField } from '@/components/settings/controls';
import type { ChangeSetRow } from '@/components/settings/shared';
import {
  ErrorNote,
  Fact,
  Footnote,
  StaysHeader,
  WaitingForDatabase,
} from '@/components/stays/module';
import { asNumber, asObject, kesFull, n } from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Stays Configuration' };
export const dynamic = 'force-dynamic';

interface SettingRow {
  key: string;
  group: string;
  label: string;
  help: string | null;
  unit: string | null;
  value_type: string;
  value: unknown;
}

const MONEY_KEYS = [
  'stays.pm_share_pct',
  'stays.commission_vat_pct',
  'stays.management_fee_kes',
  'stays.trial_months',
  'stays.guest_orders_shared',
];
const BOOKING_KEYS = [
  'stays.instant_booking',
  'stays.min_nights',
  'stays.max_nights',
  'stays.advance_days',
];
const CHECKIN_KEYS = ['stays.check_in_time', 'stays.check_out_time'];

function asType(t: string): 'int' | 'money' | 'pct' | 'bool' | 'text' | 'enum' {
  return t === 'int' || t === 'money' || t === 'pct' || t === 'bool' || t === 'enum' ? t : 'text';
}
function toValue(v: unknown): number | string | boolean | null {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : null;
}

function LinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li className="border-border border-b last:border-b-0">
      <Link
        href={href}
        className="hover:bg-bg -mx-2 flex items-center justify-between rounded-lg px-2 py-2.5 text-[0.9375rem] font-semibold"
      >
        {children}
        <span aria-hidden="true">›</span>
      </Link>
    </li>
  );
}

/**
 * Stays → Stays Configuration: the stays rules as settings (property
 * manager share, VAT, management fee and trial, guest orders, booking and
 * check-in rules). A change is staged here, approved by a second person and
 * goes live on the settings schedule, as on Settings. NexG's commission is
 * set on Payout rules, per city, where hosts' agreed rates are too.
 */
export default async function StaysConfigurationPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; city?: string };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const [cfg, hosts, props, partners, changeSetsQ, mayEdit] = await Promise.all([
    ctx.read('rpc_console_stays_settings', { p_city: city }),
    ctx.read('rpc_console_stays_hosts', { p_tab: 'verified', p_q: null, p_page: 1, p_size: 1 }),
    ctx.read('rpc_console_stays_properties', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_tab: 'active',
      p_q: null,
    }),
    ctx.read('rpc_console_stays_partners', { p_tab: 'all', p_q: null }),
    ctx.db.from('settings_scheduled_v').select('*').order('requested_at', { ascending: false }),
    ctx.db.rpc('rpc_settings_may_edit', { p_group: 'stays' }),
  ]);
  const o = asObject(cfg.data);
  const settings = (Array.isArray(o.settings) ? o.settings : []) as SettingRow[];
  const byKey = new Map(settings.map((s) => [s.key, s]));
  const canEdit = mayEdit.data === true;
  const sets = ((changeSetsQ.data as ChangeSetRow[] | null) ?? []).filter(
    (c) => c.group === 'stays',
  );
  const drafts = sets.filter((c) => c.status === 'draft');
  const pk = asObject(asObject(props.data).kpis);
  const providers = asObject(o.calendar_by_provider);

  const field = (key: string) => {
    const s = byKey.get(key);
    if (!s) return null;
    return (
      <SettingField
        key={key}
        label={s.label}
        help={s.help}
        group="stays"
        cityId={null}
        settingKey={s.key}
        value={toValue(s.value)}
        unit={s.unit}
        valueType={asType(s.value_type)}
        canEdit={canEdit}
        lockedBy="Changing stays rules is Finance's and an ops manager's, with a second approver."
        onStage={stageChange}
      />
    );
  };

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Stays Configuration"
        subtitle="The rules every stay follows. A change is staged, approved by a second person, then goes live."
        period={period}
        cities={ctx.cities}
        city={city}
        noPeriod
        action={
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
                    anyImmediateBlocked: true,
                    pair: 'finance+ops_manager',
                  }}
                  onSubmit={submitChangeSet}
                  onDiscard={discardDraft}
                />
              ))
            )}
          </div>
        }
      />
      <DashCanvas>
        {cfg.waiting ? (
          <WaitingForDatabase />
        ) : cfg.error ? (
          <ErrorNote message={cfg.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-7">
              <DashKpi
                featured
                icon={Building2}
                label="Active Properties"
                value={n(asNumber(pk.properties))}
                explain="Approved and listed properties."
              />
              <DashKpi
                icon={BedDouble}
                label="Accommodation Units"
                value={n(asNumber(o.live_units))}
                explain="Live units."
              />
              <DashKpi
                icon={Users}
                label="Active Hosts"
                value={n(asNumber(asObject(hosts.data).total))}
                explain="Approved hosts."
              />
              <DashKpi
                icon={Home}
                label="Property Managers"
                value={n(asNumber(asObject(asObject(partners.data).kpis).partners))}
                explain="Partners on record."
              />
              <DashKpi
                icon={ClipboardList}
                label="Booking Rules"
                value={`${BOOKING_KEYS.filter((k) => byKey.has(k)).length} Set`}
                explain="Booking rules in the registry."
              />
              <DashKpi
                icon={Percent}
                label="Commission Rate"
                value={`${asNumber(o.commission_pct)}%`}
                explain="NexG's stay commission in this city today (Payout rules)."
              />
              <DashKpi
                icon={Coins}
                label="Management Fee"
                value={kesFull(
                  asNumber((byKey.get('stays.management_fee_kes')?.value as number) ?? 0),
                )}
                explain="Per property per month, after the free trial."
              />
            </DashKpiGrid>

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

            <div className="grid gap-4 xl:grid-cols-4">
              <DashCard title="General Settings">
                <ul>
                  <LinkRow href="/settings?tab=branding">Business details & contact</LinkRow>
                  <LinkRow href="/settings?tab=cities">Stay service zones (cities)</LinkRow>
                  <LinkRow href="/settings?tab=payments">Currencies & taxes</LinkRow>
                  <LinkRow href="/settings?tab=cities">Default language & time zone</LinkRow>
                  <LinkRow href="/settings?tab=notifications">Branding & email templates</LinkRow>
                </ul>
              </DashCard>
              <DashCard title="Booking & Stay Rules">
                <div className="divide-border divide-y">{BOOKING_KEYS.map(field)}</div>
              </DashCard>
              <DashCard title="Pricing & Rates">
                <Fact icon={Coins} label="Rates">
                  One standard nightly rate per unit
                </Fact>
                <Fact icon={CalendarClock} label="Weekend / seasonal / long-stay">
                  Not set per unit yet
                </Fact>
                <Footnote>
                  Rates are edited on each unit (Accommodation Units, Availability & Rates).{' '}
                  <Link className="underline" href="/stays/availability">
                    Open the calendar
                  </Link>
                </Footnote>
              </DashCard>
              <DashCard title="Fees & Commissions">
                <Fact icon={Percent} label="NexG booking commission">
                  <Link className="underline" href="/finance/payout-rules">
                    {asNumber(o.commission_pct)}% · edit on Payout rules
                  </Link>
                </Fact>
                <Fact icon={ShieldCheck} label="Agreed host rates in force">
                  {n(asNumber(o.agreed_terms))}
                </Fact>
                <div className="divide-border divide-y">{MONEY_KEYS.map(field)}</div>
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-4">
              <DashCard title="Check-in & Check-out">
                <div className="divide-border divide-y">{CHECKIN_KEYS.map(field)}</div>
                <Footnote>
                  Self check-in, reception and early or late check-out are set by each host on their
                  unit.
                </Footnote>
              </DashCard>
              <DashCard title="Availability & Calendar">
                <ul>
                  <LinkRow href="/stays/availability">Availability calendar (per unit)</LinkRow>
                  <LinkRow href="/stays/availability">
                    Block dates (maintenance, owner stay)
                  </LinkRow>
                </ul>
                <Fact icon={CalendarCheck} label="Calendar sync connections working">
                  {n(asNumber(o.calendar_connections))}
                </Fact>
              </DashCard>
              <DashCard title="Stay Policies">
                <ul>
                  <LinkRow href="/finance/payout-rules">Cancellation policy presets</LinkRow>
                  <LinkRow href="/hotels?tab=refunds">Refunds</LinkRow>
                  <LinkRow href="/stays/incidents">Incident & dispute handling</LinkRow>
                  <LinkRow href="/settings?tab=branding">House rules & legal terms</LinkRow>
                </ul>
              </DashCard>
              <DashCard title="Integrations">
                <ul className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ['Airbnb', asNumber(providers.airbnb)],
                    ['Booking.com', asNumber(providers.booking_com)],
                    ['iCal', asNumber(providers.ical)],
                  ].map(([name, count]) => (
                    <li key={String(name)} className="rounded-xl bg-[#FFFBF0] p-2">
                      <p className="font-extrabold">{String(name)}</p>
                      <p className="text-muted text-[0.75rem] font-semibold">
                        {Number(count) > 0
                          ? `${n(Number(count))} host calendar${Number(count) === 1 ? '' : 's'}`
                          : 'None connected'}
                      </p>
                    </li>
                  ))}
                </ul>
                <Footnote>
                  Hosts connect their own calendars in their workspace. All integrations:{' '}
                  <Link className="underline" href="/integrations">
                    Integrations
                  </Link>
                  .
                </Footnote>
              </DashCard>
            </div>

            <DashCard title="Advanced Settings">
              <ul className="grid gap-x-6 sm:grid-cols-3">
                <LinkRow href="/staff?tab=roles">User roles & permissions (Stays)</LinkRow>
                <LinkRow href="/settings?tab=notifications">Notifications & alerts</LinkRow>
                <LinkRow href="/audit">Audit log of stays changes</LinkRow>
              </ul>
              {!canEdit && (
                <p className="text-muted mt-3 flex items-center gap-2 text-[0.8125rem] font-semibold">
                  <Settings2 aria-hidden="true" className="h-4 w-4" />
                  You can read these rules; changing them is Finance&rsquo;s and an ops
                  manager&rsquo;s.
                </p>
              )}
            </DashCard>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
