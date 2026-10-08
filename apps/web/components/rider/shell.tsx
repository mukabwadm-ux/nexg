import {
  Bell,
  Bike,
  Calendar,
  FileText,
  Heart,
  HelpCircle,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Settings,
  TriangleAlert,
  UserPlus,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Logo } from '@/components/logo';
import { SignOut } from '@/components/partner/sign-out';

/**
 * The rider dashboard frame.
 *
 * Dark sidebar, as drawn. This is the web and tablet surface —
 * a rider at home checking Friday's statement, or a hub tablet.
 * The phone app shares these views and not this layout: a
 * one-handed screen in sunlight on a boda is a different
 * problem, and pretending one layout serves both is how you get
 * a dashboard nobody can use while moving.
 *
 * One thing is non-negotiable in every state, including an
 * applicant who cannot take a job yet: SOS is on screen. A
 * rider in trouble does not first become activated.
 */

export interface RiderNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | null;
  tone?: 'danger' | 'plain';
  /** Nothing real can be in here until they are active. */
  locked?: boolean;
}

export function riderNav({
  active,
  openJobs,
  unreadMessages,
  documentsToDo,
  cashDue,
}: {
  active: boolean;
  openJobs: number;
  unreadMessages: number;
  documentsToDo: number;
  cashDue: boolean;
}): RiderNavItem[] {
  const i = (n: React.ReactNode) => n;
  return [
    { href: '/rider', label: 'Dashboard', icon: i(<LayoutDashboard className="h-4 w-4" />) },
    {
      href: '/rider/jobs',
      label: 'Jobs',
      icon: i(<Bike className="h-4 w-4" />),
      locked: !active,
      badge: active && openJobs > 0 ? openJobs : null,
    },
    { href: '/rider/earnings', label: 'Earnings', icon: i(<Wallet className="h-4 w-4" />) },
    {
      href: '/rider/cash',
      label: 'Cash',
      icon: i(<Wallet className="h-4 w-4" />),
      locked: !active,
      badge: active && cashDue ? 1 : null,
      tone: 'danger',
    },
    {
      href: '/rider/shifts',
      label: 'Shifts',
      icon: i(<Calendar className="h-4 w-4" />),
      locked: !active,
    },
    {
      href: '/rider/messages',
      label: 'Messages',
      icon: i(<MessageSquare className="h-4 w-4" />),
      badge: unreadMessages > 0 ? unreadMessages : null,
    },
    { href: '/rider/health', label: 'Health', icon: i(<Heart className="h-4 w-4" />) },
    {
      href: '/rider/documents',
      label: 'Documents',
      icon: i(<FileText className="h-4 w-4" />),
      badge: documentsToDo > 0 ? documentsToDo : null,
      tone: 'danger',
    },
    { href: '/rider/incidents', label: 'Incidents', icon: i(<TriangleAlert className="h-4 w-4" />) },
    { href: '/rider/refer', label: 'Refer a rider', icon: i(<UserPlus className="h-4 w-4" />) },
    { href: '/rider/profile', label: 'Account', icon: i(<Settings className="h-4 w-4" />) },
    { href: '/rider/support', label: 'Support', icon: i(<HelpCircle className="h-4 w-4" />) },
  ];
}

export function RiderShell({
  personName,
  riderCode,
  vehicle,
  active,
  zoneLine,
  presenceControl,
  unreadCount,
  nav,
  current,
  children,
}: {
  personName: string;
  riderCode: string;
  vehicle: string | null;
  active: boolean;
  zoneLine: string;
  presenceControl: React.ReactNode;
  unreadCount: number;
  nav: RiderNavItem[];
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
      .toUpperCase() || 'RD';

  return (
    <div className="bg-bg min-h-dvh lg:flex">
      {/* ═══════════════════════════════════ the dark sidebar */}
      <aside className="bg-ink hidden w-[13rem] shrink-0 flex-col text-white lg:flex">
        <Link href="/rider" className="block px-5 py-5">
          <Logo className="h-7 w-auto" onDark />
          <span className="text-gold/80 mt-0.5 block text-[0.5625rem] font-extrabold uppercase tracking-[0.2em]">
            Rider
          </span>
        </Link>

        <nav aria-label="Rider dashboard" className="flex-1 px-3">
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
                      <Lock className="h-3 w-3 shrink-0 opacity-50" aria-label="not yet available" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="m-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-transparent p-4">
          <div className="from-gold/25 mb-3 flex h-20 items-end rounded-lg bg-gradient-to-br to-transparent p-2">
            <span className="text-[0.5rem] font-extrabold uppercase tracking-[0.1em] text-white/40">
              Photo · rider with kit
            </span>
          </div>
          <p className="text-[0.9375rem] font-extrabold leading-tight">
            Your first week, explained.
          </p>
          <p className="mt-1.5 text-[0.6875rem] font-semibold leading-[1.6] text-white/50">
            What offers look like, how pay lines work, cash rules and hand-offs. Ten minutes, in
            English or Kiswahili.
          </p>
          <Link
            href="/rider/support"
            className="bg-gold text-ink mt-3 block rounded-lg px-3 py-2 text-center text-[0.75rem] font-extrabold"
          >
            Read the handbook →
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* ═══════════════════════════════════════ the top bar */}
        <header className="border-border bg-surface sticky top-0 z-30 border-b">
          <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 sm:px-5">
            <Link href="/rider" className="lg:hidden">
              <Logo className="h-6 w-auto" />
            </Link>

            <span className="border-border-strong bg-surface hidden items-center gap-2 rounded-lg border px-3.5 py-2 text-[0.8125rem] font-extrabold sm:flex">
              {zoneLine}
            </span>

            {presenceControl}

            {/*
             * Never hidden, never disabled, in any state. A rider
             * who has been knocked off their bike has not first
             * completed step 4.
             */}
            <Link
              href="/rider/incidents"
              className="bg-danger flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.8125rem] font-extrabold text-white"
            >
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              SOS
            </Link>

            <span className="flex-1" />

            <Link
              href="/rider/messages"
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
            <Link href="/rider/support" className="text-muted hover:text-ink p-2" aria-label="Help">
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
                  {active ? 'Rider' : 'Applicant'} · {riderCode}
                  {vehicle ? ` · ${vehicle}` : ''}
                </span>
              </span>
              <SignOut />
            </span>
          </div>
        </header>

        <nav
          aria-label="Rider dashboard"
          className="border-border bg-surface fixed bottom-0 left-0 right-0 z-30 flex gap-1 overflow-x-auto border-t px-2 py-2 lg:hidden"
        >
          {nav.slice(0, 6).map((item) => (
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
 * Online / Offline.
 *
 * Read-only here. Going online needs an active status, a bound
 * device with location permission, no cooldown and unexpired
 * documents — four conditions the dashboard can display but
 * should not be the thing that checks, because the one that
 * matters is the server's answer at the moment an offer is
 * routed.
 */
export function PresenceControl({
  active,
  online,
  reason,
}: {
  active: boolean;
  online: boolean;
  reason: string | null;
}) {
  if (!active) {
    return (
      <span className="border-gold/40 bg-gold-soft text-gold-text flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[0.8125rem] font-extrabold">
        <span className="bg-gold h-1.5 w-1.5 rounded-full" aria-hidden="true" />
        Not active yet
      </span>
    );
  }

  return (
    <span
      className="border-border-strong bg-bg flex items-center rounded-lg border p-0.5"
      title={reason ?? undefined}
    >
      {(['online', 'offline'] as const).map((s) => {
        const on = (s === 'online') === online;
        return (
          <span
            key={s}
            aria-current={on ? 'true' : undefined}
            className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold capitalize ${
              on ? (s === 'online' ? 'bg-success text-white' : 'bg-muted text-white') : 'text-muted'
            }`}
          >
            {on && s === 'online' ? (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white align-middle" />
            ) : null}
            {s}
          </span>
        );
      })}
    </span>
  );
}
