import * as React from 'react';

import type { Attention, HostHome, SetupProgress } from '@/app/host/layout';
import { requireHost } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import { LockedSection, PreviewBadge } from './bits';
import { HostShell, hostNav, type HostNavItem } from './shell';

/**
 * Every host page except Home.
 *
 * The shell needs the same six facts on every page — who the
 * host is, how many units, whether they are live, what needs
 * attention. Fetching that in each page meant writing the same
 * forty lines eighteen times, and eighteen copies of a query is
 * eighteen chances for one of them to filter differently.
 */
interface HostContext {
  me: Awaited<ReturnType<typeof requireHost>>;
  supabase: ReturnType<typeof createClient>;
  home: HostHome | null;
  progress: SetupProgress | null;
  attention: Attention[];
  live: boolean;
  nav: HostNavItem[];
}

/* Annotated rather than inferred: the Supabase client's type is
   large enough that TypeScript refuses to serialise the inferred
   shape, and the error points at this function rather than at
   the client, which is a confusing place to start looking. */
export async function hostContext(): Promise<HostContext> {
  const me = await requireHost();
  const supabase = createClient();

  const [homeRes, progressRes, attentionRes, todayRes] = await Promise.all([
    supabase.from('host_home_v').select('*').eq('host_id', me.id).maybeSingle(),
    supabase.from('host_setup_progress_v').select('*').eq('host_id', me.id).maybeSingle(),
    supabase.from('host_attention_v').select('*').eq('host_id', me.id).order('sort'),
    supabase.from('host_today_v').select('*').eq('host_id', me.id).maybeSingle(),
  ]);

  const home = homeRes.data as HostHome | null;
  const progress = progressRes.data as SetupProgress | null;
  const attention = (attentionRes.data as Attention[] | null) ?? [];
  const today = todayRes.data as { open_requests: number; units_without_qr: number } | null;
  const live = home?.status === 'live';

  return {
    me,
    supabase,
    home,
    progress,
    attention,
    live,
    nav: hostNav({
      live,
      unitsNeedAttention: attention.filter((a) => a.unit_id !== null).length,
      openRequests: today?.open_requests ?? 0,
      unreadMessages: 0,
      qrToPlace: today?.units_without_qr ?? 0,
      dataRequests: 0,
    }),
  };
}

/**
 * The frame for a section page.
 *
 * The hero carries one headline figure chosen by the page,
 * rather than repeating the home page's. A section that cannot
 * say anything useful in that slot says what the section is
 * for, which is still better than a zero.
 */
export function HostSection({
  home,
  live,
  nav,
  current,
  title,
  lead,
  headlineValue,
  headlineNote,
  children,
}: {
  home: HostHome;
  live: boolean;
  nav: HostNavItem[];
  current: string;
  title: string;
  lead: string;
  headlineValue: string;
  headlineNote: string;
  children: React.ReactNode;
}) {
  const subtitle = `${home.properties} propert${home.properties === 1 ? 'y' : 'ies'} · ${
    home.units_total
  } unit${home.units_total === 1 ? '' : 's'}${home.city_name ? `  |  ${home.city_name}` : ''}`;

  return (
    <HostShell
      name={home.display_name}
      subtitle={subtitle}
      kicker={live ? 'Host portal · Owner' : 'Host portal · Setting up'}
      chips={[
        { label: `${home.units_live} live`, tone: 'plain' },
        { label: `${home.units_setting_up} in setup`, tone: 'plain' },
      ]}
      nav={nav}
      current={current}
      headline={
        <div>
          <p className="text-[2rem] font-extrabold leading-none tracking-tight">{headlineValue}</p>
          <p className="mt-1 text-[0.75rem] font-semibold text-white/60">{headlineNote}</p>
          <a
            href="/host/support"
            className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-[0.8125rem] font-extrabold text-black"
          >
            Chat with NexG host ops
          </a>
        </div>
      }
    >
      <div className="max-w-5xl space-y-5">
        <div>
          <h1 className="font-serif text-[1.875rem] font-extrabold leading-tight tracking-tight">
            {title}
          </h1>
          <p className="text-muted mt-2 max-w-2xl text-[0.9375rem] font-semibold leading-[1.7]">
            {lead}
          </p>
        </div>
        {children}
      </div>
    </HostShell>
  );
}

/**
 * A section that is designed and not built.
 *
 * It says so, says what will be in it, and shows the sample —
 * rather than 404ing, or worse, rendering an empty table that
 * reads as "you have none of these".
 *
 * Listing these honestly is deliberate. A portal that quietly
 * omits half its navigation looks finished and is not; one that
 * links to dead ends is worse. This is the third option.
 */
export function NotBuiltYet({
  what,
  willHold,
  instead,
}: {
  what: string;
  willHold: string;
  instead?: React.ReactNode;
}) {
  return (
    <LockedSection
      title={`${what} is designed, not built yet`}
      why={willHold}
      unlocks="It is listed in the navigation rather than hidden so you can see what the portal will hold. Nothing here is a dead end on purpose."
    >
      <div className="border-border bg-surface rounded-xl border p-4">
        <div className="mb-3 flex items-center gap-2">
          <PreviewBadge />
        </div>
        {instead ?? (
          <p className="text-muted-light text-[0.8125rem] font-semibold">
            Until it is built, the concierge desk handles this for you — reach them from Get Help
            at the top of any page.
          </p>
        )}
      </div>
    </LockedSection>
  );
}
