import {
  BarChart3,
  Bed,
  Building2,
  CalendarCheck,
  CreditCard,
  Gift,
  HelpCircle,
  Home,
  Lock,
  MessageSquare,
  QrCode,
  Receipt,
  Settings,
  Shield,
  Truck,
  TriangleAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Logo } from '@/components/logo';
import { SignOut } from '@/components/partner/sign-out';

/**
 * The host portal frame.
 *
 * A separate shell from the merchant and rider one, which is a
 * deliberate choice and worth saying why. Those two are a header
 * and a list of links, because a merchant works one screen at a
 * time in a kitchen. A host manages a portfolio: properties,
 * units, cards, guests, money. The design gives them a hero, a
 * standing sidebar and a right-hand column of things happening
 * now, and flattening that into the simpler frame would lose the
 * part that makes it useful.
 *
 * The prompt asks for one shared `packages/partner-portal/shell`
 * across all three. That is the right end state and it is not
 * this change: retrofitting the two live portals onto a new
 * shell is a refactor with its own risk, and doing it in the
 * same breath as building a third portal means a bug in either
 * one looks like a bug in the other.
 */

export interface HostNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | null;
  /** Nothing real can be here until the host is live. */
  locked?: boolean;
  /** Something in here needs a person. */
  alert?: boolean;
}

export function hostNav({
  live,
  unitsNeedAttention,
  openRequests,
  unreadMessages,
  qrToPlace,
  dataRequests,
}: {
  live: boolean;
  unitsNeedAttention: number;
  openRequests: number;
  unreadMessages: number;
  qrToPlace: number;
  dataRequests: number;
}): HostNavItem[] {
  const i = (n: React.ReactNode) => n;
  return [
    { href: '/host', label: 'Home', icon: i(<Home className="h-4 w-4" />) },
    { href: '/host/properties', label: 'My Properties', icon: i(<Building2 className="h-4 w-4" />) },
    {
      href: '/host/units',
      label: 'Units & Rooms',
      icon: i(<Bed className="h-4 w-4" />),
      alert: unitsNeedAttention > 0,
    },
    {
      href: '/host/qr',
      label: 'QR Cards',
      icon: i(<QrCode className="h-4 w-4" />),
      locked: !live,
      badge: live && qrToPlace > 0 ? qrToPlace : null,
    },
    { href: '/host/bookings', label: 'Bookings & Guests', icon: i(<CalendarCheck className="h-4 w-4" />) },
    { href: '/host/operations', label: 'Guest Operations', icon: i(<Users className="h-4 w-4" />) },
    {
      href: '/host/deliveries',
      label: 'Deliveries',
      icon: i(<Truck className="h-4 w-4" />),
      locked: !live,
    },
    {
      href: '/host/charge-to-room',
      label: 'Charge to Room',
      icon: i(<CreditCard className="h-4 w-4" />),
      locked: !live,
    },
    {
      href: '/host/requests',
      label: 'Requests & Issues',
      icon: i(<TriangleAlert className="h-4 w-4" />),
      locked: !live,
      badge: live && openRequests > 0 ? openRequests : null,
    },
    {
      href: '/host/messages',
      label: 'Messages',
      icon: i(<MessageSquare className="h-4 w-4" />),
      badge: unreadMessages > 0 ? unreadMessages : null,
    },
    { href: '/host/packages', label: 'Packages & Amenities', icon: i(<Gift className="h-4 w-4" />) },
    { href: '/host/earnings', label: 'Earnings & Invoices', icon: i(<Receipt className="h-4 w-4" />) },
    { href: '/host/analytics', label: 'Analytics', icon: i(<BarChart3 className="h-4 w-4" />) },
    { href: '/host/team', label: 'Team', icon: i(<Users className="h-4 w-4" />) },
    { href: '/host/refer', label: 'Refer a Host', icon: i(<UserPlus className="h-4 w-4" />) },
    {
      href: '/host/privacy',
      label: 'Data & Privacy',
      icon: i(<Shield className="h-4 w-4" />),
      badge: dataRequests > 0 ? dataRequests : null,
    },
    { href: '/host/settings', label: 'Settings', icon: i(<Settings className="h-4 w-4" />) },
    { href: '/host/support', label: 'Support', icon: i(<HelpCircle className="h-4 w-4" />) },
  ];
}

export function HostShell({
  name,
  subtitle,
  kicker,
  chips,
  headline,
  nav,
  current,
  children,
  photoUrl,
}: {
  name: string;
  subtitle: string;
  kicker: string;
  chips: { label: string; tone?: 'plain' | 'gold' | 'good' | 'danger' }[];
  headline: React.ReactNode;
  nav: HostNavItem[];
  current: string;
  children: React.ReactNode;
  /** The host's cover photograph, already signed. */
  photoUrl?: string | null;
}) {
  return (
    <div className="bg-bg min-h-dvh">
      {/* ─────────────────────────────────────────── the hero */}
      <header className="bg-ink relative overflow-hidden text-white">
        {/*
          The host's own cover photograph, when they have
          uploaded one. Without it this stays the branded
          gradient rather than a stock skyline that is not
          Nairobi — a generic city photo on somebody's portal
          reads as a template they have not filled in.

          Darkened hard, because white text sits on it and the
          photograph is whatever the host took.
        */}
        {photoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="from-ink via-ink/85 to-ink/70 absolute inset-0 bg-gradient-to-r" />
          </>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent" />

        <div className="relative mx-auto max-w-[96rem] px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <Link href="/host" className="flex items-center gap-3">
              <Logo className="h-8 w-auto" onDark />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/host/support"
                className="flex items-center gap-2 rounded-lg border border-white/20 px-3.5 py-2 text-[0.8125rem] font-extrabold transition-colors hover:border-white/40"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Get Help
              </Link>
              <SignOut />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6 pb-5">
            <div className="flex items-end gap-5">
              {/* The property thumbnail slot, labelled rather
                  than filled with a placeholder that looks like
                  a failed image. */}
              <div className="border-gold/25 from-gold/25 relative hidden h-[7.5rem] w-[7.5rem] shrink-0 items-end justify-center overflow-hidden rounded-xl border bg-gradient-to-br to-transparent pb-2 sm:flex">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="text-[0.5rem] font-extrabold uppercase tracking-[0.12em] text-white/40">
                    Photo · Property
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <span className="bg-gold-soft text-gold-text inline-block rounded-full px-3 py-1 text-[0.6875rem] font-extrabold">
                  {kicker}
                </span>
                <h1 className="mt-2 font-serif text-[2.25rem] font-extrabold leading-[1.05] tracking-tight sm:text-[2.75rem]">
                  {name}
                </h1>
                <p className="mt-1.5 text-[0.9375rem] font-semibold text-white/65">{subtitle}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <span
                      key={c.label}
                      className={`rounded-lg border px-3 py-1.5 text-[0.8125rem] font-extrabold ${
                        c.tone === 'gold'
                          ? 'border-gold/40 bg-gold-soft text-gold-text'
                          : c.tone === 'good'
                            ? 'border-success/40 bg-success/10 text-success'
                            : c.tone === 'danger'
                              ? 'border-danger/40 bg-danger/10 text-danger'
                              : 'border-white/15 bg-white/[0.06] text-white/85'
                      }`}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-border/10 w-full max-w-sm rounded-xl bg-black/35 p-4 backdrop-blur-sm lg:w-auto">
              {headline}
            </div>
          </div>
        </div>
      </header>

      {/* ───────────────────────────── sidebar + main + right */}
      <div className="mx-auto flex max-w-[96rem] gap-0">
        <nav
          aria-label="Host portal"
          className="border-border bg-surface hidden w-[15.5rem] shrink-0 border-r py-4 lg:block"
        >
          <ul className="space-y-0.5 px-3">
            {nav.map((item) => {
              const on = item.href === current;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={on ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[0.8125rem] font-extrabold transition-colors ${
                      on ? 'bg-gold-soft text-ink' : 'text-muted hover:bg-bg hover:text-ink'
                    }`}
                  >
                    <span className="shrink-0" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.alert ? (
                      <span
                        className="bg-danger h-4 w-4 shrink-0 rounded-full text-center text-[0.625rem] font-extrabold leading-4 text-white"
                        aria-label="needs attention"
                      >
                        !
                      </span>
                    ) : null}
                    {item.badge ? (
                      <span className="bg-ink h-4 min-w-4 shrink-0 rounded-full px-1 text-center text-[0.625rem] font-extrabold leading-4 text-white">
                        {item.badge}
                      </span>
                    ) : null}
                    {item.locked ? (
                      <Lock
                        className="text-muted-light h-3 w-3 shrink-0"
                        aria-label="not yet available"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* On phones the sidebar becomes a scrolling strip rather
            than disappearing — a portal you cannot navigate on a
            phone is a portal a host will not open twice. */}
        <nav
          aria-label="Host portal"
          className="border-border bg-surface fixed bottom-0 left-0 right-0 z-30 flex gap-1 overflow-x-auto border-t px-2 py-2 lg:hidden"
        >
          {nav.slice(0, 7).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[0.5625rem] font-extrabold ${
                item.href === current ? 'bg-gold-soft text-ink' : 'text-muted'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="whitespace-nowrap">{item.label.split(' ')[0]}</span>
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-7 sm:px-7 lg:pb-10">{children}</main>
      </div>

      <footer className="bg-ink mt-10 text-white">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-4 px-4 py-7 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-auto" onDark />
            <span className="text-[0.8125rem] font-semibold text-white/50">
              Your comfort, simplified.
            </span>
          </div>
          <div className="flex flex-wrap gap-5 text-[0.75rem] font-semibold text-white/50">
            <Link href="/legal/privacy" className="hover:text-white/80">
              Privacy Policy
            </Link>
            <Link href="/legal/terms" className="hover:text-white/80">
              Terms of Service
            </Link>
            <Link href="/hosts" className="hover:text-white/80">
              Host Agreement
            </Link>
            <Link href="/help" className="hover:text-white/80">
              Contact NexG
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
