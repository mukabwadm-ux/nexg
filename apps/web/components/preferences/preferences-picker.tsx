'use client';

import { Globe } from 'lucide-react';
import * as React from 'react';

import { setDisplayCurrency, useDisplayCurrency } from '@/lib/currency/client';
import { CURRENCIES } from '@/lib/currency/money';
import { AUTHORED_LOCALES, localeName } from '@/lib/i18n/dictionaries';

import { FlagSelect, type FlagOption } from './flag-select';
import { CurrencyFlag, LanguageFlag } from './flags';

import { baseLocale, languageValue, useLanguageChoice } from './preference-selects';

export interface PreferencesLabels {
  button: string;
  language: string;
  currency: string;
  currencyNote: string;
}

const LANGUAGE_OPTIONS: FlagOption[] = AUTHORED_LOCALES.map((option) => ({
  value: option,
  label: localeName(option),
  lang: option,
  icon: <LanguageFlag locale={option} />,
}));

const CURRENCY_OPTIONS: FlagOption[] = CURRENCIES.map((option) => ({
  value: option.code,
  label: option.code,
  hint: option.name,
  icon: <CurrencyFlag code={option.code} />,
}));

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
        <LanguageFlag locale={locale} className="hidden sm:inline-block" />
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
          <p
            id={`${panelId}-language-label`}
            className="text-muted text-[0.6875rem] font-bold uppercase tracking-wider"
          >
            {labels.language}
          </p>
          <div className="mt-2">
            <FlagSelect
              id={`${panelId}-language`}
              labelId={`${panelId}-language-label`}
              value={languageValue(locale)}
              options={LANGUAGE_OPTIONS}
              busy={busy !== null}
              disabled={busy !== null}
              onChange={async (value) => {
                await choose(value);
                setOpen(false);
              }}
            />
          </div>

          <p
            id={`${panelId}-currency-label`}
            className="text-muted mt-4 text-[0.6875rem] font-bold uppercase tracking-wider"
          >
            {labels.currency}
          </p>
          <div className="mt-2">
            <FlagSelect
              id={`${panelId}-currency`}
              labelId={`${panelId}-currency-label`}
              value={currency}
              options={CURRENCY_OPTIONS}
              onChange={setDisplayCurrency}
            />
          </div>
          <p className="text-muted mt-3 text-xs leading-snug">{labels.currencyNote}</p>
        </div>
      )}
    </div>
  );
}
