import { HomeLive, type ArrivingRow, type QrActivityRow } from '@/components/host/home-live';
import { HomeSetup } from '@/components/host/home-setup';
import { HostShell, hostNav } from '@/components/host/shell';
import { requireHost } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import type { Attention, HostHome, SetupProgress } from './layout';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

/**
 * The host's first screen, in whichever of its two states
 * applies.
 *
 * The branch is on `host.status`, not on a percentage. A host is
 * live because a person at NexG verified their listing, and no
 * amount of filled-in forms substitutes for that — which is why
 * the gate is a status a host cannot set themselves.
 */
export default async function HostHomePage() {
  const me = await requireHost();
  const supabase = createClient();

  const [homeRes, progressRes, attentionRes, readinessRes] = await Promise.all([
    supabase.from('host_home_v').select('*').eq('host_id', me.id).maybeSingle(),
    supabase.from('host_setup_progress_v').select('*').eq('host_id', me.id).maybeSingle(),
    supabase.from('host_attention_v').select('*').eq('host_id', me.id).order('sort'),
    supabase
      .from('unit_readiness_v')
      .select('*')
      .eq('host_id', me.id)
      .order('created_at')
      .limit(1),
  ]);

  const home = homeRes.data as HostHome | null;
  const progress = progressRes.data as SetupProgress | null;
  const attention = (attentionRes.data as Attention[] | null) ?? [];
  const readiness = (readinessRes.data as
    | {
        unit_id: string;
        unit_name: string;
        address_done: boolean;
        handoff_done: boolean;
        contact_confirmed: boolean;
        hours_done: boolean;
        qr_placed: boolean;
        ready_count: number;
        ready_of: number;
      }[]
    | null)?.[0] ?? null;

  if (!home || !progress) {
    /* Not an error page. A host record that exists but has no
       row in these views is a data problem, and saying which is
       more use than a spinner that never resolves. */
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-extrabold tracking-tight">We cannot load your portal</h1>
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold">
          Your host account exists but we could not read its summary. This is ours to fix, not
          yours — the concierge desk has been able to see it.
        </p>
      </main>
    );
  }

  const live = home.status === 'live';

  const [todayRes, activityRes, arrivingRes] = live
    ? await Promise.all([
        supabase.from('host_today_v').select('*').eq('host_id', me.id).maybeSingle(),
        supabase.from('host_qr_activity_v').select('*').eq('host_id', me.id).limit(12),
        supabase.from('host_arriving_v').select('*').eq('host_id', me.id).limit(6),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const today = todayRes.data as {
    orders_today: number;
    value_today_cents: number;
    units_today: number;
    arriving: number;
    open_requests: number;
    units_without_qr: number;
  } | null;

  const nav = hostNav({
    live,
    unitsNeedAttention: attention.filter((a) => a.unit_id !== null).length,
    openRequests: today?.open_requests ?? 0,
    unreadMessages: 0,
    qrToPlace: today?.units_without_qr ?? 0,
    dataRequests: 0,
  });

  const subtitle = live
    ? `${home.properties} propert${home.properties === 1 ? 'y' : 'ies'} · ${home.units_total} unit${
        home.units_total === 1 ? '' : 's'
      }${home.city_name ? `  |  ${home.city_name}` : ''}`
    : `${home.properties} propert${home.properties === 1 ? 'y' : 'ies'} · ${
        home.units_setting_up
      } unit${home.units_setting_up === 1 ? '' : 's'} in setup${
        home.city_name ? `  |  ${home.city_name}` : ''
      }`;

  const chips = live
    ? [
        {
          label: `${home.units_live} unit${home.units_live === 1 ? '' : 's'} live`,
          tone: 'plain' as const,
        },
        {
          label: `${home.qr_placed} of ${home.units_total} QR cards placed`,
          tone: 'plain' as const,
        },
        { label: 'Guest operations active', tone: 'good' as const },
      ]
    : [
        {
          label: `${home.units_setting_up} unit${
            home.units_setting_up === 1 ? '' : 's'
          } in setup`,
          tone: 'plain' as const,
        },
        { label: 'QR card not generated yet', tone: 'plain' as const },
        {
          label: progress.step_verify
            ? 'Verification submitted'
            : 'Verification pending · listing code',
          tone: 'gold' as const,
        },
      ];

  const nowInNairobi = new Date().toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });

  return (
    <HostShell
      name={home.display_name}
      subtitle={subtitle}
      kicker={live ? 'Host portal · Owner' : 'Host portal · Setting up'}
      chips={chips}
      current="/host"
      nav={nav}
      headline={
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[2rem] font-extrabold leading-none tracking-tight">
                {live ? (today?.orders_today ?? 0) : `${progress.done_count} / ${progress.of_count}`}
              </p>
              <p className="mt-1 text-[0.75rem] font-semibold text-white/60">
                {live
                  ? 'Guest orders today via your QR cards'
                  : `Setup steps done · ${progress.of_count - progress.done_count} to go`}
              </p>
            </div>
            <p className="shrink-0 text-right text-[0.6875rem] font-semibold text-white/50">
              {nowInNairobi} · Nairobi
            </p>
          </div>
          <p className="mt-3 text-[0.8125rem] font-extrabold">
            {live ? 'Have a question?' : 'Stuck on a step?'}
          </p>
          <a
            href="/host/support"
            className="mt-1.5 flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-[0.8125rem] font-extrabold text-black"
          >
            Chat with NexG host ops
          </a>
        </div>
      }
    >
      {live ? (
        <HomeLive
          home={home}
          today={today}
          attention={attention}
          activity={(activityRes.data as QrActivityRow[] | null) ?? []}
          arriving={(arrivingRes.data as ArrivingRow[] | null) ?? []}
        />
      ) : (
        <HomeSetup
          home={home}
          progress={progress}
          attention={attention}
          readiness={readiness}
        />
      )}
    </HostShell>
  );
}
