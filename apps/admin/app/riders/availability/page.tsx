import { maps as mapsCapability } from '@nexg/ui/capabilities';
import {
  Bike,
  CheckCircle2,
  Gauge,
  MapPin,
  Radar,
  Signal,
  Timer,
  Truck,
  Users,
  WifiOff,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import { OpsMap, type MapPoint } from '@/components/operations/ops-map';
import {
  CardLink,
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  HeaderButton,
} from '@/components/portal/dash';
import {
  ErrorNote,
  Footnote,
  PanelLine,
  ScreenHeader,
  WaitingForDatabase,
} from '@/components/riders/module';
import { ZoneSwitch } from '@/components/riders/module-client';
import { periodFrom } from '@/lib/portal';
import {
  asMaybe,
  asNumber,
  asObject,
  delta,
  isMissingFunction,
  minutes,
  n,
  pct,
  screenHref,
  seconds,
  shareOf,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Availability & Zones' };
export const dynamic = 'force-dynamic';

const ZONE_DOT = [
  '#1E9E45',
  '#F5B400',
  '#2F80ED',
  '#E5487D',
  '#7C3AED',
  '#E8730C',
  '#0EA5A4',
  '#A16207',
];

interface ZoneFigure {
  id: string;
  name: string;
  active: boolean;
  tier: string | null;
  online: number;
  available: number;
  on_trip: number;
  total: number;
}

interface ZoneHealth {
  zone_id: string;
  paused: boolean;
  paused_reason: string | null;
}

interface DispatchRules {
  accept_window_s: number | null;
  rounds: number | null;
  radius_km: number | null;
  reads_as: string | null;
}

/**
 * Riders → Availability & Zones: who is online now and where
 * (rpc_console_riders_availability), the zones and their pause switch
 * (the live screen's rpc_zone_pause / rpc_zone_resume), the dispatch rules
 * in force, and shift commitments in the period.
 */
export default async function RiderAvailabilityPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; zones?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();
  const period = periodFrom(searchParams);

  const { data: city } = await supabase
    .from('city')
    .select('id, name')
    .eq('slug', 'nairobi')
    .maybeSingle();

  const [readQ, healthQ, rulesQ, liveQ] = await Promise.all([
    supabase.rpc('rpc_console_riders_availability', { p_from: period.from, p_to: period.to }),
    city
      ? supabase
          .from('console_zone_health_v')
          .select('zone_id, paused, paused_reason')
          .eq('city_id', city.id)
      : Promise.resolve({ data: [] }),
    city
      ? supabase.from('dispatch_rules_v').select('*').eq('city_id', city.id).maybeSingle()
      : Promise.resolve({ data: null }),
    city ? supabase.rpc('rpc_riders_live', { p_city_id: city.id }) : Promise.resolve({ data: [] }),
  ]);

  const waiting = isMissingFunction(readQ.error);
  const o = asObject(readQ.data);
  const k = asObject(o.kpis);
  const cov = asObject(o.coverage);
  const shifts = asObject(o.shifts);
  const zones = (Array.isArray(o.by_zone) ? o.by_zone : []) as ZoneFigure[];
  const health = new Map(((healthQ.data as ZoneHealth[] | null) ?? []).map((h) => [h.zone_id, h]));
  const rules = (rulesQ.data as DispatchRules | null) ?? null;
  const allZones = searchParams?.zones === 'all';
  const shownZones = allZones ? zones : zones.slice(0, 12);
  const canPause =
    staff.isSuperAdmin || staff.roles.includes('ops_manager') || staff.roles.includes('city_lead');

  const riders = asNumber(k.riders);
  const zonesActive = asNumber(k.zones);
  const coverage = shareOf(asNumber(k.zones_covered), zonesActive);
  const pins: MapPoint[] = (
    (liveQ.data as
      | {
          name: string | null;
          lat: number | null;
          lng: number | null;
          presence: string;
          zone_name: string | null;
        }[]
      | null) ?? []
  )
    .filter((r) => r.lat != null && r.lng != null && r.presence !== 'offline')
    .map((r) => ({
      kind: 'delivery' as const,
      lat: r.lat!,
      lng: r.lng!,
      label: `${r.name ?? 'Rider'}${r.zone_name ? ` · ${r.zone_name}` : ''}`,
    }));

  return (
    <ConsoleShell staff={staff}>
      <ScreenHeader
        title="Riders – Availability & Zones"
        subtitle="Monitor rider availability, manage service zones, and control rider coverage and shifts."
        period={period}
        exportHref={screenHref('/riders/export', period, { view: 'zones' })}
        action={
          <HeaderButton icon={MapPin} gold href="/settings?tab=cities">
            Manage Zones
          </HeaderButton>
        }
      />
      <DashCanvas>
        {waiting ? (
          <WaitingForDatabase />
        ) : readQ.error ? (
          <ErrorNote message={readQ.error.message} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Users}
                label="Online Now"
                value={n(asNumber(k.online))}
                explain="Active riders online now, free or on a trip."
              >
                <Sub text={`${pct(shareOf(asNumber(k.online), riders))} of active riders`} />
              </DashKpi>
              <DashKpi
                icon={Bike}
                label="On Trip"
                value={n(asNumber(k.on_trip))}
                explain="Carrying an order now."
              >
                <Sub text={pct(shareOf(asNumber(k.on_trip), riders))} />
              </DashKpi>
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Available (Idle)"
                value={n(asNumber(k.available))}
                explain="Online and free for an offer now."
              >
                <Sub text={pct(shareOf(asNumber(k.available), riders))} />
              </DashKpi>
              <DashKpi
                icon={WifiOff}
                label="Offline"
                value={n(asNumber(k.offline))}
                explain="Active accounts not online now."
              >
                <Sub text={pct(shareOf(asNumber(k.offline), riders))} />
              </DashKpi>
              <DashKpi
                icon={MapPin}
                label="Total Zones"
                value={n(zonesActive)}
                explain="Active delivery zones."
              >
                <Sub text={city?.name ?? 'Nairobi'} />
              </DashKpi>
              <DashKpi
                icon={Signal}
                label="Zone Coverage"
                value={pct(coverage)}
                explain="Active zones with at least one rider online in them now."
              >
                <Sub text={`${n(asNumber(k.zones_covered))} of ${n(zonesActive)} zones`} />
              </DashKpi>
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
              <DashCard
                title="Rider Availability (By Zone)"
                aside={
                  zones.length > 12 ? (
                    <CardLink
                      href={screenHref('/riders/availability', period, {
                        zones: allZones ? null : 'all',
                      })}
                    >
                      {allZones ? 'Busiest 12' : `View All (${zones.length})`}
                    </CardLink>
                  ) : undefined
                }
              >
                {zones.length === 0 ? (
                  <p className="text-muted py-8 text-center text-sm font-semibold">
                    No zones are set up yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[0.875rem]">
                      <caption className="sr-only">Riders by zone, now</caption>
                      <thead>
                        <tr className="text-left text-[0.8125rem]">
                          <th scope="col" className="py-2 font-extrabold">
                            Zone
                          </th>
                          <th scope="col" className="py-2 text-right font-extrabold">
                            Online
                          </th>
                          <th scope="col" className="py-2 text-right font-extrabold">
                            Available
                          </th>
                          <th scope="col" className="py-2 text-right font-extrabold">
                            On Trip
                          </th>
                          <th scope="col" className="py-2 text-right font-extrabold">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownZones.map((z, i) => (
                          <tr key={z.id} className="border-border border-t">
                            <td className="py-2 font-semibold">
                              <span className="flex items-center gap-2">
                                <span
                                  aria-hidden="true"
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ background: ZONE_DOT[i % ZONE_DOT.length] }}
                                />
                                {z.name}
                                {!z.active && (
                                  <span className="text-muted text-xs">(inactive)</span>
                                )}
                              </span>
                            </td>
                            <td className="py-2 text-right tabular-nums">{n(z.online)}</td>
                            <td className="py-2 text-right tabular-nums">{n(z.available)}</td>
                            <td className="py-2 text-right tabular-nums">{n(z.on_trip)}</td>
                            <td className="py-2 text-right font-bold tabular-nums">{n(z.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {asNumber(o.unzoned) > 0 && (
                  <Footnote>
                    {n(asNumber(o.unzoned))} active riders have no fix inside a zone, so they are
                    not in a row above.
                  </Footnote>
                )}
              </DashCard>

              <DashCard
                title="Live Coverage & Rider Availability"
                aside={<CardLink href="/live">Live operations</CardLink>}
              >
                <OpsMap
                  maps={mapsCapability()}
                  centre={null}
                  city={city?.name ?? 'Nairobi'}
                  points={pins}
                />
              </DashCard>

              <div className="grid content-start gap-4">
                <DashCard
                  title="Zone Management"
                  aside={<CardLink href="/settings?tab=cities">View All</CardLink>}
                >
                  {zones.length === 0 ? (
                    <p className="text-muted py-4 text-center text-sm font-semibold">
                      No zones yet.
                    </p>
                  ) : (
                    <ul className="max-h-[16rem] space-y-2.5 overflow-y-auto pr-1">
                      {zones
                        .filter((z) => z.active)
                        .map((z) => {
                          const h = health.get(z.id);
                          const paused = h?.paused ?? false;
                          return (
                            <li key={z.id} className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2 font-semibold">
                                <MapPin
                                  aria-hidden="true"
                                  className="h-4 w-4 shrink-0 text-[#E5A800]"
                                />
                                <span className="truncate">{z.name}</span>
                              </span>
                              <span className="flex items-center gap-3">
                                <span
                                  className={`rounded-md px-2 py-0.5 text-[0.75rem] font-bold ${
                                    paused
                                      ? 'bg-[#FDE7E5] text-[#C62D22]'
                                      : 'bg-[#E3F5E6] text-[#1E7B34]'
                                  }`}
                                  title={paused ? (h?.paused_reason ?? undefined) : undefined}
                                >
                                  {paused ? 'Paused' : 'Active'}
                                </span>
                                <ZoneSwitch
                                  zoneId={z.id}
                                  name={z.name}
                                  paused={paused}
                                  canPause={canPause}
                                />
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </DashCard>
                <DashCard title="Rider Availability Rules">
                  <ul>
                    <PanelLine
                      icon={Timer}
                      label="Offer window"
                      value={
                        rules?.accept_window_s != null ? `${rules.accept_window_s} sec` : 'Not set'
                      }
                    />
                    <PanelLine
                      icon={Radar}
                      label="Search radius"
                      value={rules?.radius_km != null ? `${rules.radius_km} km` : 'Not set'}
                    />
                    <PanelLine
                      icon={Gauge}
                      label="Offer rounds"
                      value={rules?.rounds != null ? n(rules.rounds) : 'Not set'}
                    />
                    <PanelLine
                      icon={Zap}
                      label="Auto-assignment"
                      value="Nearest free rider first"
                      href="/settings?tab=cities"
                    />
                  </ul>
                  {rules?.reads_as && <Footnote>{rules.reads_as}</Footnote>}
                </DashCard>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <DashCard title="Coverage & Performance">
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric icon={Signal} label="Zone Coverage" value={pct(coverage)} />
                  <Metric
                    icon={Zap}
                    label="Avg. Accept Time"
                    value={seconds(asMaybe(cov.accept_sec))}
                    change={delta(asMaybe(cov.accept_sec), asMaybe(cov.accept_sec_prev))}
                  />
                  <Metric
                    icon={Truck}
                    label="Avg. Pickup Time"
                    value={minutes(asMaybe(cov.pickup_min))}
                    change={delta(asMaybe(cov.pickup_min), asMaybe(cov.pickup_min_prev))}
                  />
                  <Metric
                    icon={MapPin}
                    label="Avg. Delivery Time"
                    value={minutes(asMaybe(cov.delivery_min))}
                    change={delta(asMaybe(cov.delivery_min), asMaybe(cov.delivery_min_prev))}
                  />
                </ul>
                <Footnote>
                  Accept: offer to accepted. Pickup: assigned to at the shop. Delivery: picked up to
                  delivered. Changes are against the period of the same length before; down is
                  better.
                </Footnote>
              </DashCard>
              <DashCard
                title="Rider Shift & Availability"
                aside={<CardLink href="/riders/console?tab=supply">Manage Shifts</CardLink>}
              >
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <ShiftTile label="All Shifts" value={asNumber(shifts.all)} featured />
                  <ShiftTile label="Morning" value={asNumber(shifts.morning)} />
                  <ShiftTile label="Lunch" value={asNumber(shifts.lunch)} />
                  <ShiftTile label="Dinner" value={asNumber(shifts.dinner)} />
                  <ShiftTile label="Late" value={asNumber(shifts.late)} />
                </ul>
                <Footnote>
                  Shifts riders committed to in the period: {n(asNumber(shifts.showed))} showed up,{' '}
                  {n(asNumber(shifts.no_show))} did not.{' '}
                  <Link href="/riders/console?tab=supply" className="underline underline-offset-2">
                    Supply & shifts
                  </Link>
                </Footnote>
              </DashCard>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

function Sub({ text }: { text: string }) {
  return <span className="text-ink mt-2 block text-[0.875rem] font-bold">{text}</span>;
}

function Metric({
  icon: Icon,
  label,
  value,
  change,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  change?: number | null;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon
        aria-hidden="true"
        className="mt-0.5 h-7 w-7 shrink-0 text-[#E5A800]"
        strokeWidth={1.6}
      />
      <span>
        <span className="block text-[0.8125rem] font-bold">{label}</span>
        <span className="block text-[1.375rem] font-extrabold tabular-nums">{value}</span>
        {change != null && (
          <span
            className={`block text-[0.875rem] font-extrabold ${change <= 0 ? 'text-success' : 'text-danger'}`}
          >
            {change > 0 ? '▲ +' : change < 0 ? '▼ ' : '■ '}
            {change.toFixed(1)}%
          </span>
        )}
      </span>
    </li>
  );
}

function ShiftTile({
  label,
  value,
  featured = false,
}: {
  label: string;
  value: number;
  featured?: boolean;
}) {
  return (
    <li
      className={`rounded-xl px-3 py-3 text-center ${
        featured ? 'border border-[#F2D27A] bg-gradient-to-br from-[#FFDF7E] to-[#FFF7E0]' : 'bg-bg'
      }`}
    >
      <span className="block text-[0.875rem] font-bold">{label}</span>
      <span className="mt-1 block text-[1.375rem] font-extrabold tabular-nums">
        {value.toLocaleString('en-KE')}
      </span>
    </li>
  );
}
