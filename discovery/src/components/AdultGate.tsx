import { useEffect, useRef } from 'react';
import type { RouteState } from '../routing/discoveryRoute';

/** The Adult Section's Discovery id (MASTER_NAVIGATION.json, Supabase `adults_only`). */
export const ADULT_CATEGORY_ID = 'adults-only';

/** Set for this visit once the visitor has confirmed they are 18 or older. */
const CONSENT_KEY = 'nexg.adult-consent';

/** The Adult Section's own page, or any of its subcategories (ids `adults-only:…`). */
export const isAdultRoute = (route: Pick<RouteState, 'categoryId' | 'subcategoryId'>) =>
  route.categoryId === ADULT_CATEGORY_ID || Boolean(route.subcategoryId?.startsWith(`${ADULT_CATEGORY_ID}:`));

export function hasAdultConsent(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberAdultConsent() {
  try {
    sessionStorage.setItem(CONSENT_KEY, '1');
  } catch {
    /* Storage blocked (private mode): the visitor is asked again next time. */
  }
}

/**
 * Asked before the Adult Section or any of its subcategories opens: nothing of the section is drawn until the
 * visitor confirms they are 18 or older. The answer lasts for this visit (the tab's session storage), so a
 * shared phone asks again next time. Declining, or Escape, goes back to Discovery's home.
 */
export function AdultGate({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  /* Focus lands on the question, not on a button, so Enter can't accept by accident. */
  useEffect(() => title.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDecline();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDecline]);

  return <section className="adult-gate" role="dialog" aria-modal="true" aria-labelledby="adult-gate-title" aria-describedby="adult-gate-body">
    <div className="adult-gate__panel">
      <span className="adult-gate__badge" aria-hidden="true">18+</span>
      <h1 id="adult-gate-title" ref={title} tabIndex={-1}>This section is for adults</h1>
      <p id="adult-gate-body">The Adult Section has sexual health products, intimacy and relationship education, and experiences for couples. Confirm you are 18 or older to continue.</p>
      <div className="adult-gate__actions">
        <button type="button" className="button button--primary" onClick={onAccept}>I am 18 or older</button>
        <button type="button" className="button" onClick={onDecline}>Take me back</button>
      </div>
      <p className="adult-gate__note">We ask once each visit.</p>
    </div>
  </section>;
}
