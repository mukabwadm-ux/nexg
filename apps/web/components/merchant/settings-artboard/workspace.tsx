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
import { appendMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import s from './settings.module.css';

export function SettingsWorkspace({
  identity,
  routingEditor,
}: {
  identity: SettingsIdentity;
  routingEditor?: React.ReactNode;
}) {
  return (
    <SettingsProvider identity={identity}>
      <Workspace routingEditor={routingEditor} />
    </SettingsProvider>
  );
}

function selectionFromParams(params: { get: (name: string) => string | null }) {
  const requested = params.get('section') ?? params.get('tab') ?? 'account';
  const section: Section = SECTIONS.some((item) => item.id === requested)
    ? (requested as Section)
    : 'account';
  return { section, routing: params.get('scope') === 'business' };
}

function Workspace({ routingEditor }: { routingEditor?: React.ReactNode }) {
  const { identity, state, message, dirty, setDirty, ready } = useSettings();
  const demoContext = useMerchantOnboardingDemoContext();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selection, setSelection] = React.useState(() => selectionFromParams(params));
  const { section, routing } = selection;
  const [query, setQuery] = React.useState('');
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const lastHref = React.useRef('');
  const mainRef = React.useRef<HTMLElement>(null);
  const previousSection = React.useRef(section);
  const path = pathname ?? '/merchant/settings';
  const hrefFor = (id: Section, business = false) =>
    appendMerchantOnboardingDemoContext(
      `${path}?section=${id}${id === 'notifications' && business ? '&scope=business' : ''}`,
      demoContext,
    );
  function openDestination(href: string) {
    const destination = new URL(href, window.location.href);
    if (destination.origin === window.location.origin && destination.pathname === path) {
      // Section changes reuse the mounted workspace and already-loaded screens.
      setSelection(selectionFromParams(destination.searchParams));
      window.history.pushState(null, '', destination.href);
      lastHref.current = destination.href;
    } else {
      router.push(href, { scroll: false });
    }
  }
  React.useEffect(() => {
    if (dirty) return;
    function restoreSelection() {
      const current = selectionFromParams(new URL(window.location.href).searchParams);
      setSelection((previous) =>
        previous.section === current.section && previous.routing === current.routing
          ? previous
          : current,
      );
    }
    restoreSelection();
    window.addEventListener('popstate', restoreSelection);
    return () => window.removeEventListener('popstate', restoreSelection);
  }, [params, dirty]);
  function navigate(href: string) {
    if (dirty) {
      setPendingHref(href);
      return;
    }
    setQuery('');
    openDestination(href);
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
  }, [dirty, section, routing]);
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
        s.boundedWorkspace,
        section === 'account' && s.accountPage,
        section === 'notifications' && s.notificationsPage,
        section === 'preferences' && s.preferencesPage,
        section === 'connections' && s.connectionPage,
        state.preferences.reduceMotion && s.reduceMotion,
        state.preferences.density === 'Compact' && s.compact,
      )}
      aria-label="Settings workspace"
    >
      <div className={s.pageHead}>
        <div>
          <h1>Settings</h1>
          <p>
            {section === 'account'
              ? 'Manage your account and workspace settings.'
              : section === 'connections'
                ? 'Configure your workspace, integrations and data.'
                : 'Manage your account, preferences and integrations.'}
          </p>
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
              <Link
                href={
                  demoContext
                    ? appendMerchantOnboardingDemoContext(
                        '/merchant-live-preview/availability',
                        demoContext,
                      )
                    : '/merchant/availability'
                }
              >
                Opening hours <small>Availability</small>
              </Link>
            )}
            {/payout|bank/i.test(query) && (
              <Link
                href={
                  demoContext
                    ? appendMerchantOnboardingDemoContext(
                        '/merchant-live-preview/money',
                        demoContext,
                      )
                    : '/merchant/money'
                }
              >
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
          <a
            className={cn(s.tab, section === item.id && s.tabSelected)}
            href={hrefFor(item.id)}
            key={item.id}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              navigate(hrefFor(item.id));
            }}
          >
            {item.label}
          </a>
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
      <SettingsContent section={section}>
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
                routingEditor={routingEditor}
                onScopeChange={(business) => navigate(hrefFor('notifications', business))}
              />
            )}
            {section === 'preferences' && <PreferencesScreen />}
            {section === 'connections' && <ConnectionsScreen />}
            {section === 'api' && <DeveloperScreen />}
            {section === 'privacy' && <PrivacyScreen />}
          </>
        )}
      </SettingsContent>
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
              if (destination) openDestination(destination);
            }}
          >
            Discard and continue
          </Action>
        </div>
      </Modal>
    </main>
  );
}

function SettingsContent({ section, children }: { section: Section; children: React.ReactNode }) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let frame = 0;

    function fitContent() {
      if (!viewport || !content) return;
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height) return;
      const reflow = window.matchMedia('(max-width: 680px), (pointer: coarse)').matches;
      if (reflow) {
        content.style.setProperty('zoom', '1');
        content.style.width = '100%';
        content.style.height = 'auto';
        viewport.style.overflow = 'auto';
        return;
      }

      // Fit the complete reference composition within the shared portal body.
      // Measure natural content rather than assigning equal heights to cards.
      let scale = 1;
      for (let pass = 0; pass < 4; pass += 1) {
        content.style.setProperty('zoom', String(scale));
        content.style.width = `${width / scale}px`;
        content.style.height = 'auto';
        const next = Math.min(1, Math.max(0.6, height / Math.max(1, content.scrollHeight)));
        if (Math.abs(next - scale) < 0.005) break;
        scale = next;
      }
      content.style.setProperty('zoom', String(scale));
      content.style.width = `${width / scale}px`;
      content.style.height = `${height / scale}px`;
      viewport.style.overflow = content.scrollHeight > height / scale + 2 ? 'auto' : 'hidden';
    }

    function scheduleFit() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitContent);
    }
    const resize = new ResizeObserver(scheduleFit);
    resize.observe(viewport);
    const changes = new MutationObserver(scheduleFit);
    changes.observe(content, { subtree: true, childList: true, characterData: true });
    window.addEventListener('resize', scheduleFit);
    scheduleFit();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
      window.removeEventListener('resize', scheduleFit);
    };
  }, [section]);

  return (
    <div className={s.screenViewport} ref={viewportRef}>
      <div
        ref={contentRef}
        className={s.screenContent}
        data-settings-content
        data-section={section}
      >
        {children}
      </div>
    </div>
  );
}
