import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

import { TrendArea } from '@/components/charts';
import { Panel } from '@/components/console-kit';

import {
  CashAdjustForm,
  MessageComposer,
  RevealLocation,
  RiderControlsCard,
} from './rider-record-actions';
import { CashBar, DASH, kes, num, PresencePill, Tile, VEHICLE_LABEL } from './shared';

/*
 * A rider's record, from rpc_console_rider_profile (20270310000100). One
 * jsonb per page load; each view below draws one part of it. Nothing here
 * invents a figure: an empty list says what would be in it and why it is
 * empty, and a rate with nothing to divide by is a dash.
 */

// ──────────────────────────────────────────────────────────── shapes

export interface RiderProfile {
  profile: {
    id: string;
    first_name: string;
    last_name: string | null;
    status: string;
    status_reason: string | null;
    city: string | null;
    vehicle: string | null;
    plate_no: string | null;
    ownership: string | null;
    insurance: string | null;
    years_riding: string | null;
    areas: string[] | null;
    shifts: string[] | null;
    source: string | null;
    employer: string | null;
    submitted_at: string | null;
    activated_at: string | null;
    created_at: string;
    phone_verified_at: string | null;
    payout_msisdn_masked: string | null;
    payout_msisdn_changed_at: string | null;
    agreement: { version: string; accepted_at: string; current: boolean } | null;
    current_agreement: string | null;
    devices: {
      platform: string;
      label: string | null;
      is_job_device: boolean;
      bound_at: string;
      last_seen_at: string | null;
      unbound_at: string | null;
      location_permission: boolean;
      notification_permission: boolean;
    }[];
    phone_changes: { kind: string; created_at: string; verified_at: string | null }[];
  };
  live: {
    presence: string;
    presence_changed_at: string | null;
    last_seen_at: string | null;
    last_location_at: string | null;
    has_location: boolean;
    zone: string | null;
    current_order_reference: string | null;
    current_order_id: string | null;
    cooldown_until: string | null;
    cooldown_reason: string | null;
    can_receive_offers: boolean;
    offers_paused_reason: string | null;
    large_items_eligible: boolean;
    alcohol_eligible: boolean;
  };
  stats: {
    trips_30d: number;
    trips_all: number;
    offers_30d: number;
    accepted_30d: number;
    on_time_30d: number;
    timed_30d: number;
    earned_30d_kes: number;
    health_score: number | null;
    health_band: string | null;
    strike_count: number;
  };
  trips: {
    order_id: string;
    reference: string;
    stage: string;
    at: string;
    merchant: string | null;
    dropoff: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
    promised_delivery_at: string | null;
    handed_to: string | null;
    proof: 'code' | 'photo' | null;
    earned_kes: number | null;
    stars: number | null;
  }[];
  offers: {
    offered_at: string;
    responded_at: string | null;
    outcome: string;
    decline_reason: string | null;
    distance_km: number | null;
    direct: boolean;
    reference: string | null;
    order_id: string;
  }[];
  money: {
    cash_on_hand_kes: number;
    cash_cap_kes: number | null;
    by_day: { day: string; kes: number; trips: number }[];
    earnings: {
      earned_at: string;
      order_reference: string | null;
      base_kes: number;
      distance_kes: number;
      waiting_kes: number;
      bonus_kes: number;
      tip_kes: number;
      penalty_kes: number;
      total_kes: number;
      is_test: boolean;
    }[];
    cash_events: {
      id: number;
      kind: string;
      amount_kes: number;
      order_reference: string | null;
      note: string | null;
      created_at: string;
    }[];
    settlements: {
      period_start: string;
      period_end: string;
      trips: number;
      earnings_kes: number;
      bonuses_kes: number;
      tips_kes: number;
      cash_net_kes: number;
      net_pay_kes: number;
      status: string;
      paid_at: string | null;
      failure_reason: string | null;
    }[];
    payout_requests: {
      requested_at: string;
      amount_kes: number;
      status: string;
      reason: string | null;
      decided_at: string | null;
      decision_note: string | null;
      paid_at: string | null;
    }[];
    adjustments: { created_at: string; kind: string; amount_kes: number; reason: string }[];
  };
  activity: {
    shifts: {
      date: string;
      time_window: string;
      status: string;
      zone: string | null;
      showed_at: string | null;
    }[];
    points_total: number;
    points: { earned_at: string; points: number; reason: string }[];
    referrals: {
      created_at: string;
      referred_name: string | null;
      status: string;
      first_trip_at: string | null;
      reward_status: string;
      reward_amount_kes: number | null;
      void_reason: string | null;
    }[];
    referred_by: string | null;
  };
  ratings: {
    avg: number | null;
    count: number;
    by_star: Record<string, number> | null;
    tags: Record<string, number>;
    recent: {
      created_at: string;
      stars: number;
      tags: string[];
      comment: string | null;
      reference: string | null;
      order_id: string;
    }[];
    order_ratings_about_rider: {
      created_at: string;
      stars: number;
      comment: string | null;
      reference: string | null;
    }[];
  };
  conduct: {
    incidents: {
      id: string;
      kind: string;
      severity: string;
      status: string;
      happened_at: string;
      description: string | null;
      order_reference: string | null;
      resolution: string | null;
    }[];
    complaints: {
      reference: string;
      order_reference: string | null;
      created_at: string;
      status: string;
      topic: string;
      body: string;
    }[];
    strikes: {
      level: number;
      reason: string;
      issued_at: string;
      expires_at: string | null;
      cleared_at: string | null;
      issued_by: string | null;
    }[];
    fraud_flags: {
      id: string;
      kind: string;
      severity: string;
      status: string;
      summary: string | null;
      detected_at: string;
      order_reference: string | null;
    }[];
    status_history: {
      at: string;
      from: string | null;
      to: string;
      reason: string | null;
      by: string | null;
      second_approver: string | null;
    }[];
  };
  messages: {
    id: string;
    direction: 'in' | 'out';
    channel: string;
    subject: string | null;
    body: string;
    created_at: string;
    read_at: string | null;
    by: string | null;
  }[];
  audit: {
    at: string;
    action: string;
    actor_type: string;
    actor: string | null;
    reason: string | null;
    severity: string;
  }[];
}

export interface TripDetail {
  order_id: string;
  reference: string;
  stage: string;
  carried: boolean;
  merchant: string | null;
  dropoff: string | null;
  placed_at: string | null;
  promised_delivery_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  handed_to: string | null;
  handoff_code_verified: boolean | null;
  handoff_photo_path: string | null;
  jobs: {
    state: string;
    started_at: string;
    assigned_at: string | null;
    at_pickup_at: string | null;
    ended_at: string | null;
    end_reason: string | null;
    distance_km: number | null;
    pickup: string;
    dropoff: string;
    assigned_to_this_rider: boolean | null;
  }[];
  offers: {
    offered_at: string;
    responded_at: string | null;
    outcome: string;
    decline_reason: string | null;
    distance_km: number | null;
    eta_min: number | null;
    direct: boolean;
  }[];
  events: {
    at: string;
    kind: string;
    title: string;
    detail: string | null;
    actor_type: string;
    photo_path: string | null;
  }[];
  earning: {
    total_kes: number;
    base_kes: number;
    distance_kes: number;
    tip_kes: number;
    is_test: boolean;
  } | null;
  cash: { kind: string; amount_kes: number; created_at: string }[];
  rating: { stars: number; tags: string[]; comment: string | null; created_at: string } | null;
}

// ──────────────────────────────────────────────────────────── small things

const stamp = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-KE', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;

const day = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;

const words = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ') : DASH);

export const RATING_TAG_LABEL: Record<string, string> = {
  on_time: 'On time',
  friendly: 'Friendly',
  careful: 'Careful with the order',
  followed_instructions: 'Followed instructions',
  late: 'Late',
  rude: 'Rude',
  damaged: 'Order damaged',
  hard_to_reach: 'Hard to reach',
};

const th =
  'px-4 py-3 text-left text-[0.625rem] font-extrabold uppercase tracking-wide text-muted-light';
const td = 'px-4 py-3 text-[0.8125rem] font-semibold';

function Table({
  head,
  children,
  min = '40rem',
}: {
  head: string[];
  children: React.ReactNode;
  min?: string;
}) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full text-left" style={{ minWidth: min }}>
        <thead>
          <tr className="border-border border-b">
            {head.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border divide-y">{children}</tbody>
      </table>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  const cls =
    tone === 'good'
      ? 'bg-success-bg text-success'
      : tone === 'bad'
        ? 'bg-danger-bg text-danger'
        : tone === 'warn'
          ? 'bg-warning-bg text-warning'
          : 'bg-bg text-muted';
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase ${cls}`}
    >
      {children}
    </span>
  );
}

function Stars({ n }: { n: number | null }) {
  if (n === null) return <span className="text-muted-light">{DASH}</span>;
  return (
    <span aria-label={`${n} of 5`} className="text-gold-text font-extrabold tabular-nums">
      {'★'.repeat(n)}
      <span className="text-border-strong">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-muted-light font-semibold">{label}</dt>
          <dd className="text-right font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const pctOf = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : `${DASH}%`);

// ──────────────────────────────────────────────────────────── the KPI row

export function RiderKpis({ p }: { p: RiderProfile }) {
  const s = p.stats;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Tile label="Trips · 30 d" value={num(s.trips_30d)}>
        {num(s.trips_all)} delivered in all
      </Tile>
      <Tile label="Acceptance · 30 d" value={pctOf(s.accepted_30d, s.offers_30d)}>
        {s.offers_30d === 0
          ? 'no offers answered yet'
          : `${s.accepted_30d} of ${s.offers_30d} offers`}
      </Tile>
      <Tile label="On time · 30 d" value={pctOf(s.on_time_30d, s.timed_30d)}>
        {s.timed_30d === 0
          ? 'no trip had a promised time'
          : `${s.on_time_30d} of ${s.timed_30d} trips`}
      </Tile>
      <Tile
        label="Customer rating"
        value={p.ratings.avg === null ? DASH : Number(p.ratings.avg).toFixed(1)}
      >
        {p.ratings.count === 0 ? 'no ratings yet' : `${p.ratings.count} ratings`}
      </Tile>
      <Tile label="Earned · 30 d" value={kes(s.earned_30d_kes)}>
        test trips left out
      </Tile>
      <Tile
        label="Cash on hand"
        value={kes(p.money.cash_on_hand_kes)}
        tone={
          p.money.cash_cap_kes && p.money.cash_on_hand_kes >= p.money.cash_cap_kes
            ? 'danger'
            : undefined
        }
      >
        {p.money.cash_cap_kes ? `cap ${kes(p.money.cash_cap_kes)}` : 'no cap set'}
      </Tile>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── overview

export function OverviewView({ p }: { p: RiderProfile }) {
  const l = p.live;
  const pr = p.profile;
  const twoWheeler = pr.vehicle === 'motorbike' || pr.vehicle === 'bicycle';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="space-y-6">
        <Panel id="live" title="Right now" className="scroll-mt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={l.presence === 'offline' ? undefined : 'good'}>{words(l.presence)}</Pill>
            <PresencePill presence={l.presence} cooldownUntil={l.cooldown_until} />
            {!l.can_receive_offers && <Pill tone="warn">offers paused</Pill>}
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <Rows
              rows={[
                ['Since', stamp(l.presence_changed_at)],
                ['Last seen by the app', stamp(l.last_seen_at)],
                ['Last location fix', l.has_location ? stamp(l.last_location_at) : 'never'],
                ['Zone', l.zone ?? DASH],
                [
                  'Current trip',
                  l.current_order_id ? (
                    <Link
                      href={`?view=trips&trip=${l.current_order_id}`}
                      className="text-gold-text underline"
                    >
                      {l.current_order_reference}
                    </Link>
                  ) : (
                    (l.current_order_reference ?? 'none')
                  ),
                ],
              ]}
            />
            <div>
              <p className="text-muted text-xs font-semibold leading-relaxed">
                Coordinates are not on this page. Looking them up is written to the audit trail, and
                off a trip it needs a reason.
              </p>
              <div className="mt-3">
                <RevealLocation riderId={pr.id} onTrip={l.presence === 'on_trip'} />
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Profile">
          <div className="grid gap-6 md:grid-cols-2">
            <Rows
              rows={[
                ['City', pr.city ?? DASH],
                ['Vehicle', VEHICLE_LABEL[pr.vehicle ?? ''] ?? words(pr.vehicle)],
                ['Plate', pr.plate_no ?? DASH],
                ['Ownership', words(pr.ownership)],
                ['Insurance', words(pr.insurance)],
                ['Years riding', pr.years_riding ?? DASH],
                ['Areas', pr.areas?.length ? pr.areas.join(', ') : DASH],
                ['Shifts they prefer', pr.shifts?.length ? pr.shifts.join(', ') : DASH],
              ]}
            />
            <Rows
              rows={[
                ['Applied', day(pr.submitted_at ?? pr.created_at)],
                ['Activated', day(pr.activated_at)],
                ['Came from', words(pr.source)],
                ['Fleet', pr.employer ?? 'independent'],
                ['Referred by', p.activity.referred_by ?? DASH],
                ['Phone verified', day(pr.phone_verified_at)],
                [
                  'Payout number',
                  pr.payout_msisdn_masked
                    ? `${pr.payout_msisdn_masked}${pr.payout_msisdn_changed_at ? ` · changed ${day(pr.payout_msisdn_changed_at)}` : ''}`
                    : 'not set',
                ],
                [
                  'Agreement',
                  pr.agreement
                    ? `${pr.agreement.version} · ${day(pr.agreement.accepted_at)}${pr.agreement.current ? '' : ' · not the current one'}`
                    : pr.current_agreement
                      ? `not signed (current ${pr.current_agreement})`
                      : 'none published',
                ],
              ]}
            />
          </div>
          {pr.status_reason && (
            <p className="text-muted mt-4 text-xs font-semibold">Status note: {pr.status_reason}</p>
          )}
        </Panel>

        <Panel title="Devices" aside="the phone they take jobs on">
          {pr.devices.length === 0 ? (
            <p className="text-muted text-sm font-semibold">
              No phone has been bound yet. It is bound the first time they sign in to the rider
              portal.
            </p>
          ) : (
            <Table head={['Device', 'Bound', 'Last seen', 'Location', 'Notifications']} min="34rem">
              {pr.devices.map((d, i) => (
                <tr key={i}>
                  <td className={td}>
                    {d.label ?? d.platform}
                    {d.is_job_device && !d.unbound_at && (
                      <span className="ml-2">
                        <Pill tone="good">job phone</Pill>
                      </span>
                    )}
                    {d.unbound_at && (
                      <span className="ml-2">
                        <Pill>unbound {day(d.unbound_at)}</Pill>
                      </span>
                    )}
                  </td>
                  <td className={td}>{day(d.bound_at)}</td>
                  <td className={td}>{stamp(d.last_seen_at)}</td>
                  <td className={td}>{d.location_permission ? 'allowed' : 'off'}</td>
                  <td className={td}>{d.notification_permission ? 'allowed' : 'off'}</td>
                </tr>
              ))}
            </Table>
          )}
          {pr.phone_changes.length > 0 && (
            <p className="text-muted mt-3 text-xs font-semibold">
              Phone or payout number changes:{' '}
              {pr.phone_changes
                .map(
                  (c) =>
                    `${words(c.kind)} ${day(c.created_at)}${c.verified_at ? '' : ' (not verified)'}`,
                )
                .join(' · ')}
            </p>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <RiderControlsCard
          riderId={pr.id}
          state={{
            canReceiveOffers: l.can_receive_offers,
            offersPausedReason: l.offers_paused_reason,
            largeItems: l.large_items_eligible,
            twoWheeler,
            cooldownUntil: l.cooldown_until,
            cooldownReason: l.cooldown_reason,
          }}
        />
        <Card className="p-5">
          <p className="text-[0.9375rem] font-extrabold">Cash on hand</p>
          <p className="mt-2 text-[1.5rem] font-extrabold leading-tight">
            {kes(p.money.cash_on_hand_kes)}
          </p>
          <div className="mt-3">
            <CashBar held={p.money.cash_on_hand_kes} cap={p.money.cash_cap_kes} />
          </div>
          <Link href="?view=money" className="text-gold-text mt-3 inline-block text-xs font-bold">
            Earnings, cash and payouts →
          </Link>
        </Card>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── trips

const OUTCOME_TONE: Record<string, 'good' | 'bad' | 'warn' | undefined> = {
  accepted: 'good',
  declined: 'bad',
  timed_out: 'warn',
};

export function TripsView({
  p,
  trip,
  photos,
}: {
  p: RiderProfile;
  trip: TripDetail | null;
  photos: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      {trip && <TripTimeline trip={trip} photos={photos} />}

      <Panel title="Trips" aside="the last 50 orders they carried">
        {p.trips.length === 0 ? (
          <p className="text-muted text-sm font-semibold">
            No trips yet. Orders appear here once dispatch assigns one to this rider.
          </p>
        ) : (
          <Table head={['Order', 'Shop', 'Stage', 'Delivered', 'Proof', 'Earned', 'Rating']}>
            {p.trips.map((t) => {
              const late =
                t.delivered_at &&
                t.promised_delivery_at &&
                new Date(t.delivered_at) > new Date(t.promised_delivery_at);
              return (
                <tr key={t.order_id} className={trip?.order_id === t.order_id ? 'bg-bg' : ''}>
                  <td className={td}>
                    <Link
                      href={`?view=trips&trip=${t.order_id}`}
                      className="font-extrabold hover:underline"
                    >
                      {t.reference}
                    </Link>
                  </td>
                  <td className={td}>{t.merchant ?? DASH}</td>
                  <td className={td}>
                    <Pill tone={t.stage === 'delivered' ? 'good' : undefined}>
                      {words(t.stage)}
                    </Pill>
                  </td>
                  <td className={td}>
                    {stamp(t.delivered_at)}
                    {late && (
                      <span className="ml-1.5">
                        <Pill tone="warn">late</Pill>
                      </span>
                    )}
                  </td>
                  <td className={td}>{t.proof ?? DASH}</td>
                  <td className={td}>{t.earned_kes === null ? DASH : kes(t.earned_kes)}</td>
                  <td className={td}>
                    <Stars n={t.stars} />
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <Panel title="Offers" aside="the last 50, including the ones they turned down">
        {p.offers.length === 0 ? (
          <p className="text-muted text-sm font-semibold">No offers have been sent to them yet.</p>
        ) : (
          <Table head={['Offered', 'Order', 'Outcome', 'Answered', 'Distance']} min="34rem">
            {p.offers.map((o, i) => (
              <tr key={i}>
                <td className={td}>{stamp(o.offered_at)}</td>
                <td className={td}>
                  <Link href={`?view=trips&trip=${o.order_id}`} className="hover:underline">
                    {o.reference ?? DASH}
                  </Link>
                  {o.direct && (
                    <span className="ml-1.5">
                      <Pill>by name</Pill>
                    </span>
                  )}
                </td>
                <td className={td}>
                  <Pill tone={OUTCOME_TONE[o.outcome]}>{words(o.outcome)}</Pill>
                  {o.decline_reason && (
                    <span className="text-muted ml-1.5 text-xs">{words(o.decline_reason)}</span>
                  )}
                </td>
                <td className={td}>{stamp(o.responded_at)}</td>
                <td className={td}>{o.distance_km === null ? DASH : `${o.distance_km} km`}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

/** Offer → accepted → at the shop → picked up → handover → delivered. */
function TripTimeline({ trip, photos }: { trip: TripDetail; photos: Record<string, string> }) {
  const job = trip.jobs.find((j) => j.assigned_to_this_rider) ?? trip.jobs[trip.jobs.length - 1];

  type Step = { at: string | null; title: string; detail?: React.ReactNode; photo?: string };
  const steps: Step[] = [];
  for (const o of trip.offers) {
    steps.push({
      at: o.offered_at,
      title: 'Offer sent',
      detail: o.distance_km ? `${o.distance_km} km away` : undefined,
    });
    if (o.responded_at)
      steps.push({
        at: o.responded_at,
        title: `Offer ${words(o.outcome)}`,
        detail: o.decline_reason ? words(o.decline_reason) : undefined,
      });
  }
  if (job?.assigned_to_this_rider && job.assigned_at)
    steps.push({ at: job.assigned_at, title: 'Assigned to them' });
  if (job?.assigned_to_this_rider && job.at_pickup_at)
    steps.push({ at: job.at_pickup_at, title: 'At the shop' });
  for (const e of trip.events) {
    if (e.actor_type !== 'rider' && !['picked_up', 'delivered', 'cancelled'].includes(e.kind))
      continue;
    steps.push({
      at: e.at,
      title: e.title,
      detail: e.detail ?? undefined,
      photo: e.photo_path ? photos[e.photo_path] : undefined,
    });
  }
  steps.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());

  const handoverPhoto = trip.handoff_photo_path ? photos[trip.handoff_photo_path] : undefined;

  return (
    <Panel
      title={`Trip ${trip.reference}`}
      aside={
        trip.carried ? (trip.merchant ?? undefined) : 'offered to them, carried by someone else'
      }
      action={{ href: '?view=trips', label: 'Close' }}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ol className="border-border relative space-y-4 border-l pl-5">
          {steps.length === 0 && (
            <li className="text-muted text-sm font-semibold">Nothing recorded for this trip.</li>
          )}
          {steps.map((s, i) => (
            <li key={i} className="relative">
              <span
                aria-hidden="true"
                className="bg-gold absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full"
              />
              <p className="text-sm font-extrabold">{s.title}</p>
              <p className="text-muted text-xs font-semibold">
                {stamp(s.at)}
                {s.detail ? <> · {s.detail}</> : null}
              </p>
              {s.photo && (
                <a href={s.photo} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a five-minute signed URL */}
                  <img
                    src={s.photo}
                    alt={`Proof: ${s.title}`}
                    className="border-border mt-2 h-28 rounded-lg border object-cover"
                  />
                </a>
              )}
            </li>
          ))}
        </ol>
        <div className="space-y-4">
          <Rows
            rows={[
              ['Stage', words(trip.stage)],
              ['Drop-off', trip.dropoff ?? DASH],
              ['Promised by', stamp(trip.promised_delivery_at)],
              ['Delivered', stamp(trip.delivered_at)],
              ['Handed to', words(trip.handed_to)],
              [
                'Proof',
                trip.handoff_code_verified
                  ? 'customer code'
                  : trip.handoff_photo_path
                    ? 'photo'
                    : DASH,
              ],
              ['Earned', trip.earning ? kes(trip.earning.total_kes) : DASH],
              [
                'Cash',
                trip.cash.length
                  ? trip.cash.map((c) => `${words(c.kind)} ${kes(c.amount_kes)}`).join(', ')
                  : 'none',
              ],
            ]}
          />
          {handoverPhoto && (
            <a href={handoverPhoto} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- a five-minute signed URL */}
              <img
                src={handoverPhoto}
                alt="Handover proof"
                className="border-border w-full rounded-lg border object-cover"
              />
            </a>
          )}
          {trip.rating && (
            <div>
              <Stars n={trip.rating.stars} />
              <p className="text-muted mt-1 text-xs font-semibold">
                {trip.rating.tags.map((t) => RATING_TAG_LABEL[t] ?? t).join(', ')}
                {trip.rating.comment ? ` · “${trip.rating.comment}”` : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ──────────────────────────────────────────────────────────── money

export function MoneyView({ p }: { p: RiderProfile }) {
  const m = p.money;
  const earned30 = m.by_day.reduce((s, d) => s + d.kes, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <Panel title="Earnings" aside="last 30 days, KES">
          {earned30 === 0 ? (
            <p className="text-muted text-sm font-semibold">
              Nothing earned in the last 30 days. Each delivered trip is paid on the city&apos;s
              rate card and shows here.
            </p>
          ) : (
            <TrendArea
              data={m.by_day.map((d) => ({ day: d.day, kes: d.kes, trips: d.trips }))}
              series={[{ key: 'kes', label: 'Earned', fill: true }]}
              unit="kes"
              height={220}
            />
          )}
        </Panel>
        <Card className="space-y-3 p-5">
          <p className="text-[0.9375rem] font-extrabold">Cash on hand</p>
          <p className="text-[1.5rem] font-extrabold leading-tight">{kes(m.cash_on_hand_kes)}</p>
          <CashBar held={m.cash_on_hand_kes} cap={m.cash_cap_kes} />
          <p className="text-muted-light text-[0.6875rem] font-semibold leading-snug">
            A correction goes on the cash ledger with your name. Large ones need a second person.
          </p>
          <CashAdjustForm riderId={p.profile.id} />
        </Card>
      </div>

      <Panel title="Pay per trip" aside="the last 50">
        {m.earnings.length === 0 ? (
          <p className="text-muted text-sm font-semibold">No trip has been paid yet.</p>
        ) : (
          <Table
            head={[
              'When',
              'Order',
              'Base',
              'Distance',
              'Waiting',
              'Bonus',
              'Tip',
              'Penalty',
              'Total',
            ]}
            min="48rem"
          >
            {m.earnings.map((e, i) => (
              <tr key={i}>
                <td className={td}>{stamp(e.earned_at)}</td>
                <td className={td}>
                  {e.order_reference ?? DASH}
                  {e.is_test && (
                    <span className="ml-1.5">
                      <Pill>test</Pill>
                    </span>
                  )}
                </td>
                <td className={td}>{kes(e.base_kes)}</td>
                <td className={td}>{kes(e.distance_kes)}</td>
                <td className={td}>{kes(e.waiting_kes)}</td>
                <td className={td}>{kes(e.bonus_kes)}</td>
                <td className={td}>{kes(e.tip_kes)}</td>
                <td className={td}>{e.penalty_kes ? kes(-e.penalty_kes) : DASH}</td>
                <td className={`${td} font-extrabold`}>{kes(e.total_kes)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Cash ledger" aside="the last 50 movements">
          {m.cash_events.length === 0 ? (
            <p className="text-muted text-sm font-semibold">
              No cash has been collected or deposited.
            </p>
          ) : (
            <Table head={['When', 'What', 'Order', 'KES']} min="30rem">
              {m.cash_events.map((c) => (
                <tr key={c.id}>
                  <td className={td}>{stamp(c.created_at)}</td>
                  <td className={td}>
                    {words(c.kind)}
                    {c.note && <span className="text-muted block text-xs">{c.note}</span>}
                  </td>
                  <td className={td}>{c.order_reference ?? DASH}</td>
                  <td className={`${td} tabular-nums`}>{kes(c.amount_kes)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel
          title="Payout requests"
          action={{ href: '/finance/settlements', label: 'Decide in Finance' }}
        >
          {m.payout_requests.length === 0 ? (
            <p className="text-muted text-sm font-semibold">They have not asked for a payout.</p>
          ) : (
            <Table head={['Asked', 'KES', 'Status', 'Decided', 'Paid']} min="30rem">
              {m.payout_requests.map((r, i) => (
                <tr key={i}>
                  <td className={td}>{stamp(r.requested_at)}</td>
                  <td className={td}>{kes(r.amount_kes)}</td>
                  <td className={td}>
                    <Pill
                      tone={r.status === 'paid' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}
                    >
                      {words(r.status)}
                    </Pill>
                    {r.decision_note && (
                      <span className="text-muted block text-xs">{r.decision_note}</span>
                    )}
                  </td>
                  <td className={td}>{day(r.decided_at)}</td>
                  <td className={td}>{day(r.paid_at)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Weekly settlements">
          {m.settlements.length === 0 ? (
            <p className="text-muted text-sm font-semibold">
              Not in a settlement run yet. Runs are built on the Weekly settlement tab.
            </p>
          ) : (
            <Table
              head={['Week', 'Trips', 'Earned', 'Cash netted', 'Net pay', 'Status']}
              min="34rem"
            >
              {m.settlements.map((s, i) => (
                <tr key={i}>
                  <td className={td}>
                    {day(s.period_start)} – {day(s.period_end)}
                  </td>
                  <td className={td}>{s.trips}</td>
                  <td className={td}>{kes(s.earnings_kes + s.bonuses_kes + s.tips_kes)}</td>
                  <td className={td}>{kes(s.cash_net_kes)}</td>
                  <td className={`${td} font-extrabold`}>{kes(s.net_pay_kes)}</td>
                  <td className={td}>
                    <Pill
                      tone={
                        s.status === 'paid' ? 'good' : s.status === 'failed' ? 'bad' : undefined
                      }
                    >
                      {words(s.status)}
                    </Pill>
                    {s.failure_reason && (
                      <span className="text-danger block text-xs">{s.failure_reason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <Panel title="Adjustments">
          {m.adjustments.length === 0 ? (
            <p className="text-muted text-sm font-semibold">No pay adjustments.</p>
          ) : (
            <Table head={['When', 'Kind', 'KES', 'Reason']} min="30rem">
              {m.adjustments.map((a, i) => (
                <tr key={i}>
                  <td className={td}>{day(a.created_at)}</td>
                  <td className={td}>{words(a.kind)}</td>
                  <td className={td}>{kes(a.amount_kes)}</td>
                  <td className={td}>{a.reason}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── activity

export function ActivityView({ p }: { p: RiderProfile }) {
  const a = p.activity;
  const showed = a.shifts.filter((s) => s.showed_at).length;
  const past = a.shifts.filter((s) => new Date(s.date) < new Date()).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Shifts booked" value={num(a.shifts.length)}>
          the last 30 bookings
        </Tile>
        <Tile label="Showed up" value={past === 0 ? `${DASH}%` : pctOf(showed, past)}>
          {past === 0 ? 'no past shifts' : `${showed} of ${past} past shifts`}
        </Tile>
        <Tile label="Points" value={num(a.points_total)}>
          from trips and rewards
        </Tile>
        <Tile label="Referrals" value={num(a.referrals.length)}>
          {a.referrals.filter((r) => r.first_trip_at).length} made a first trip
        </Tile>
      </div>

      <Panel title="Shifts">
        {a.shifts.length === 0 ? (
          <p className="text-muted text-sm font-semibold">
            No shifts booked. Riders book them on the Shifts page of the rider portal.
          </p>
        ) : (
          <Table head={['Date', 'Window', 'Zone', 'Status', 'Showed up']} min="34rem">
            {a.shifts.map((s, i) => (
              <tr key={i}>
                <td className={td}>{day(s.date)}</td>
                <td className={td}>{s.time_window}</td>
                <td className={td}>{s.zone ?? DASH}</td>
                <td className={td}>
                  <Pill tone={s.status === 'no_show' ? 'bad' : undefined}>{words(s.status)}</Pill>
                </td>
                <td className={td}>{stamp(s.showed_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Points" aside={`${num(a.points_total)} in all`}>
          {a.points.length === 0 ? (
            <p className="text-muted text-sm font-semibold">No points earned yet.</p>
          ) : (
            <Table head={['When', 'Points', 'For']} min="24rem">
              {a.points.map((x, i) => (
                <tr key={i}>
                  <td className={td}>{day(x.earned_at)}</td>
                  <td className={`${td} font-extrabold`}>+{x.points}</td>
                  <td className={td}>{words(x.reason)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <Panel title="People they referred">
          {a.referrals.length === 0 ? (
            <p className="text-muted text-sm font-semibold">
              Nobody yet. Riders share their code from Refer a rider on the rider portal.
            </p>
          ) : (
            <Table head={['Who', 'When', 'Status', 'First trip', 'Reward']} min="30rem">
              {a.referrals.map((r, i) => (
                <tr key={i}>
                  <td className={td}>{r.referred_name ?? DASH}</td>
                  <td className={td}>{day(r.created_at)}</td>
                  <td className={td}>
                    {words(r.status)}
                    {r.void_reason && (
                      <span className="text-muted block text-xs">{r.void_reason}</span>
                    )}
                  </td>
                  <td className={td}>{day(r.first_trip_at)}</td>
                  <td className={td}>
                    {words(r.reward_status)}
                    {r.reward_amount_kes ? ` · ${kes(r.reward_amount_kes)}` : ''}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── conduct

export function ConductView({ p }: { p: RiderProfile }) {
  const c = p.conduct;
  const r = p.ratings;
  const tags = Object.entries(r.tags).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel title="Customer ratings">
          {r.count === 0 ? (
            <p className="text-muted text-sm font-semibold">
              No customer has rated them yet. Customers rate their rider on the order page once it
              is delivered.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-[2rem] font-extrabold leading-none">
                {Number(r.avg).toFixed(1)}
                <span className="text-muted-light ml-2 text-sm font-bold">
                  from {r.count} ratings
                </span>
              </p>
              <ul className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((s) => {
                  const n = r.by_star?.[String(s)] ?? 0;
                  return (
                    <li key={s} className="flex items-center gap-2 text-xs font-bold">
                      <span className="w-6">{s}★</span>
                      <span className="bg-bg block h-1.5 flex-1 overflow-hidden rounded-full">
                        <span
                          className="bg-gold block h-full rounded-full"
                          style={{ width: `${r.count ? (100 * n) / r.count : 0}%` }}
                        />
                      </span>
                      <span className="w-6 text-right tabular-nums">{n}</span>
                    </li>
                  );
                })}
              </ul>
              {tags.length > 0 && (
                <p className="flex flex-wrap gap-1.5">
                  {tags.map(([t, n]) => (
                    <Pill
                      key={t}
                      tone={
                        ['late', 'rude', 'damaged', 'hard_to_reach'].includes(t) ? 'bad' : 'good'
                      }
                    >
                      {RATING_TAG_LABEL[t] ?? t} · {n}
                    </Pill>
                  ))}
                </p>
              )}
            </div>
          )}
        </Panel>
        <Panel title="What customers said">
          {r.recent.length === 0 && r.order_ratings_about_rider.length === 0 ? (
            <p className="text-muted text-sm font-semibold">Nothing written yet.</p>
          ) : (
            <ul className="divide-border -my-3 divide-y">
              {r.recent.map((x, i) => (
                <li key={`r${i}`} className="py-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <Stars n={x.stars} />
                    <Link href={`?view=trips&trip=${x.order_id}`} className="hover:underline">
                      {x.reference}
                    </Link>
                    <span className="text-muted-light">{day(x.created_at)}</span>
                  </p>
                  {x.tags.length > 0 && (
                    <p className="text-muted mt-1 text-xs font-semibold">
                      {x.tags.map((t) => RATING_TAG_LABEL[t] ?? t).join(', ')}
                    </p>
                  )}
                  {x.comment && <p className="mt-1 text-sm font-semibold">“{x.comment}”</p>}
                </li>
              ))}
              {r.order_ratings_about_rider.map((x, i) => (
                <li key={`o${i}`} className="py-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <Stars n={x.stars} />
                    <span>{x.reference}</span>
                    <Pill>order rating, about the rider</Pill>
                    <span className="text-muted-light">{day(x.created_at)}</span>
                  </p>
                  {x.comment && <p className="mt-1 text-sm font-semibold">“{x.comment}”</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Complaints" aside="customer reports on orders they carried">
          {c.complaints.length === 0 ? (
            <p className="text-muted text-sm font-semibold">No customer has reported a problem.</p>
          ) : (
            <ul className="divide-border -my-3 divide-y">
              {c.complaints.map((t) => (
                <li key={t.reference} className="py-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span>{t.reference}</span>
                    <span className="text-muted">order {t.order_reference}</span>
                    <Pill tone={t.status === 'resolved' || t.status === 'closed' ? 'good' : 'warn'}>
                      {words(t.status)}
                    </Pill>
                    <span className="text-muted-light">{day(t.created_at)}</span>
                  </p>
                  <p className="mt-1 text-sm font-semibold">{t.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Incidents">
          {c.incidents.length === 0 ? (
            <p className="text-muted text-sm font-semibold">No incidents.</p>
          ) : (
            <ul className="divide-border -my-3 divide-y">
              {c.incidents.map((i) => (
                <li key={i.id} className="py-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <Link href={`/riders/incidents/${i.id}`} className="hover:underline">
                      {words(i.kind)}
                    </Link>
                    <Pill
                      tone={
                        i.severity === 'critical'
                          ? 'bad'
                          : i.severity === 'major'
                            ? 'warn'
                            : undefined
                      }
                    >
                      {i.severity}
                    </Pill>
                    <Pill tone={i.status === 'resolved' || i.status === 'closed' ? 'good' : 'warn'}>
                      {i.status}
                    </Pill>
                    <span className="text-muted-light">{stamp(i.happened_at)}</span>
                  </p>
                  {i.description && <p className="mt-1 text-sm font-semibold">{i.description}</p>}
                  {i.resolution && (
                    <p className="text-muted mt-1 text-xs font-semibold">
                      Resolved: {i.resolution}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Strikes" aside={`${p.stats.strike_count} in all`}>
          {c.strikes.length === 0 ? (
            <p className="text-muted text-sm font-semibold">
              No strikes. Issue one from Controls on the Overview.
            </p>
          ) : (
            <Table head={['Level', 'Reason', 'Issued', 'Expires']} min="30rem">
              {c.strikes.map((s, i) => (
                <tr key={i}>
                  <td className={td}>
                    <Pill tone={s.level >= 3 ? 'bad' : 'warn'}>level {s.level}</Pill>
                  </td>
                  <td className={td}>{s.reason}</td>
                  <td className={td}>
                    {day(s.issued_at)}
                    {s.issued_by && <span className="text-muted block text-xs">{s.issued_by}</span>}
                  </td>
                  <td className={td}>
                    {s.cleared_at ? `cleared ${day(s.cleared_at)}` : day(s.expires_at)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <Panel title="Fraud flags" action={{ href: '/finance/fraud', label: 'Review in Finance' }}>
          {c.fraud_flags.length === 0 ? (
            <p className="text-muted text-sm font-semibold">No fraud check has flagged them.</p>
          ) : (
            <ul className="divide-border -my-3 divide-y">
              {c.fraud_flags.map((f) => (
                <li key={f.id} className="py-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span>{words(f.kind)}</span>
                    <Pill
                      tone={f.severity === 'high' || f.severity === 'critical' ? 'bad' : 'warn'}
                    >
                      {f.severity}
                    </Pill>
                    <Pill>{words(f.status)}</Pill>
                    <span className="text-muted-light">{day(f.detected_at)}</span>
                  </p>
                  {f.summary && <p className="mt-1 text-sm font-semibold">{f.summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Status history">
        {c.status_history.length === 0 ? (
          <p className="text-muted text-sm font-semibold">Their status has not changed.</p>
        ) : (
          <Table head={['When', 'From', 'To', 'Reason', 'By', 'Second approver']} min="40rem">
            {c.status_history.map((h, i) => (
              <tr key={i}>
                <td className={td}>{stamp(h.at)}</td>
                <td className={td}>{words(h.from)}</td>
                <td className={td}>{words(h.to)}</td>
                <td className={td}>{h.reason ?? DASH}</td>
                <td className={td}>{h.by ?? DASH}</td>
                <td className={td}>{h.second_approver ?? DASH}</td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-4">
          <Link href="?view=application#suspend" className="text-gold-text text-xs font-bold">
            Suspend or reinstate (needs a reason and a second person) →
          </Link>
        </p>
      </Panel>

      <Panel title="Audit trail" aside="every recorded action on this rider, newest first">
        {p.audit.length === 0 ? (
          <p className="text-muted text-sm font-semibold">Nothing recorded yet.</p>
        ) : (
          <Table head={['When', 'Action', 'Who', 'Reason']} min="36rem">
            {p.audit.map((a, i) => (
              <tr key={i}>
                <td className={td}>{stamp(a.at)}</td>
                <td className={td}>
                  {a.action}
                  {a.severity === 'high' || a.severity === 'critical' ? (
                    <span className="ml-1.5">
                      <Pill tone="warn">{a.severity}</Pill>
                    </span>
                  ) : null}
                </td>
                <td className={td}>{a.actor ?? words(a.actor_type)}</td>
                <td className={td}>{a.reason ?? DASH}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── messages

export function MessagesView({ p }: { p: RiderProfile }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <Panel title="Thread with rider ops" aside="the last 60 messages">
        {p.messages.length === 0 ? (
          <p className="text-muted text-sm font-semibold">
            Nothing said yet. Riders write to ops from Messages on the rider portal.
          </p>
        ) : (
          <ol className="space-y-3">
            {p.messages.map((m) => (
              <li key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : ''}`}>
                <div
                  className={`max-w-[34rem] rounded-2xl px-4 py-2.5 ${
                    m.direction === 'out' ? 'bg-ink text-white' : 'bg-bg'
                  }`}
                >
                  {m.subject && <p className="text-sm font-extrabold">{m.subject}</p>}
                  <p className="whitespace-pre-wrap text-sm font-semibold">{m.body}</p>
                  <p
                    className={`mt-1 text-[0.625rem] font-bold uppercase ${
                      m.direction === 'out' ? 'text-white/60' : 'text-muted-light'
                    }`}
                  >
                    {m.direction === 'out' ? (m.by ?? 'ops') : 'rider'} · {m.channel} ·{' '}
                    {stamp(m.created_at)}
                    {m.direction === 'out' && m.read_at ? ' · read' : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Card className="p-5">
        <p className="mb-3 text-[0.9375rem] font-extrabold">Reply</p>
        <MessageComposer riderId={p.profile.id} />
      </Card>
    </div>
  );
}
