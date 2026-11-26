import { googleConsent, isAnalyticsExcluded, type Consent } from '@/lib/consent/cookie';

/**
 * Google Analytics 4 through gtag.js, in the browser only.
 *
 * Nothing here runs until the visitor has allowed analytics: the loader
 * component decides that (lib/consent/cookie.ts `shouldLoadAnalytics`) and
 * only then calls `loadGtag`. Events sent before that are dropped, not
 * queued, so nothing is collected from before the choice.
 *
 * What is sent: page paths without query strings, and stay events with ids,
 * names of listings, nights and KES amounts. Never a guest's name, phone or
 * email.
 */

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let loadedId: string | null = null;

/** The consent defaults, as an inline script for the document head. */
export function consentDefaultScript(): string {
  const defaults = { ...googleConsent(null), wait_for_update: 500 };
  return (
    'window.dataLayer=window.dataLayer||[];' +
    'window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};' +
    `window.gtag('consent','default',${JSON.stringify(defaults)});`
  );
}

function gtag(): Gtag {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // gtag.js reads the `arguments` object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('consent', 'default', { ...googleConsent(null), wait_for_update: 500 });
  }
  return window.gtag;
}

/** Without query strings or fragments: those can carry tokens and references. */
export function pageLocation(pathname: string): string {
  return `${window.location.origin}${pathname.split(/[?#]/)[0]}`;
}

/** Load gtag.js once, with the visitor's consent already applied. */
export function loadGtag(measurementId: string, consent: Consent, pathname: string) {
  const g = gtag();
  g('consent', 'update', googleConsent(consent));
  setPaused(measurementId, false);
  if (loadedId === measurementId) return;
  loadedId = measurementId;

  g('js', new Date());
  g('config', measurementId, {
    /* page_view is sent by the loader on every route change, path only. */
    send_page_view: false,
    page_location: pageLocation(pathname),
    /* GA4 does not log IP addresses; kept for any property still reading it. */
    anonymize_ip: true,
    allow_google_signals: consent.marketing,
    allow_ad_personalization_signals: consent.marketing,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

/** gtag's documented switch: while true, nothing is sent for that property. */
function setPaused(measurementId: string, paused: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = paused;
}

/**
 * Consent withdrawn, or an excluded page: stop sending, deny storage and,
 * on withdrawal, remove the cookies Google Analytics set.
 */
export function stopGtag(measurementId: string, consent: Consent | null, removeCookies: boolean) {
  if (!loadedId) return;
  setPaused(measurementId, true);
  gtag()('consent', 'update', googleConsent(consent));
  if (removeCookies) clearAnalyticsCookies();
}

function clearAnalyticsCookies() {
  const names = document.cookie
    .split(';')
    .map((part) => part.trim().split('=')[0] ?? '')
    .filter((name) => name === '_ga' || name.startsWith('_ga_') || name === '_gid');
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Path=/; Max-Age=0${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}

export function sendPageView(pathname: string) {
  if (!loadedId || isAnalyticsExcluded(pathname)) return;
  const g = gtag();
  const location = pageLocation(pathname);
  g('set', { page_location: location });
  g('event', 'page_view', { page_location: location, page_path: pathname.split(/[?#]/)[0] });
}

export interface StayItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
}

export type StayEvent =
  | { name: 'view_item'; params: { currency: 'KES'; value?: number; items: StayItem[] } }
  | { name: 'begin_checkout'; params: { currency: 'KES'; value?: number; items: StayItem[] } }
  | {
      name: 'purchase';
      params: { currency: 'KES'; value: number; transaction_id: string; items: StayItem[] };
    };

/** Send an ecommerce event, if analytics is loaded on this page. Otherwise nothing. */
export function track(event: StayEvent): boolean {
  if (!loadedId || isAnalyticsExcluded(window.location.pathname)) return false;
  gtag()('event', event.name, event.params);
  return true;
}

/** Whether gtag.js has been loaded in this tab (for components that wait for it). */
export function analyticsLoaded(): boolean {
  return loadedId !== null;
}

export const ANALYTICS_READY_EVENT = 'nexg:analytics-ready';
