import * as React from 'react';

import type { MerchantHome } from '@/app/merchant/layout';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import { merchantNav, type MerchantNavItem } from './shell';

/**
 * What every merchant page needs before it can draw anything.
 *
 * The shell wants the same six facts on each one — who is
 * signed in, whether they are live, what the counts are. Nine
 * pages fetching that separately is nine chances for one of
 * them to filter differently and show a count that disagrees
 * with the page beside it.
 */
interface MerchantContext {
  me: Awaited<ReturnType<typeof requireMerchant>>;
  supabase: ReturnType<typeof createClient>;
  m: MerchantHome | null;
  live: boolean;
  nav: MerchantNavItem[];
}

export async function merchantContext(): Promise<MerchantContext> {
  const me = await requireMerchant();
  const supabase = createClient();

  const { data } = await supabase
    .from('merchant_home_v')
    .select('*')
    .eq('merchant_id', me.id)
    .maybeSingle();

  const m = data as MerchantHome | null;
  const live = m?.status === 'live';
  const documentsToDo =
    (m?.documents_missing ?? 0) + (m?.documents_to_fix ?? 0) + (m?.documents_asked_for ?? 0);

  return {
    me,
    supabase,
    m,
    live,
    nav: merchantNav({
      live,
      ordersOpen: m?.orders_open ?? 0,
      unreadMessages: m?.unread_messages ?? 0,
      documentsToDo,
      openDisputes: 0,
    }),
  };
}

/**
 * The heading every board but the dashboard carries.
 *
 * It was `MerchantPage`, and it wrapped its children in the
 * whole `MerchantShell` plus `max-w-5xl`. Two problems in one
 * component: a page had to render the shell to get a heading,
 * so the boards that skipped the heading lost the sidebar too —
 * and the ones that did use it were capped at 1024px inside a
 * full-width frame, which is the dead space on the right of
 * every screenshot. The artboards run edge to edge.
 *
 * The shell is in the layout now. This is a heading.
 */
export function PageHead({
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

/**
 * The padding a board sits in. Full width, with a gutter.
 */
export function Board({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">{children}</div>;
}

/**
 * A section that is designed and not built.
 *
 * Listed in the navigation rather than hidden, because a
 * dashboard that quietly omits half its sections looks finished
 * and is not. Linking to a 404 is worse. This is the third
 * option: say what it will hold and where the work happens
 * meanwhile.
 */
export function NotBuiltYet({ what, willHold }: { what: string; willHold: string }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-5">
      <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
        {what} is designed, not built yet
      </h2>
      <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">{willHold}</p>
      <p className="text-muted-light mt-3 text-[0.75rem] font-semibold leading-[1.7]">
        Until it is, merchant ops handles this — the help icon in the top bar reaches them with
        this page attached. Nothing you have entered elsewhere is affected.
      </p>
    </div>
  );
}

/** The person, falling back to the business when we have no name. */
export function firstName(contact: string | null | undefined, business: string): string {
  const n = (contact ?? '').trim().split(' ')[0];
  return n || business.split(' ')[0] || 'there';
}
