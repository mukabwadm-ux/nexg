'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';

import {
  ANALYTICS_READY_EVENT,
  loadGtag,
  sendPageView,
  stopGtag,
  track,
  type StayEvent,
} from '@/lib/analytics/gtag';
import { useConsentState } from '@/lib/consent/client';
import { isAnalyticsExcluded, shouldLoadAnalytics } from '@/lib/consent/cookie';

/**
 * Loads Google Analytics 4 once the visitor allows analytics, and sends a
 * page_view (path only) on every client route change. Rendered only when
 * NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
 */
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname() ?? '/';
  const { ready, consent } = useConsentState();
  const hadConsent = React.useRef(false);

  React.useEffect(() => {
    if (!ready) return;
    if (shouldLoadAnalytics({ measurementId, consent, pathname })) {
      loadGtag(measurementId, consent!, pathname);
      hadConsent.current = true;
      sendPageView(pathname);
      window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));
      return;
    }
    /* Withdrawn: stop and remove Google's cookies. Excluded page: just pause. */
    const withdrawn = consent?.analytics !== true;
    stopGtag(measurementId, consent, withdrawn && hadConsent.current);
    if (withdrawn) hadConsent.current = false;
  }, [ready, consent, pathname, measurementId]);

  return null;
}

/**
 * Sends one ecommerce event when it mounts, or as soon as analytics loads on
 * this page. `once` keeps a refresh from sending it again in this tab.
 */
export function TrackEvent({ event, once }: { event: StayEvent; once?: string }) {
  const sent = React.useRef(false);
  const key = JSON.stringify(event);

  React.useEffect(() => {
    sent.current = false;
    const send = () => {
      if (sent.current || isAnalyticsExcluded(window.location.pathname)) return;
      if (once && alreadySent(once)) {
        sent.current = true;
        return;
      }
      if (track(JSON.parse(key) as StayEvent)) {
        sent.current = true;
        if (once) markSent(once);
      }
    };
    /* After the loader's effect for this route, so the page_view goes first. */
    const timer = window.setTimeout(send, 0);
    window.addEventListener(ANALYTICS_READY_EVENT, send);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(ANALYTICS_READY_EVENT, send);
    };
  }, [key, once]);

  return null;
}

function alreadySent(key: string): boolean {
  try {
    return window.sessionStorage.getItem(`nexg_ga_${key}`) === '1';
  } catch {
    return false;
  }
}

function markSent(key: string) {
  try {
    window.sessionStorage.setItem(`nexg_ga_${key}`, '1');
  } catch {
    /* Storage blocked: the event may be sent again on a refresh, nothing worse. */
  }
}
