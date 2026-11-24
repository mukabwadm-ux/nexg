'use client';

import { Bell, Lock, MapPin, Search, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import type { ReactNode } from 'react';

import { WorkspaceMobileNavigation } from '@/components/merchant/workspace/mobile-navigation';

import { LocationSharer } from './location-sharer';
import { OnlineSwitch } from './online-switch';
import styles from './portal.module.css';
import type { RiderNavItem } from './shell';

function isOn(pathname: string, href: string): boolean {
  if (href === '/rider') return pathname === '/rider';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Extra words a rider might type for each place in the portal. */
const SEARCH_WORDS: Record<string, string> = {
  '/rider/jobs': 'jobs deliveries orders trips offers',
  '/rider/earnings': 'earnings pay money statement friday chart',
  '/rider/cashout': 'cashout cash out withdraw payout mpesa m-pesa balance',
  '/rider/cash': 'cash on hand deposit remit collected',
  '/rider/receipts': 'receipts',
  '/rider/shifts': 'shifts schedule hours availability',
  '/rider/messages': 'messages inbox notifications',
  '/rider/health': 'health score rating acceptance strikes training',
  '/rider/documents': 'documents id licence insurance police clearance upload',
  '/rider/kit': 'kit helmet bag jacket',
  '/rider/incidents': 'sos incident accident safety emergency',
  '/rider/refer': 'refer referral rewards points badges achievements friend',
  '/rider/profile': 'account profile phone mpesa m-pesa payout number motorbike plate zone',
  '/rider/support': 'help support question ticket contact',
};

function RiderSearch({ nav }: { nav: RiderNavItem[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const q = query.trim().toLowerCase();
  const results = q
    ? nav.filter((item) =>
        `${item.label} ${SEARCH_WORDS[item.href] ?? ''}`.toLowerCase().includes(q),
      )
    : [];

  return (
    <form
      role="search"
      className="relative hidden w-full max-w-[26rem] md:block"
      onSubmit={(event) => {
        event.preventDefault();
        const first = results[0];
        if (first) {
          router.push(first.href);
          setQuery('');
          setOpen(false);
        }
      }}
    >
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
        aria-hidden="true"
      />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search jobs, earnings, or help…"
        aria-label="Search the rider portal"
        className="focus:border-gold focus:ring-gold/40 h-11 w-full rounded-2xl border border-[#e3e7f0] bg-white pl-11 pr-4 text-[14px] font-semibold outline-none focus:ring-2"
      />
      {open && q ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-[#e3e7f0] bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-[13px] font-semibold text-slate-500">
              Nothing matches. Try “pay”, “documents” or “help”.
            </p>
          ) : (
            results.slice(0, 6).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-bold hover:bg-[#f6f7fb] [&_svg]:h-4 [&_svg]:w-4"
                onClick={() => {
                  setQuery('');
                  setOpen(false);
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            ))
          )}
        </div>
      ) : null}
    </form>
  );
}

/**
 * The rider portal frame: the NexG mark and "Rider Portal", the sections
 * with a yellow pill on the open one, an SOS card and the online switch at
 * the foot of the sidebar; city, search, messages and the account in the
 * top bar. On a phone the sections open from a drawer.
 *
 * SOS is on screen in every state. A rider in trouble does not first
 * become activated.
 */
export function RiderWorkspaceShell({
  personName,
  city,
  active,
  online,
  nav,
  unreadCount,
  accountMenu,
  children,
}: {
  personName: string;
  city: string | null;
  active: boolean;
  online: boolean;
  nav: RiderNavItem[];
  unreadCount: number;
  accountMenu: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '/rider';

  const navigation = (
    <nav aria-label="Rider portal navigation" className={styles.nav}>
      {nav.map((item) => {
        const on = isOn(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={styles.navLink}
            aria-current={on ? 'page' : undefined}
          >
            <span aria-hidden="true" className="flex shrink-0 [&_svg]:h-5 [&_svg]:w-5">
              {item.icon}
            </span>
            <span className={styles.navLabel}>{item.label}</span>
            {item.badge ? (
              <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[12px] font-extrabold text-white">
                {item.badge}
              </span>
            ) : null}
            {item.locked ? (
              <>
                <Lock size={13} aria-hidden="true" className="opacity-60" />
                <span className="sr-only">, not available until you are active</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className={styles.shell} data-rider-portal>
      <aside className={styles.sidebar} aria-label="Rider portal sidebar">
        <Link href="/rider" prefetch={false} className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nexg-logo-on-dark.png" alt="" />
          <span>
            <strong>NEXGAPP</strong>
            <small>Rider Portal</small>
          </span>
        </Link>
        {navigation}
        <div className={styles.sidebarFoot}>
          <div className={styles.sosCard}>
            <p>
              In trouble on the road?
              <br />
              <span>SOS reaches rider ops straight away.</span>
            </p>
            <Link
              href="/rider/incidents"
              prefetch={false}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-[13px] font-extrabold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              SOS
            </Link>
          </div>
          <div className={styles.presence}>
            {active ? (
              <OnlineSwitch online={online} />
            ) : (
              <>
                <span className="bg-gold h-2.5 w-2.5 rounded-full" aria-hidden="true" />
                Not active yet
              </>
            )}
          </div>
        </div>
      </aside>

      <div className={styles.frame}>
        <header className={styles.header}>
          <WorkspaceMobileNavigation homeHref="/rider" title={personName}>
            {navigation}
          </WorkspaceMobileNavigation>
          <span className={styles.city}>
            <MapPin className="text-gold-text h-5 w-5" aria-hidden="true" />
            {city ?? 'Zone not set'}
          </span>
          <span className={`${styles.divider} hidden md:block`} aria-hidden="true" />
          <RiderSearch nav={nav} />
          <span className="flex-1" />
          {/* Never hidden, never disabled, in any state. */}
          <Link
            href="/rider/incidents"
            prefetch={false}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-[13px] font-extrabold text-white lg:hidden"
          >
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            SOS
          </Link>
          <Link
            href="/rider/messages"
            prefetch={false}
            className={styles.iconButton}
            aria-label={
              unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages, nothing new'
            }
          >
            <Bell size={19} aria-hidden="true" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-extrabold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </Link>
          {accountMenu}
        </header>
        <div className={styles.body}>
          {/* Every rider page's landmark. Pages render a plain div inside it,
              never their own main (e2e/web/portal-chrome.spec.ts reads this). */}
          {active && online ? <LocationSharer /> : null}
          <main id="main">{children}</main>
        </div>
      </div>
    </div>
  );
}
