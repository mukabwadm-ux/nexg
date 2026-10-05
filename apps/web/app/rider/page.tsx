import Link from 'next/link';

import { DASH, Empty, Panel, Pill, Progress, Stat, clock, kesWhole, num } from '@/components/partner/bits';
import { Shift } from '@/components/partner/rider-shift';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import type { RiderHome } from './layout';

export const metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

const WHAT_NOW: Record<string, { label: string; tone: string }> = {
  to_the_merchant: { label: 'TO THE MERCHANT', tone: 'bg-gold-soft text-gold-text' },
  to_the_guest: { label: 'TO THE GUEST', tone: 'bg-info-bg text-info' },
  done: { label: 'DELIVERED', tone: 'bg-success-bg text-success' },
  closed: { label: 'CLOSED', tone: 'bg-bg text-muted-light' },
};

/**
 * Today, for a rider.
 *
 * Three facts, in the order they matter on a wet Friday: am I on,
 * what am I carrying, and how much cash is in my pocket against the
 * cap. The cap is the one that quietly ends an evening — a rider
 * who does not know they are near it just stops being offered the
 * jobs they want and never finds out why.
 */
export default async function RiderToday() {
  const me = await requireRider();
  const supabase = createClient();

  const [{ data: home }, { data: jobs, error }] = await Promise.all([
    supabase.from('rider_home_v').select('*').eq('rider_id', me.id).maybeSingle(),
    supabase
      .from('rider_jobs_v')
      .select('*')
      .eq('rider_id', me.id)
      .not('what_now', 'in', '("done","closed")')
      .order('placed_at'),
  ]);

  const r = home as RiderHome | null;
  const live = (jobs as JobRow[] | null) ?? [];

  if (!r) {
    return (
      <Empty
        title="We could not load your account."
        body="That is a fault at our end. Reload, and if it keeps happening message us."
      />
    );
  }

  const checks = Object.entries(r.readiness ?? {})
    .filter(([k]) => k !== 'pct')
    .map(([k, v]) => [k, Boolean(v)] as const);
  const capPct =
    r.cash_cap && r.cash_cap > 0
      ? Math.min(100, Math.round(((r.cash_on_hand ?? 0) / r.cash_cap) * 100))
      : null;

  return (
    <div className="space-y-5">
      <Shift
        presence={r.presence}
        status={r.status}
        canReceive={r.can_receive_offers}
        pausedReason={r.offers_paused_reason}
        cooldownUntil={r.cooldown_until}
        since={r.presence_changed_at}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Today"
          value={kesWhole(r.earned_today_kes)}
          hint={`${num(r.trips_today)} ${r.trips_today === 1 ? 'trip' : 'trips'} delivered`}
        />
        <Stat label="This week" value={kesWhole(r.earned_week_kes)} hint="Since Monday" />
        <Stat
          label="Cash on you"
          value={
            r.cash_cap === null
              ? kesWhole(r.cash_on_hand)
              : `${kesWhole(r.cash_on_hand)}`
          }
          hint={
            r.cash_cap === null
              ? 'No cap set for your city'
              : `of ${kesWhole(r.cash_cap)}${capPct !== null ? ` · ${capPct}%` : ''}`
          }
          tone={capPct !== null && capPct >= 90 ? 'danger' : capPct !== null && capPct >= 70 ? 'gold' : undefined}
        />
        <Stat
          label="Health"
          value={r.health_band ? r.health_band.charAt(0).toUpperCase() + r.health_band.slice(1) : DASH}
          hint={
            r.strike_count > 0
              ? `${r.strike_count} active ${r.strike_count === 1 ? 'strike' : 'strikes'}`
              : r.top_decile
                ? 'Top decile'
                : 'Your rating with us'
          }
          tone={
            r.health_band === 'green'
              ? 'success'
              : r.health_band === 'red'
                ? 'danger'
                : r.health_band === 'amber'
                  ? 'gold'
                  : undefined
          }
        />
      </div>

      <Panel
        title="What you are carrying"
        note={live.length > 0 ? `${live.length} on` : undefined}
        action={
          <Link
            href="/rider/jobs"
            className="text-[0.75rem] font-extrabold underline underline-offset-4"
          >
            All trips →
          </Link>
        }
      >
        {error && (
          <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.75rem] font-bold">
            Your trips could not be read: {error.message}
          </p>
        )}
        {!error && live.length === 0 ? (
          <Empty
            title="Nothing on right now."
            body={
              r.presence === 'online'
                ? 'You are online. Offers come through the rider app — this page is where the record of them lives.'
                : 'Go online and offers start coming through.'
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {live.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-extrabold">{j.reference}</p>
                  <p className="text-muted truncate text-[0.8125rem] font-semibold">
                    {j.merchant ?? DASH} → {j.dropoff ?? DASH}
                  </p>
                  <p className="text-muted-light truncate text-[0.75rem] font-semibold">
                    In at {clock(j.placed_at)}
                    {j.collect_cents !== null && (
                      <span className="text-gold-text font-bold">
                        {' '}
                        · collect {kesWhole(j.collect_cents / 100)} cash
                      </span>
                    )}
                  </p>
                </div>
                <Pill tone={WHAT_NOW[j.what_now]?.tone}>
                  {WHAT_NOW[j.what_now]?.label ?? j.what_now}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {r.readiness_pct < 100 && (
        <Panel title="Finishing signing up" note={`${r.readiness_pct}% done`}>
          <Progress pct={r.readiness_pct} label="Your application" />
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {checks.map(([key, done]) => (
              <li key={key} className="flex items-center gap-2 text-[0.8125rem] font-semibold">
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-extrabold ${
                    done ? 'bg-success text-white' : 'bg-bg text-muted-light'
                  }`}
                >
                  {done ? '✓' : ''}
                </span>
                <span className={done ? 'text-muted' : ''}>{LABEL[key] ?? key}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink
          href="/rider/earnings"
          title="Earnings"
          body={`${kesWhole(r.earned_week_kes)} this week. Every trip broken down.`}
        />
        <QuickLink
          href="/rider/documents"
          title="Documents"
          body={
            r.documents_expiring > 0
              ? `${r.documents_expiring} expiring within the month.`
              : 'Everything on file, and what we still need.'
          }
        />
        <QuickLink
          href="/rider/profile"
          title="You"
          body={`${r.areas?.length ?? 0} areas · up to ${r.bike_max_km ?? DASH} km a run.`}
        />
      </div>
    </div>
  );
}

const LABEL: Record<string, string> = {
  about_you: 'Your details and a verified number',
  your_ride: 'Your bike, plate and insurance',
  areas_hours: 'Where and when you ride',
  documents: 'Your documents',
  mpesa_payout: 'Where we pay you',
  kit_onboarding: 'Kit collected at the hub',
};

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="border-border bg-surface hover:border-ink block rounded-2xl border p-4 transition-colors"
    >
      <p className="text-[0.875rem] font-extrabold">{title} →</p>
      <p className="text-muted mt-1 text-[0.8125rem] font-semibold">{body}</p>
    </Link>
  );
}

interface JobRow {
  id: string;
  reference: string;
  merchant: string | null;
  dropoff: string | null;
  placed_at: string;
  what_now: string;
  collect_cents: number | null;
}
