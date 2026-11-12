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

export async function merchantContext(
  options: { setup?: boolean; draft?: boolean } = {},
): Promise<MerchantContext> {
  const me = await requireMerchant({
    access: options.draft ? 'setup' : options.setup ? 'shell' : 'operations',
  });
  const supabase = createClient();

  const shellOnly =
    !me.access.operations || ((options.setup || options.draft) && me.access.state !== 'legacy');
  if (shellOnly) {
    // This is a safe shell summary, not an operational view with hidden data.
    const { data, error } = await supabase
      .from('merchant')
      .select('id,trading_name,status,contact_name')
      .eq('id', me.id)
      .maybeSingle();
    if (error) throw new Error('Your business setup could not be loaded. Please retry.');
    /*
     * A new-form merchant that staff have taken live (Admin › Merchants ›
     * record › Take live) gets the same operational context as a live
     * legacy merchant, so its home is the dashboard rather than the setup
     * checklist. Draft editors keep the shell, and so does anyone whose
     * operational summary cannot be read.
     */
    if (me.access.operations && !options.draft && data?.status === 'live') {
      const operational = await operationalContext(me, supabase);
      if (operational.m) return operational;
    }
    const m = data
      ? ({
          merchant_id: data.id,
          name: data.trading_name,
          status: data.status,
          contact_name: data.contact_name,
          city: '',
          accepting_orders: false,
          busy_mode_until: null,
          readiness_pct: 0,
          readiness: {},
          stores: 0,
          items_available: 0,
          unread_messages: 0,
          documents_missing: 0,
          documents_to_fix: 0,
          documents_expiring: 0,
          documents_asked_for: 0,
          orders_today: 0,
          orders_open: 0,
          earned_today_cents: 0,
          terms_to_accept: false,
          featured_state: null,
          health_band: null,
          health_score: null,
          prep_minutes: null,
          pay_on_delivery: false,
          pay_on_delivery_cap_kes: null,
          contact_phone: null,
          contact_email: null,
          payout_rail: null,
          went_live_at: null,
          status_reason: null,
        } satisfies MerchantHome)
      : null;
    const safeDestinations = new Set([
      '/merchant',
      '/merchant/support',
      '/merchant/stores',
      '/merchant/hours',
      '/merchant/documents',
      '/merchant/menu',
    ]);
    return {
      me,
      supabase,
      m,
      live: false,
      nav: merchantNav({
        live: false,
        ordersOpen: 0,
        unreadMessages: 0,
        documentsToDo: 0,
        openDisputes: 0,
      }).map((item) => ({ ...item, locked: !safeDestinations.has(item.href), badge: null })),
    };
  }

  return operationalContext(me, supabase);
}

async function operationalContext(
  me: MerchantContext['me'],
  supabase: MerchantContext['supabase'],
): Promise<MerchantContext> {
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
        <h1 className="font-sans text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
        {lead ? <p className="text-muted mt-2 max-w-3xl text-sm leading-relaxed">{lead}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * The padding a board sits in. Full width, with a gutter.
 */
export function Board({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-7">{children}</div>;
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
        Until it is, merchant ops handles this — the help icon in the top bar reaches them with this
        page attached. Nothing you have entered elsewhere is affected.
      </p>
    </div>
  );
}

/** The person, falling back to the business when we have no name. */
export function firstName(contact: string | null | undefined, business: string): string {
  const n = (contact ?? '').trim().split(' ')[0];
  return n || business.split(' ')[0] || 'there';
}
