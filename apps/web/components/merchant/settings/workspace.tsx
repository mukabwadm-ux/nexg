'use client';

import { cn } from '@nexg/ui';
import { Building2, Loader2, Search, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { AccountScreen } from './account';
import { ConnectionsScreen } from './connections';
import { DeveloperScreen } from './developer';
import { SECTIONS, type Section, type SettingsIdentity } from './model';
import { NotificationsScreen } from './notifications';
import { PreferencesScreen } from './preferences';
import { PrivacyScreen } from './privacy';
import { SettingsProvider, useSettings } from './store';
import { Action, Modal, Note } from './ui';
import s from './settings.module.css';

export function SettingsWorkspace({ identity }: { identity: SettingsIdentity }) {
  return (
    <SettingsProvider identity={identity}>
      <Workspace />
    </SettingsProvider>
  );
}
function Workspace() {
  const { identity, state, message, dirty, setDirty, ready } = useSettings();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('section') ?? params.get('tab') ?? 'account';
  const section: Section = SECTIONS.some((item) => item.id === requested)
    ? (requested as Section)
    : 'account';
  const routing = params.get('scope') === 'business';
  const [query, setQuery] = React.useState('');
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const lastHref = React.useRef('');
  const mainRef = React.useRef<HTMLElement>(null);
  const previousSection = React.useRef(section);
  const path = pathname ?? '/merchant/settings';
  const hrefFor = (id: Section, business = false) =>
    `${path}?section=${id}${id === 'notifications' && business ? '&scope=business' : ''}`;
  function navigate(href: string) {
    if (dirty) {
      setPendingHref(href);
      return;
    }
    setQuery('');
    router.push(href, { scroll: false });
  }
  React.useEffect(() => {
    if (previousSection.current !== section) {
      mainRef.current?.focus({ preventScroll: true });
      previousSection.current = section;
    }
  }, [section]);
  React.useEffect(() => {
    lastHref.current = window.location.href;
    if (!dirty) return;
    const intercept = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
        return;
      const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        anchor.href === window.location.href
      )
        return;
      if (new URL(anchor.href).origin !== window.location.origin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPendingHref(anchor.href);
    };
    const pop = () => {
      const destination = window.location.href;
      window.history.pushState(null, '', lastHref.current);
      setPendingHref(destination);
    };
    document.addEventListener('click', intercept, true);
    window.addEventListener('popstate', pop);
    return () => {
      document.removeEventListener('click', intercept, true);
      window.removeEventListener('popstate', pop);
    };
  }, [dirty]);
  const allResults = SECTIONS.filter((item) =>
    `${item.label} ${item.terms}`.toLowerCase().includes(query.toLowerCase()),
  );
  const personal = section === 'account' || section === 'preferences' || section === 'privacy';
  const scopeLabel = personal
    ? 'Your account'
    : section === 'api'
      ? `Business · ${identity.businessName}`
      : '';
  const scopeHint =
    section === 'account'
      ? 'Applies to you across your workspaces.'
      : section === 'preferences'
        ? 'Applies only to how you see the portal.'
        : section === 'privacy'
          ? 'Manage requests for your personal account data.'
          : 'Access is limited by location and operation.';
  return (
    <main
      ref={mainRef}
      tabIndex={-1}
      className={cn(
        s.workspace,
        section === 'notifications' && s.notificationsPage,
        state.preferences.reduceMotion && s.reduceMotion,
        state.preferences.density === 'Compact' && s.compact,
      )}
      aria-label="Settings workspace"
    >
      <div className={s.pageHead}>
        <div>
          <h1>Settings</h1>
          <p>Manage your account, preferences and connected systems.</p>
        </div>
        {scopeLabel && (
          <div className={s.scope}>
            <span className={s.scopeLabel}>
              {personal ? <UserRound size={21} /> : <Building2 size={20} />} {scopeLabel}
            </span>
            <span className={s.scopeHint}>{scopeHint}</span>
          </div>
        )}
      </div>
      <div className={cn(s.searchBox, section === 'notifications' && s.searchNarrow)}>
        <Search size={20} aria-hidden="true" />
        <input
          aria-label="Search settings"
          placeholder="Search settings"
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
          aria-controls={query ? 'settings-search-results' : undefined}
        />
        {query && (
          <button
            className={s.iconButton}
            onClick={() => setQuery('')}
            aria-label="Clear settings search"
          >
            <X size={18} />
          </button>
        )}
        {query && (
          <div
            className={s.searchResults}
            id="settings-search-results"
            aria-label="Settings search results"
          >
            {allResults.map((item) => (
              <button key={item.id} onClick={() => navigate(hrefFor(item.id))}>
                <span>{item.label}</span>
                <small>Settings</small>
              </button>
            ))}
            {/opening|hours/i.test(query) && (
              <Link href="/merchant/hours">
                Opening hours <small>Availability</small>
              </Link>
            )}
            {/payout|bank/i.test(query) && (
              <Link href="/merchant/money">
                Payouts <small>Money</small>
              </Link>
            )}
            {!allResults.length && !/opening|hours|payout|bank/i.test(query) && (
              <p style={{ padding: 12 }}>
                No settings found. Try another word or clear your search.
              </p>
            )}
          </div>
        )}
      </div>
      <nav className={s.tabs} aria-label="Settings sections">
        {SECTIONS.map((item) => (
          <Link
            className={cn(s.tab, section === item.id && s.tabSelected)}
            href={hrefFor(item.id)}
            key={item.id}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(hrefFor(item.id));
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <label className={cn(s.field, s.mobileSection)}>
        <span>Settings section</span>
        <select
          aria-label="Settings section"
          value={section}
          onChange={(e) => navigate(hrefFor(e.target.value as Section))}
        >
          {SECTIONS.map((item) => (
            <option value={item.id} key={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {message && (
        <div className={s.noticeStatus} role={message.tone === 'danger' ? 'alert' : 'status'}>
          <Note tone={message.tone}>{message.text}</Note>
        </div>
      )}
      {!ready ? (
        <div className={s.loading} role="status">
          <Loader2 className={s.spin} />
          Loading settings…
        </div>
      ) : (
        <>
          {section === 'account' && <AccountScreen />}
          {section === 'notifications' && (
            <NotificationsScreen
              key={routing ? 'business' : 'personal'}
              routing={routing}
              onScopeChange={(business) => navigate(hrefFor('notifications', business))}
            />
          )}
          {section === 'preferences' && <PreferencesScreen />}
          {section === 'connections' && <ConnectionsScreen />}
          {section === 'api' && <DeveloperScreen />}
          {section === 'privacy' && <PrivacyScreen />}
        </>
      )}
      <Modal
        title="Discard unsaved changes?"
        description="Your changes have not been saved. Stay here to finish or discard the draft and continue."
        open={pendingHref !== null}
        onClose={() => setPendingHref(null)}
      >
        <div className={s.actions}>
          <Action onClick={() => setPendingHref(null)}>Stay here</Action>
          <Action
            variant="danger"
            onClick={() => {
              const destination = pendingHref;
              setDirty(false);
              setPendingHref(null);
              setQuery('');
              if (destination) router.push(destination, { scroll: false });
            }}
          >
            Discard and continue
          </Action>
        </div>
      </Modal>
    </main>
  );
}
