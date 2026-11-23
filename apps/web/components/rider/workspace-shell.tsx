'use client';

import { Bell, Lock, MapPin, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { WorkspaceMobileNavigation } from '@/components/merchant/workspace/mobile-navigation';

import styles from './portal.module.css';
import type { RiderNavItem } from './shell';

function isOn(pathname: string, href: string): boolean {
  if (href === '/rider') return pathname === '/rider';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The rider portal frame: the NexG mark and "Rider Portal", the sections
 * with a yellow pill on the open one, an SOS card and the rider's
 * availability at the foot of the sidebar; city, SOS, messages and the
 * account in the top bar. On a phone the sections open from a drawer.
 *
 * SOS is on screen in every state. A rider in trouble does not first
 * become activated.
 */
export function RiderWorkspaceShell({
  personName,
  city,
  presenceLabel,
  presenceTone,
  nav,
  unreadCount,
  accountMenu,
  children,
}: {
  personName: string;
  city: string | null;
  presenceLabel: string;
  presenceTone: 'online' | 'offline' | 'pending';
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
              <span
                className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[12px] font-extrabold ${
                  item.tone === 'danger'
                    ? 'bg-red-600 text-white'
                    : on
                      ? 'bg-[#141a2a] text-white'
                      : 'bg-gold text-[color:var(--rider-ink)]'
                }`}
              >
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

  const dot =
    presenceTone === 'online'
      ? 'bg-green-500'
      : presenceTone === 'pending'
        ? 'bg-gold'
        : 'bg-slate-400';

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
          <p className={styles.presence}>
            <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
            {presenceLabel}
          </p>
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
          <span className={`${styles.divider} hidden sm:block`} aria-hidden="true" />
          {accountMenu}
        </header>
        <div className={styles.body}>
          {/* Every rider page's landmark. Pages render a plain div inside it,
              never their own main (e2e/web/portal-chrome.spec.ts reads this). */}
          <main id="main">{children}</main>
        </div>
      </div>
    </div>
  );
}
