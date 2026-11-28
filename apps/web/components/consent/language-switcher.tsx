'use client';

import { ChevronDown, Loader2 } from 'lucide-react';
import * as React from 'react';

import { CurrencyFlag, LanguageFlag } from '@/components/preferences/flags';
import {
  baseLocale,
  CurrencyOptions,
  useLanguageChoice,
} from '@/components/preferences/preference-selects';
import { setDisplayCurrency, useDisplayCurrency } from '@/lib/currency/client';
import { localeName } from '@/lib/i18n/dictionaries';

/**
 * Change language (and the display currency), from the footer.
 *
 * The welcome card asks once and then never again, so without this a
 * visitor who tapped "Not now" — or who is on a friend's phone — has no
 * way back. A consent you cannot revisit is not really a choice.
 *
 * Dropdowns since 22 Nov 2026 (owner), the same two choices as the header
 * globe and the menu, sharing their logic (components/preferences).
 *
 * The list is the languages the site can actually speak today, each named
 * in itself — 中文, not "Chinese": somebody looking for their own language
 * is scanning for their own word for it.
 */
export function LanguageSwitcher({
  locale,
  locales,
  tone = 'light',
  languageLabel = 'Language',
  currencyLabel = 'Currency',
}: {
  locale: string;
  locales: string[];
  /** 'dark' when it sits on a dark background, such as the footer. */
  tone?: 'light' | 'dark';
  languageLabel?: string;
  currencyLabel?: string;
}) {
  const { busy, choose } = useLanguageChoice(locale);
  const { currency } = useDisplayCurrency();

  if (locales.length < 2) return null;

  const options = locales.map(baseLocale).filter((v, i, all) => all.indexOf(v) === i);
  const value = options.includes(baseLocale(locale)) ? baseLocale(locale) : (options[0] ?? 'en');

  const select =
    tone === 'dark'
      ? 'h-10 appearance-none rounded-full border border-white/20 bg-white/[0.06] text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60 [&>option]:text-ink'
      : 'border-border bg-surface text-ink h-9 appearance-none rounded-full border text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60';
  const icon = tone === 'dark' ? 'text-white/70' : 'text-muted';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="relative inline-flex items-center">
        <LanguageFlag
          locale={value}
          className="pointer-events-none absolute start-3 !h-3 !w-[1.125rem]"
        />
        <select
          aria-label={languageLabel}
          value={value}
          disabled={busy !== null}
          onChange={(event) => void choose(event.target.value)}
          className={`${select} pe-9 ps-9`}
        >
          {options.map((option) => (
            <option key={option} value={option} lang={option}>
              {localeName(option)}
            </option>
          ))}
        </select>
        {busy !== null ? (
          <Loader2
            className={`pointer-events-none absolute end-3 h-4 w-4 animate-spin ${icon}`}
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className={`pointer-events-none absolute end-3 h-4 w-4 ${icon}`}
            aria-hidden="true"
          />
        )}
      </span>

      <span className="relative inline-flex items-center">
        <CurrencyFlag
          code={currency}
          className="pointer-events-none absolute start-3 !h-3 !w-[1.125rem]"
        />
        <select
          aria-label={currencyLabel}
          value={currency}
          onChange={(event) => setDisplayCurrency(event.target.value)}
          className={`${select} pe-9 ps-9`}
        >
          <CurrencyOptions />
        </select>
        <ChevronDown
          className={`pointer-events-none absolute end-3 h-4 w-4 ${icon}`}
          aria-hidden="true"
        />
      </span>
    </div>
  );
}
