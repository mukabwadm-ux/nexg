'use client';

import { cn } from '@nexg/ui';
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Home,
  MapPin,
  Menu,
  Package,
  Settings,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { AccountMenu } from '../account-menu';
import { CartProvider } from '@/components/cart/cart-provider';
import { SiteLocationProvider } from '@/components/location/provider';
import s from './settings.module.css';

const navigation = [
  { label: 'Home', href: '/merchant', icon: Home },
  { label: 'Work', href: '/merchant/orders', icon: BriefcaseBusiness },
  { label: 'Offerings', href: '/merchant/menu', icon: Package },
  { label: 'Availability', href: '/merchant/hours', icon: CalendarDays },
  { label: 'Business', href: '/merchant/stores', icon: Building2 },
  { label: 'Money', href: '/merchant/money', icon: CreditCard },
  { label: 'Promotions', href: '/merchant/featured', icon: Tag },
  { label: 'Insights', href: '/merchant/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/merchant/settings', icon: Settings },
];
export function SettingsChrome({
  businessName,
  personName,
  sample = false,
  previewBase,
  children,
}: {
  businessName: string;
  personName: string;
  sample?: boolean;
  previewBase?: string;
  children: React.ReactNode;
}) {
  const [menu, setMenu] = React.useState(false);
  React.useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);
  return (
    <div className={s.shell}>
      {menu && (
        <button
          className={s.overlay}
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={cn(s.sidebar, menu && s.sidebarOpen)}>
        <Link
          href={sample ? previewBase ?? '/merchant-preview/settings' : '/merchant'}
          className={s.wordmark}
          aria-label="NEXG merchant workspace"
        >
          NEXG
        </Link>
        <nav aria-label="Merchant workspace" className={s.sideLinks}>
          {navigation.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              className={cn(s.sideLink, label === 'Settings' && s.sideSelected)}
              href={sample && previewBase ? label === 'Home' ? previewBase : `${previewBase}/${label.toLowerCase()}` : sample && label === 'Settings' ? '/merchant-preview/settings' : href}
              aria-current={label === 'Settings' ? 'page' : undefined}
              onClick={() => setMenu(false)}
            >
              <Icon size={22} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        {sample && (
          <div className={s.sideFooter}>
            Sample workspace
            <br />
            Changes stay in this browser.
          </div>
        )}
      </aside>
      <div className={s.shellBody}>
        <header className={s.header}>
          <button
            className={cn(s.iconButton, s.menuButton)}
            onClick={() => setMenu(!menu)}
            aria-label="Open workspace navigation"
            aria-expanded={menu}
          >
            <Menu size={23} />
          </button>
          <strong className={s.headerTitle}>Merchant workspace</strong>
          {sample && <span className={cn(s.badge, s.warning)}>Sample preview</span>}
          <div className={s.headerRight}>
            <span className={s.headerGroup}>
              {businessName}
              <ChevronDown size={16} aria-hidden="true" />
            </span>
            <span className={s.headerGroup}>
              <MapPin size={19} />
              {sample ? 'Kilimani branch' : 'Business-wide'}
            </span>
            <Link href="/merchant/messages" className={s.iconButton} aria-label="Notifications">
              <Bell size={23} />
            </Link>
            <Link href="/merchant/support" className={s.inline}>
              <CircleHelp size={19} />
              <span className={s.small}>Help</span>
            </Link>
            {sample ? (
              <span className={s.avatar} aria-label={personName}>
                AK
              </span>
            ) : (
              <AccountMenu
                businessName={businessName}
                personName={personName}
                role="Merchant account"
                live
              />
            )}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
/** Only Settings uses the new artboard. All other portal pages keep their existing shell. */
export function SettingsLayoutBoundary({
  children,
  fallback,
  businessName,
  personName,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
  businessName: string;
  personName: string;
}) {
  const pathname = usePathname();
  return pathname?.startsWith('/merchant/settings') ? (
    <SettingsChrome businessName={businessName} personName={personName}>
      {children}
    </SettingsChrome>
  ) : (
    fallback
  );
}
/** Public shopping/location prompts do not belong in the Settings workspace. */
export function SettingsPublicChromeBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  return pathname.startsWith('/merchant/settings') ||
    pathname.startsWith('/merchant-preview/settings')
    ? null
    : children;
}
export function SettingsPublicProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  if (pathname.startsWith('/merchant/settings') || pathname.startsWith('/merchant-preview/settings')) return children;
  return <SiteLocationProvider initial={null}><CartProvider>{children}</CartProvider></SiteLocationProvider>;
}
