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
  Lock,
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
import { SignOut } from '@/components/partner/sign-out';

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
  current,
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
  current: string;
  children: React.ReactNode;
}) {
  const initials =
    personName
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'ME';

  return (
    <div className="bg-bg min-h-dvh lg:flex">
      {/* ═══════════════════════════════════ the dark sidebar */}
      <aside className="bg-ink hidden w-[13rem] shrink-0 flex-col text-white lg:flex">
        <Link href="/merchant" className="block px-5 py-5">
          <Logo className="h-7 w-auto" onDark />
        </Link>

        <nav aria-label="Merchant dashboard" className="flex-1 px-3">
          <ul className="space-y-0.5">
            {nav.map((item) => {
              const on = item.href === current;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={on ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[0.8125rem] font-extrabold transition-colors ${
                      on ? 'bg-gold text-ink' : 'text-white/65 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <span className="shrink-0" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={`h-[1.1rem] min-w-[1.1rem] shrink-0 rounded-full px-1 text-center text-[0.625rem] font-extrabold leading-[1.1rem] ${
                          item.tone === 'danger'
                            ? 'bg-danger text-white'
                            : on
                              ? 'bg-ink text-white'
                              : 'bg-gold text-ink'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                    {item.locked ? (
                      <Lock
                        className="h-3 w-3 shrink-0 opacity-50"
                        aria-label="not yet available"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

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

            <span className="border-border flex items-center gap-2.5 border-l pl-3">
              <span className="bg-ink flex h-8 w-8 items-center justify-center rounded-full text-[0.6875rem] font-extrabold text-white">
                {initials}
              </span>
              <span className="hidden sm:block">
                <span className="block text-[0.8125rem] font-extrabold leading-tight">
                  {personName}
                </span>
                <span className="text-muted-light block text-[0.6875rem] font-semibold leading-tight">
                  {role} · {businessName}
                  {live ? '' : ' · setup'}
                </span>
              </span>
              <SignOut />
            </span>
          </div>
        </header>

        {/* On a phone the sidebar becomes a scrolling strip at the
            foot — a merchant on a counter phone navigates with a
            thumb, not a hamburger. */}
        <nav
          aria-label="Merchant dashboard"
          className="border-border bg-surface fixed bottom-0 left-0 right-0 z-30 flex gap-1 overflow-x-auto border-t px-2 py-2 lg:hidden"
        >
          {nav.slice(0, 7).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[0.5625rem] font-extrabold ${
                item.href === current ? 'bg-gold text-ink' : 'text-muted'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="whitespace-nowrap">{item.label}</span>
              {item.badge ? (
                <span className="bg-danger absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full" />
              ) : null}
            </Link>
          ))}
        </nav>

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
