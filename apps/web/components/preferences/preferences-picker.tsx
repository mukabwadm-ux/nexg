'use client';

import { ChevronDown, Globe, Loader2 } from 'lucide-react';
import * as React from 'react';

import { setDisplayCurrency, useDisplayCurrency } from '@/lib/currency/client';
import { AUTHORED_LOCALES, localeName } from '@/lib/i18n/dictionaries';

import {
  baseLocale,
  CurrencyOptions,
  languageValue,
  useLanguageChoice,
} from './preference-selects';

export interface PreferencesLabels {
  button: string;
  language: string;
  currency: string;
  currencyNote: string;
}

const field =
  'border-border bg-bg text-ink focus-visible:ring-gold h-11 w-full appearance-none rounded-xl border pe-10 ps-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60';

function Chevron({ busy }: { busy?: boolean }) {
  const cls = 'text-muted pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2';
  return busy ? (
    <Loader2 className={`${cls} animate-spin`} aria-hidden="true" />
  ) : (
    <ChevronDown className={cls} aria-hidden="true" />
  );
}

/**
 * Language and currency, side by side, in the site header.
 *
 * One button — a globe and "EN · KES" — opening a small panel with two
 * dropdowns (owner, 22 Nov 2026), the same two the menu offers
 * (./preference-selects). Language goes through the same server action as
 * the welcome card and the footer (a cookie, then a refresh). Currency is a
 * cookie the browser keeps; every <Price> on the page follows at once, and
 * Discovery listens for the change too.
 */
export function PreferencesPicker({
  locale,
  labels,
}: {
  locale: string;
  labels: PreferencesLabels;
}) {
  const { currency } = useDisplayCurrency();
  const { busy, choose } = useLanguageChoice(locale);
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={labels.button}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="focus-visible:ring-gold flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-2.5 text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 sm:h-11 sm:px-3"
      >
        <Globe className="h-5 w-5" aria-hidden="true" />
        <span className="hidden text-xs font-bold uppercase tracking-wide sm:inline">
          {baseLocale(locale)} · {currency}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={labels.button}
          className="bg-surface text-ink absolute end-0 top-full z-[60] mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-black/10 p-4 shadow-xl dark:border-white/10"
        >
          <label
            htmlFor={`${panelId}-language`}
            className="text-muted text-[0.6875rem] font-bold uppercase tracking-wider"
          >
            {labels.language}
          </label>
          <div className="relative mt-2">
            <select
              id={`${panelId}-language`}
              value={languageValue(locale)}
              disabled={busy !== null}
              onChange={async (event) => {
                await choose(event.target.value);
                setOpen(false);
              }}
              className={field}
            >
              {AUTHORED_LOCALES.map((option) => (
                <option key={option} value={option} lang={option}>
                  {localeName(option)}
                </option>
              ))}
            </select>
            <Chevron busy={busy !== null} />
          </div>

          <label
            htmlFor={`${panelId}-currency`}
            className="text-muted mt-4 block text-[0.6875rem] font-bold uppercase tracking-wider"
          >
            {labels.currency}
          </label>
          <div className="relative mt-2">
            <select
              id={`${panelId}-currency`}
              value={currency}
              onChange={(event) => setDisplayCurrency(event.target.value)}
              className={field}
            >
              <CurrencyOptions />
            </select>
            <Chevron />
          </div>
          <p className="text-muted mt-3 text-xs leading-snug">{labels.currencyNote}</p>
        </div>
      )}
    </div>
  );
}
