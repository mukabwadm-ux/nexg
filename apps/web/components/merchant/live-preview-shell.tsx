'use client';

import { Bell, ChevronDown, ChevronRight, CircleHelp, MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';

import { HomePanel } from './home-panel';
import { HomeSamplePanel } from './home-sample-panel';
import { WorkspaceMobileNavigation } from './workspace/mobile-navigation';
import {
  permittedWorkspaceNavigation,
  type MerchantWorkspaceSection,
} from './workspace/navigation';
import { WorkspaceSearch } from './workspace/search';
import { useWorkspacePreload } from './workspace/preload';
import { WorkspaceFrame } from './workspace/workspace-frame';
import styles from './workspace/workspace.module.css';
import {
  appendMerchantOnboardingDemoContext,
  MERCHANT_ONBOARDING_DEMO_STORAGE_KEY,
  type MerchantOnboardingDemoContext as DemoContext,
} from '@/lib/merchant-onboarding-demo';
import {
  MerchantOnboardingDemoScope,
  MERCHANT_ONBOARDING_DEMO_CONTEXT_EVENT,
  useMerchantOnboardingDemoContext,
} from './merchant-onboarding-demo-provider';

export type { MerchantWorkspaceSection } from './workspace/navigation';

const AviationWorkspace = dynamic(() =>
  import('./aviation/workspace').then((module) => module.AviationWorkspace),
);
const aviationWorkspaceFrames: MerchantWorkspaceSection[] = ['Business', 'Money', 'Promotions', 'Insights'];

const sampleStates = [
  ['Setting up', '/merchant-live-preview?state=setup'],
  ['Under review', '/merchant-live-preview?state=review'],
  ['Changes needed', '/merchant-live-preview?state=changes'],
  ['Live', '/merchant-live-preview'],
  ['Live · nothing needs attention', '/merchant-live-preview?state=clear'],
  ['Paused', '/merchant-live-preview?state=paused'],
  ['Mixed locations', '/merchant-live-preview?state=mixed'],
  ['Data unavailable', '/merchant-live-preview?state=unavailable'],
] as const;

export function MerchantLivePreviewShell({
  children,
  active,
  locationControl,
  sampleControl,
  accountInitials = 'NC',
  businessName = 'Merchant workspace',
  availableSections,
  demoContext,
  adaptedPreview = false,
}: {
  children: ReactNode;
  active: MerchantWorkspaceSection;
  locationControl?: ReactNode;
  sampleControl?: ReactNode;
  accountInitials?: string;
  businessName?: string;
  demoContext?: DemoContext | null;
  adaptedPreview?: boolean;
  /** Configured preview capabilities only. Production authorization stays server-owned. */
  availableSections?: readonly MerchantWorkspaceSection[];
}) {
  const inheritedDemo = useMerchantOnboardingDemoContext();
  const activeDemo = demoContext ?? inheritedDemo;
  const isAviationDemo = activeDemo?.categoryId === 'flights_aviation';
  const activeBusinessName = activeDemo?.businessName ?? businessName;
  const activeContactName = activeDemo?.contactName;
  const activeInitials = activeDemo?.initials ?? accountInitials;
  const withDemo = (href: string) => appendMerchantOnboardingDemoContext(href, activeDemo);
  useEffect(() => {
    if (!activeDemo) return;
    try {
      sessionStorage.setItem(MERCHANT_ONBOARDING_DEMO_STORAGE_KEY, JSON.stringify(activeDemo));
    } catch {
      // The current route continues carrying the sample context in its URL.
    }
    window.dispatchEvent(
      new CustomEvent(MERCHANT_ONBOARDING_DEMO_CONTEXT_EVENT, { detail: activeDemo }),
    );
  }, [activeDemo]);
  const nav = permittedWorkspaceNavigation(availableSections).map((item) => ({
    ...item,
    href: withDemo(item.href),
  }));
  const preload = useWorkspacePreload(nav.map((item) => item.href));
  const bounded = [
    'Work',
    'Offerings',
    'Business',
    'Availability',
    'Money',
    'Promotions',
    'Insights',
    'Settings',
  ].includes(active);
  const navigation = (
    <nav aria-label="Merchant preview navigation" className={styles.nav}>
      {nav.map(({ label, href, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          prefetch
          onPointerEnter={() => preload(href)}
          onFocus={() => preload(href)}
          aria-current={label === active ? 'page' : undefined}
          className={styles.navLink}
        >
          <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );

  if (isAviationDemo && !adaptedPreview && aviationWorkspaceFrames.includes(active)) {
    return (
      <MerchantOnboardingDemoScope value={activeDemo}>
        <AviationWorkspace key={active} section={active} />
      </MerchantOnboardingDemoScope>
    );
  }

  return (
    <MerchantOnboardingDemoScope value={activeDemo}>
    <WorkspaceFrame
      activeLabel={active}
      businessName={activeBusinessName}
      accountInitials={activeInitials}
      navigation={navigation}
      bounded={bounded}
      sidebarHome={
        <Link
          href={withDemo('/merchant-live-preview')}
          className={styles.sidebarContext}
          aria-label="Merchant workspace Home"
        >
          <span className={styles.businessAvatar} aria-hidden="true">
            {activeInitials}
          </span>
          <div>
            <strong>{activeBusinessName}</strong>
            <small>Merchant workspace</small>
          </div>
        </Link>
      }
      headerStart={
        <>
          <WorkspaceMobileNavigation homeHref={withDemo('/merchant-live-preview')}>{navigation}</WorkspaceMobileNavigation>
          <div className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href={withDemo('/merchant-live-preview')}>Workspace</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{active}</span>
          </div>
          <span
            className={styles.sampleBadge}
            role="note"
            aria-label={activeDemo ? `Demo for ${activeDemo.categoryName}: ${activeDemo.subcategories.map((item) => item.name).join(', ')}` : 'Demo using sample data'}
            title={activeDemo ? `${activeDemo.categoryName} · ${activeDemo.subcategories.map((item) => item.name).join(', ')}` : undefined}
          >
            {isAviationDemo ? 'Demo · Flights & aviation' : activeDemo ? `Demo · ${activeDemo.categoryName} · ${activeDemo.subcategories.length} ${activeDemo.subcategories.length === 1 ? 'activity' : 'activities'}` : 'Demo · sample data'}
          </span>
          <a className={styles.exitDemo} href="/merchants/register" onClick={() => sessionStorage.removeItem(MERCHANT_ONBOARDING_DEMO_STORAGE_KEY)}>
            Exit demo
          </a>
          <WorkspaceSearch availableSections={availableSections} demoContext={activeDemo} />
        </>
      }
      headerMiddle={isAviationDemo && !sampleControl ? undefined : (
        <div className={styles.sampleControl}>
          {sampleControl ?? (
            <details className="relative">
              <summary>
                Sample state <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <div className={styles.sampleChoices}>
                {sampleStates.map(([label, href]) => (
                  <Link key={label} href={withDemo(href)}>
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
      headerEnd={
        <>
          <div className={styles.location}>
            {locationControl ?? (
              <div className={styles.defaultLocation}>
                <MapPin size={16} aria-hidden="true" />
                <span>{isAviationDemo ? 'Wilson Airport' : 'All sample locations'}</span>
              </div>
            )}
          </div>
          <HomeSamplePanel
            kind="notifications"
            trigger={
              <button type="button" aria-label="Notifications" className={styles.iconButton}>
                <Bell size={18} aria-hidden="true" />
              </button>
            }
          />
          <HomeSamplePanel
            kind="help"
            trigger={
              <button type="button" className={styles.helpButton} aria-label="Help">
                <CircleHelp size={18} aria-hidden="true" />
                <span>Help</span>
              </button>
            }
          />
          <HomePanel
            title="Account"
            description={activeContactName ? `${activeBusinessName} · ${activeContactName}` : activeBusinessName}
            trigger={
              <button type="button" aria-label="Account" className={styles.accountButton}>
                {activeInitials}
              </button>
            }
          >
            <p className="text-muted text-sm">
              You are viewing a demo with sample data. Exit demo to return to onboarding.
            </p>
            {nav.some((item) => item.label === 'Settings') && (
              <Link
                href={withDemo('/merchant-live-preview/settings')}
                className="border-border hover:bg-bg flex min-h-11 items-center justify-between rounded-lg border px-4 py-3 text-sm font-semibold"
              >
                Workspace settings <ChevronRight size={16} aria-hidden="true" />
              </Link>
            )}
          </HomePanel>
        </>
      }
    >
      {isAviationDemo && !adaptedPreview ? (
        <AviationWorkspace key={active} section={active} />
      ) : children}
    </WorkspaceFrame>
    </MerchantOnboardingDemoScope>
  );
}
