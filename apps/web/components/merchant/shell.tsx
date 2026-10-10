import {
  BarChart3,
  Bell,
  Building2,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  LayoutDashboard,
  ListOrdered,
  MessageSquare,
  Settings,
  Star,
  TriangleAlert,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Logo } from '@/components/logo';

import { AccountMenu } from './account-menu';
import { MerchantPhoneNav, MerchantSideNav } from './nav-links';

/**
 * The merchant dashboard frame.
 *
 * Drawn on the dark-sidebar template, which is a different
 * shape from the host portal's light hero and deliberately so.
 * A host manages a portfolio and reads their screen sitting
 * down; a merchant works a queue on a counter phone between
 * orders, and the standing navigation with its counts is how
 * they see at a glance that three things need accepting without
 * reading anything.
 *
 * The prompt asks for one `packages/partner-portal/shell`
 * parameterised by skin. That remains the right end state. This
 * is the merchant skin built where the merchant pages already
 * live, so the rebuild does not also have to be a refactor of
 * the two portals that are currently working.
 */

export interface MerchantNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** A number worth interrupting somebody for. Zero is not one. */
  badge?: number | null;
  tone?: 'danger' | 'plain';
  /** Nothing real can be in here until they are live. */
  locked?: boolean;
}

export function merchantNav({
  live,
  ordersOpen,
  unreadMessages,
  documentsToDo,
  openDisputes,
}: {
  live: boolean;
  ordersOpen: number;
  unreadMessages: number;
  documentsToDo: number;
  openDisputes: number;
}): MerchantNavItem[] {
  const i = (n: React.ReactNode) => n;
  return [
    { href: '/merchant', label: 'Dashboard', icon: i(<LayoutDashboard className="h-4 w-4" />) },
    {
      href: '/merchant/orders',
      label: 'Orders',
      icon: i(<ListOrdered className="h-4 w-4" />),
      locked: !live,
      badge: live && ordersOpen > 0 ? ordersOpen : null,
    },
    { href: '/merchant/menu', label: 'Catalogue', icon: i(<UtensilsCrossed className="h-4 w-4" />) },
    { href: '/merchant/hours', label: 'Hours', icon: i(<Clock className="h-4 w-4" />) },
    { href: '/merchant/stores', label: 'Branches', icon: i(<Building2 className="h-4 w-4" />) },
    { href: '/merchant/money', label: 'Money', icon: i(<CreditCard className="h-4 w-4" />) },
    { href: '/merchant/analytics', label: 'Analytics', icon: i(<BarChart3 className="h-4 w-4" />) },
    {
      href: '/merchant/featured',
      label: 'Featured',
      icon: i(<Star className="h-4 w-4" />),
      locked: !live,
    },
    {
      href: '/merchant/messages',
      label: 'Messages',
      icon: i(<MessageSquare className="h-4 w-4" />),
      badge: unreadMessages > 0 ? unreadMessages : null,
    },
    {
      href: '/merchant/disputes',
      label: 'Disputes',
      icon: i(<TriangleAlert className="h-4 w-4" />),
      locked: !live,
      badge: live && openDisputes > 0 ? openDisputes : null,
    },
    { href: '/merchant/reviews', label: 'Reviews', icon: i(<Star className="h-4 w-4" />) },
    { href: '/merchant/team', label: 'Team', icon: i(<Users className="h-4 w-4" />) },
    {
      href: '/merchant/documents',
      label: 'Documents',
      icon: i(<FileText className="h-4 w-4" />),
      badge: documentsToDo > 0 ? documentsToDo : null,
      tone: 'danger',
    },
    { href: '/merchant/settings', label: 'Settings', icon: i(<Settings className="h-4 w-4" />) },
    { href: '/merchant/support', label: 'Support', icon: i(<HelpCircle className="h-4 w-4" />) },
  ];
}

export function MerchantShell({
  businessName,
  personName,
  role,
  live,
  stateControl,
  branchName,
  unreadCount,
  nav,
  children,
}: {
  businessName: string;
  personName: string;
  role: string;
  live: boolean;
  stateControl: React.ReactNode;
  branchName: string | null;
  unreadCount: number;
  nav: MerchantNavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg min-h-dvh lg:flex">
      {/* ═══════════════════════════════════ the dark sidebar */}
      <aside className="bg-ink hidden w-[13rem] shrink-0 flex-col text-white lg:flex">
        <Link href="/merchant" className="block px-5 py-5">
          <Logo className="h-7 w-auto" onDark />
        </Link>

        <MerchantSideNav nav={nav} />

        {/* The promo block at the foot of the sidebar. */}
        <div className="m-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-transparent p-4">
          <div className="from-gold/25 mb-3 flex h-20 items-end rounded-lg bg-gradient-to-br to-transparent p-2">
            <span className="text-[0.5rem] font-extrabold uppercase tracking-[0.1em] text-white/40">
              Photo · your dish
            </span>
          </div>
          <p className="text-[0.9375rem] font-extrabold leading-tight">
            More orders.
            <br />
            Front of Explore.
          </p>
          <p className="mt-1.5 text-[0.6875rem] font-semibold leading-[1.6] text-white/50">
            Featured slots put your business at the top of Explore in your zone for a week.
          </p>
          <Link
            href="/merchant/featured"
            className="bg-gold text-ink mt-3 block rounded-lg px-3 py-2 text-center text-[0.75rem] font-extrabold"
          >
            See featured slots →
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* ═══════════════════════════════════════ the top bar */}
        <header className="border-border bg-surface sticky top-0 z-30 border-b">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <Link href="/merchant" className="lg:hidden">
              <Logo className="h-6 w-auto" />
            </Link>

            {branchName ? (
              <span className="border-border-strong bg-surface hidden items-center gap-2 rounded-lg border px-3.5 py-2 text-[0.8125rem] font-extrabold sm:flex">
                {branchName}
              </span>
            ) : null}

            {stateControl}

            <span className="flex-1" />

            <Link
              href="/merchant/messages"
              className="text-muted hover:text-ink relative p-2"
              aria-label={
                unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages, nothing new'
              }
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadCount > 0 ? (
                <span className="bg-danger ring-surface absolute right-0.5 top-0.5 flex h-[1rem] min-w-[1rem] items-center justify-center rounded-full px-1 text-[0.5625rem] font-extrabold text-white ring-2">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </Link>
            <Link
              href="/merchant/support"
              className="text-muted hover:text-ink p-2"
              aria-label="Help"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </Link>

            <AccountMenu
              personName={personName}
              role={role}
              businessName={businessName}
              live={live}
            />
          </div>
        </header>

        {/* On a phone the sidebar becomes a scrolling strip at the
            foot — a merchant on a counter phone navigates with a
            thumb, not a hamburger. */}
        <MerchantPhoneNav nav={nav} />

        <main className="pb-24 lg:pb-0">{children}</main>
      </div>
    </div>
  );
}

/**
 * Open / Busy / Paused.
 *
 * Three states rather than a toggle, because "busy" is the one
 * a kitchen actually needs: it keeps you taking orders and adds
 * minutes to the estimate, which is the honest version of what
 * a merchant would otherwise do by accepting and running late.
 *
 * Read-only here. Changing it writes to `merchant.accepting_orders`
 * and `busy_mode_until`, which guests see immediately, and that
 * goes through the existing RPC rather than a new write path
 * added alongside the rebuild.
 */
export function StateControl({
  live,
  accepting,
  busyUntil,
}: {
  live: boolean;
  accepting: boolean;
  busyUntil: string | null;
}) {
  if (!live) {
    return (
      <span className="border-gold/40 bg-gold-soft text-gold-text flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[0.8125rem] font-extrabold">
        <span className="bg-gold h-1.5 w-1.5 rounded-full" aria-hidden="true" />
        Not live yet
      </span>
    );
  }

  const busy = busyUntil !== null && new Date(busyUntil) > new Date();
  const state = !accepting ? 'paused' : busy ? 'busy' : 'open';

  return (
    <span className="border-border-strong bg-bg flex items-center rounded-lg border p-0.5">
      {(['open', 'busy', 'paused'] as const).map((s) => (
        <span
          key={s}
          aria-current={state === s ? 'true' : undefined}
          className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold capitalize ${
            state === s
              ? s === 'open'
                ? 'bg-success text-white'
                : s === 'busy'
                  ? 'bg-warn text-white'
                  : 'bg-muted text-white'
              : 'text-muted'
          }`}
        >
          {state === s && s === 'open' ? (
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white align-middle" />
          ) : null}
          {s}
        </span>
      ))}
    </span>
  );
}
