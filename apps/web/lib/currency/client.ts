'use client';

import * as React from 'react';

import {
  BASE_CURRENCY,
  CURRENCY_COOKIE,
  CURRENCY_EVENT,
  currencyForTimeZone,
  currencyFromCookie,
  formatPrice,
  isCurrencyCode,
  type CurrencyCode,
  type FxRates,
} from './money';

/**
 * The visitor's display currency, in the browser.
 *
 * A tiny store rather than a React context, so a <Price> works anywhere —
 * inside the customer layout, on the Discovery page, in a server-rendered
 * page — without a provider having to be in the tree.
 *
 * The server always renders KES (it does not read the cookie, which would
 * stop public pages caching). After hydration a visitor who chose another
 * currency sees the converted amount; the rates are fetched only then.
 */

interface State {
  currency: CurrencyCode;
  rates: FxRates | null;
}

let state: State | null = null;
let ratesPromise: Promise<FxRates | null> | null = null;
const listeners = new Set<() => void>();
const SERVER_STATE: State = { currency: BASE_CURRENCY, rates: null };

function initialCurrency(): CurrencyCode {
  const chosen = currencyFromCookie(document.cookie);
  if (chosen) return chosen;
  try {
    return currencyForTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return BASE_CURRENCY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function current(): State {
  if (!state) {
    state = { currency: initialCurrency(), rates: null };
    if (state.currency !== BASE_CURRENCY) void loadRates();
  }
  return state;
}

/** The rates, fetched once per page load. Null if the site cannot answer. */
export function loadRates(): Promise<FxRates | null> {
  ratesPromise ??= fetch('/api/fx')
    .then((r) => (r.ok ? (r.json() as Promise<FxRates>) : null))
    .catch(() => null)
    .then((rates) => {
      if (rates && state) {
        state = { ...state, rates };
        emit();
      }
      return rates;
    });
  return ratesPromise;
}

/** Choose a currency: remembered for a year, and every price follows. */
export function setDisplayCurrency(code: string): void {
  if (!isCurrencyCode(code)) return;
  document.cookie = `${CURRENCY_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  state = { ...current(), currency: code };
  emit();
  if (code !== BASE_CURRENCY) void loadRates();
  window.dispatchEvent(new CustomEvent(CURRENCY_EVENT, { detail: { currency: code } }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDisplayCurrency(): State & { format: (kes: number) => string } {
  const snapshot = React.useSyncExternalStore(subscribe, current, () => SERVER_STATE);
  const locale = typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en';
  return {
    ...snapshot,
    format: (kes: number) => formatPrice(kes, snapshot.currency, snapshot.rates?.rates, locale),
  };
}
