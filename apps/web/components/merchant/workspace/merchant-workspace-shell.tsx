'use client';

import { ChevronRight, CircleHelp, FileCheck2, Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { WorkspaceMobileNavigation } from './mobile-navigation';
import { merchantWorkspaceNavigation, type MerchantWorkspaceSection } from './navigation';
import { WorkspaceFrame } from './workspace-frame';
import { safeMerchantWorkspaceHref } from './workspace-href';
import styles from './workspace.module.css';

/** The real workspace adds Documents beside the preview's sections. */
export type MerchantWorkspaceNavLabel = MerchantWorkspaceSection | 'Documents';

export interface MerchantWorkspaceNavItem {
  label: MerchantWorkspaceNavLabel;
  href: string;
  locked?: boolean;
}

/** The verification message shown above every page until approval. */
export interface MerchantWorkspaceNotice {
  tone: 'action' | 'waiting' | 'attention';
  title: string;
  body: string;
  action?: { label: string; href: string };
}

function navIcon(label: MerchantWorkspaceNavLabel) {
  if (label === 'Documents') return FileCheck2;
  return merchantWorkspaceNavigation.find((entry) => entry.label === label)!.icon;
}

export interface MerchantWorkspaceShellProps {
  businessName: string;
  accountInitials?: string;
  /** Destinations and locks come from the authenticated server layout. */
  nav: readonly MerchantWorkspaceNavItem[];
  /** Exact setup editor routes authorized by the authenticated server layout. */
  setupDestinations?: readonly string[];
  approvalLabel: string;
  /** Shown above the page until the account is approved. */
  notice?: MerchantWorkspaceNotice | null;
  /** The authenticated layout supplies account/sign-out controls. */
  headerEnd?: ReactNode;
  children: ReactNode;
}

function isOn(pathname: string, href: string) {
  return pathname === href || (href !== '/merchant' && pathname.startsWith(`${href}/`));
}

/** Presentation only. Every destination still checks current server access. */
export function MerchantWorkspaceShell({
  businessName,
  accountInitials = 'ME',
  nav,
  setupDestinations = [],
  approvalLabel,
  notice,
  headerEnd,
  children,
}: MerchantWorkspaceShellProps) {
  const pathname = usePathname() ?? '/merchant';
  const [lockSelection, setLockSelection] = useState<{
    label: MerchantWorkspaceNavLabel;
    pathname: string;
  } | null>(null);
  useEffect(() => setLockSelection(null), [pathname]);
  const currentItem = nav.find((item) => isOn(pathname, item.href));
  const selectedLock =
    lockSelection?.pathname === pathname
      ? nav.find((item) => item.label === lockSelection.label && item.locked)
      : undefined;
  const setupRoute = setupDestinations.some(
    (destination) => safeMerchantWorkspaceHref(destination) === pathname,
  );
  const lockedItem = selectedLock ?? (currentItem?.locked && !setupRoute ? currentItem : undefined);
  const activeLabel = lockedItem?.label ?? currentItem?.label ?? 'Home';
  const navigation = (
    <nav aria-label="Merchant workspace navigation" className={styles.nav}>
      {nav.map((item) => {
        const Icon = navIcon(item.label);
        const content = (
          <>
            <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
            <span className={styles.navLabel}>{item.label}</span>
          </>
        );
        const href = safeMerchantWorkspaceHref(item.href);
        return item.locked ? (
          <button
            key={item.label}
            type="button"
            className={`${styles.navLink} ${styles.navButton} ${styles.navLocked}`}
            aria-current={activeLabel === item.label ? 'page' : undefined}
            aria-label={`${item.label}, approval required`}
            data-workspace-navigation-action
            onClick={() => setLockSelection({ label: item.label, pathname })}
          >
            {content}
            <Lock size={13} aria-hidden="true" />
            <span className={styles.navLock}>Locked</span>
          </button>
        ) : href ? (
          <Link
            key={item.label}
            href={href}
            prefetch={false}
            className={styles.navLink}
            aria-current={activeLabel === item.label ? 'page' : undefined}
            onClick={() => setLockSelection(null)}
          >
            {content}
          </Link>
        ) : (
          <span key={item.label} className={styles.navLink} aria-disabled="true">
            {content}
          </span>
        );
      })}
    </nav>
  );

  return (
    <WorkspaceFrame
      activeLabel={activeLabel}
      businessName={businessName}
      accountInitials={accountInitials}
      navigation={navigation}
      sidebarHome={
        <Link
          href="/merchant"
          prefetch={false}
          className={styles.sidebarContext}
          aria-label="Merchant workspace Home"
          title={businessName}
          onClick={() => setLockSelection(null)}
        >
          <span className={styles.businessAvatar} aria-hidden="true">
            {accountInitials}
          </span>
          <div>
            <strong>Merchant workspace</strong>
            <small>Business workspace</small>
          </div>
        </Link>
      }
      headerStart={
        <>
          <WorkspaceMobileNavigation homeHref="/merchant">{navigation}</WorkspaceMobileNavigation>
          <div className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/merchant" prefetch={false} onClick={() => setLockSelection(null)}>
              Workspace
            </Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{activeLabel}</span>
          </div>
          <span className={styles.sampleBadge}>Real workspace</span>
        </>
      }
      headerMiddle={
        <span className={styles.workspaceStatus} role="note">
          {approvalLabel}
        </span>
      }
      headerEnd={
        <>
          <Link
            href="/merchant/support"
            prefetch={false}
            className={styles.helpButton}
            aria-label="Help"
          >
            <CircleHelp size={18} aria-hidden="true" />
            <span>Help</span>
          </Link>
          {headerEnd}
        </>
      }
    >
      {notice ? (
        <aside
          className={styles.verificationNotice}
          data-tone={notice.tone}
          role={notice.tone === 'attention' ? 'alert' : 'status'}
        >
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.body}</p>
          </div>
          {notice.action ? (
            <Link href={notice.action.href} prefetch={false} className={styles.noticeAction}>
              {notice.action.label}
            </Link>
          ) : null}
        </aside>
      ) : null}
      {lockedItem ? (
        <section className={styles.lockedSection} aria-labelledby="workspace-approval-title">
          <div className={styles.lockedBackdrop} aria-hidden="true">
            {[0, 1, 2, 3].map((key) => (
              <div className={styles.lockedTile} key={key} />
            ))}
          </div>
          <div className={styles.lockedPanel}>
            <Lock size={20} aria-hidden="true" />
            <h1 id="workspace-approval-title">{approvalLabel}</h1>
            <p>
              {lockedItem.label} unlocks once an admin has verified your documents and approved your
              account. Until then you can update Business and Documents.
            </p>
            <Link
              href="/merchant"
              prefetch={false}
              className={styles.homeButton}
              onClick={() => setLockSelection(null)}
            >
              Back to Home
            </Link>
          </div>
        </section>
      ) : (
        children
      )}
    </WorkspaceFrame>
  );
}
