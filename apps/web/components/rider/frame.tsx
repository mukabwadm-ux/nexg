import * as React from 'react';

import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import { riderNav, type RiderNavItem } from './shell';
import type { RiderHome } from './types';

/**
 * What every rider page needs before it draws anything.
 *
 * One fetch of `rider_home_v` rather than one per page, so the
 * cash figure in the sidebar badge and the cash figure on the
 * Cash page cannot come from two reads a second apart and
 * disagree.
 */
interface RiderContext {
  me: Awaited<ReturnType<typeof requireRider>>;
  supabase: ReturnType<typeof createClient>;
  h: RiderHome | null;
  active: boolean;
  nav: RiderNavItem[];
}

export async function riderContext(): Promise<RiderContext> {
  const me = await requireRider();
  const supabase = createClient();

  const { data } = await supabase
    .from('rider_home_v')
    .select('*')
    .eq('rider_id', me.id)
    .maybeSingle();

  const h = data as RiderHome | null;
  const active = h?.status === 'active';
  const documentsToDo =
    (h?.documents_missing ?? 0) + (h?.documents_to_fix ?? 0) + (h?.documents_asked_for ?? 0);
  const cashDue =
    (h?.cash_cap ?? 0) > 0 && (h?.cash_on_hand ?? 0) >= (h?.cash_cap ?? 0) * 0.8;

  return {
    me,
    supabase,
    h,
    active,
    nav: riderNav({
      active,
      openJobs: h?.trip_open ? 1 : 0,
      unreadMessages: h?.unread_messages ?? 0,
      documentsToDo,
      cashDue,
    }),
  };
}

/**
 * The heading every rider board but the dashboard carries.
 *
 * It was `RiderPage`, and it wrapped its children in the whole
 * `RiderShell` plus `max-w-5xl`: a page had to render the shell
 * to get a heading, so the five boards that skipped it lost the
 * sidebar too, and the ones that used it were capped at 1024px
 * inside a full-width frame. The shell is in the layout now.
 */
export function RiderPageHead({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif text-[1.875rem] font-extrabold leading-tight tracking-tight">
          {title}
        </h1>
        {lead ? (
          <p className="text-muted mt-2 max-w-3xl text-[0.9375rem] font-semibold leading-[1.7]">
            {lead}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** The padding a rider board sits in. Full width, with a gutter. */
export function RiderBoard({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">{children}</div>;
}

/**
 * A section that is designed and not built.
 *
 * Listed rather than hidden. A rider who cannot find Cash
 * assumes the money is gone; one who finds it and reads what it
 * will hold does not.
 */
export function NotBuiltYet({ what, willHold }: { what: string; willHold: string }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-5">
      <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
        {what} is designed, not built yet
      </h2>
      <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">{willHold}</p>
      <p className="text-muted-light mt-3 text-[0.75rem] font-semibold leading-[1.7]">
        Until it is, rider ops handles this — the help icon in the top bar reaches them. Nothing
        you have already done is affected, and SOS works from every screen regardless.
      </p>
    </div>
  );
}
