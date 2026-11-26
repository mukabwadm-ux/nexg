import * as React from 'react';

import {
  consentCookieString,
  makeConsent,
  readConsentCookie,
  type Consent,
  type ConsentChoice,
} from './cookie';

/**
 * The visitor's cookie choice in the browser: read once from the cookie,
 * changed only through `saveConsent`, and shared by the banner, the
 * analytics loader and the welcome card through one small store.
 */

export interface ConsentState {
  /** False on the server and before the first client read. */
  ready: boolean;
  consent: Consent | null;
  /** The visitor reopened the choice from "Cookie Settings". */
  reopened: boolean;
}

const SERVER_STATE: ConsentState = { ready: false, consent: null, reopened: false };

let state: ConsentState | null = null;
const listeners = new Set<() => void>();

function current(): ConsentState {
  if (!state) {
    state = { ready: true, consent: readConsentCookie(document.cookie), reopened: false };
  }
  return state;
}

function set(next: Partial<ConsentState>) {
  state = { ...current(), ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConsentState(): ConsentState {
  return React.useSyncExternalStore(subscribe, current, () => SERVER_STATE);
}

/** Store a choice in the first-party cookie and tell everybody listening. */
export function saveConsent(choice: ConsentChoice): Consent {
  const consent = makeConsent(choice);
  document.cookie = consentCookieString(consent, {
    secure: window.location.protocol === 'https:',
  });
  set({ consent, reopened: false });
  return consent;
}

/** The footer's "Cookie Settings": show the choice again. */
export function openCookieSettings() {
  set({ reopened: true });
}

/** Closed without changing anything (only possible once a choice exists). */
export function closeCookieSettings() {
  set({ reopened: false });
}
