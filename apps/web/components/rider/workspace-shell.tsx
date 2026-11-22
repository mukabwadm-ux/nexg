'use client';

import { Bell, ChevronRight, CircleHelp, Lock, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { WorkspaceMobileNavigation } from '@/components/merchant/workspace/mobile-navigation';
import { WorkspaceFrame } from '@/components/merchant/workspace/workspace-frame';
import styles from '@/components/merchant/workspace/workspace.module.css';

import type { RiderNavItem } from './shell';

function isOn(pathname: string, href: string): boolean {
  if (href === '/rider') return pathname === '/rider';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '');
  return (letters || 'R').toUpperCase();
}

/**
 * The rider portal in the merchant dashboard's frame: the same dark sidebar,
 * top bar, breadcrumb and phone drawer (components/merchant/workspace), with
 * the rider's own sections, badges and controls.
 *
 * SOS stays in the top bar on every screen and in every state. A rider in
 * trouble does not first become activated.
 */
export function RiderWorkspaceShell({
  personName,
  riderCode,
  statusLabel,
  nav,
  unreadCount,
  presenceControl,
  accountMenu,
  children,
}: {
  personName: string;
  riderCode: string;
  statusLabel: string;
  nav: RiderNavItem[];
  unreadCount: number;
  presenceControl: ReactNode;
  accountMenu: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '/rider';
  const current = nav.find((item) => isOn(pathname, item.href));
  const activeLabel = current?.label ?? 'Dashboard';
  const initials = initialsOf(personName);

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
            <span aria-hidden="true" className="flex shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]">
              {item.icon}
            </span>
            <span className={styles.navLabel}>{item.label}</span>
            {item.badge ? (
              <span
                className={`h-[1.15rem] min-w-[1.15rem] shrink-0 rounded-full px-1 text-center text-[0.625rem] font-extrabold leading-[1.15rem] ${
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
              <>
                <Lock size={13} aria-hidden="true" />
                <span className="sr-only">, not available until you are active</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <WorkspaceFrame
      activeLabel={activeLabel}
      businessName={personName}
      accountInitials={initials}
      navigation={navigation}
      sidebarHome={
        <Link
          href="/rider"
          prefetch={false}
          className={styles.sidebarContext}
          aria-label={`${personName}, rider Dashboard`}
          title={personName}
        >
          <span className={styles.businessAvatar} aria-hidden="true">
            {initials}
          </span>
          <div>
            <strong>{personName}</strong>
            <small>Rider · {riderCode}</small>
          </div>
        </Link>
      }
      sidebarFooter={
        <>
          <strong>NEXG rider portal</strong>
          <span>Nairobi · East Africa Time</span>
        </>
      }
      headerStart={
        <>
          <WorkspaceMobileNavigation homeHref="/rider" title={personName}>
            {navigation}
          </WorkspaceMobileNavigation>
          <div className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/rider" prefetch={false}>
              Rider portal
            </Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{activeLabel}</span>
          </div>
          <span className="hidden sm:inline-flex">{presenceControl}</span>
        </>
      }
      headerMiddle={
        <span className={`${styles.workspaceStatus} hidden sm:block`} role="note">
          {statusLabel}
        </span>
      }
      headerEnd={
        <>
          {/* Never hidden, never disabled, in any state. */}
          <Link
            href="/rider/incidents"
            prefetch={false}
            className="bg-danger flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8125rem] font-extrabold text-white"
          >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            SOS
          </Link>
          <Link
            href="/rider/messages"
            prefetch={false}
            className={`${styles.iconButton} relative`}
            aria-label={
              unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages, nothing new'
            }
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 ? (
              <span className="bg-danger absolute -right-0.5 -top-0.5 flex h-[1rem] min-w-[1rem] items-center justify-center rounded-full px-1 text-[0.5625rem] font-extrabold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/rider/support"
            prefetch={false}
            className={styles.helpButton}
            aria-label="Help"
          >
            <CircleHelp size={18} aria-hidden="true" />
            <span>Help</span>
          </Link>
          {accountMenu}
        </>
      }
    >
      {/* On a phone the presence switch sits under the bar, where a thumb reaches it. */}
      <div className="border-border bg-surface flex items-center gap-2 border-b px-4 py-2 sm:hidden">
        {presenceControl}
      </div>
      {children}
    </WorkspaceFrame>
  );
}
