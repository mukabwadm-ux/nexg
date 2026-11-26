'use client';

import { ChevronDown, Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { setLocale } from '@/app/consent-actions';
import { notifyPreferencesUpdated } from '@/components/consent/personalized-chrome';
import { setDisplayCurrency, useDisplayCurrency } from '@/lib/currency/client';
import { CURRENCIES } from '@/lib/currency/money';
import { AUTHORED_LOCALES, dirFor, localeName } from '@/lib/i18n/dictionaries';

import { CurrencyFlag } from './flags';

/** The language part of a tag, as the lists use it: `pt-BR` → `pt`. */
export const baseLocale = (locale: string) => locale.toLowerCase().split('-')[0] ?? locale;

/**
 * Switching language, the same way everywhere it is offered (header panel,
 * menu): the server action sets the cookie, the page takes the new lang and
 * direction at once, and the server render follows.
 */
export function useLanguageChoice(locale: string) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = React.useState<string | null>(null);

  const choose = async (option: string) => {
    if (option === baseLocale(locale)) return;
    setBusy(option);
    await setLocale(option);
    setBusy(null);
    document.documentElement.lang = option;
    document.documentElement.dir = dirFor(option);
    notifyPreferencesUpdated();
    if (pathname === '/' || pathname === '/localized-home') router.replace('/');
    router.refresh();
  };

  return { busy, choose };
}

/** The selected value for a language list: the visitor's, or English. */
export function languageValue(locale: string): string {
  const base = baseLocale(locale);
  return (AUTHORED_LOCALES as readonly string[]).includes(base) ? base : 'en';
}

const pill =
  'bg-surface text-ink focus-visible:ring-gold h-8 cursor-pointer appearance-none rounded-full pe-7 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60';

/* A native <select> dressed as one of the menu's pills: the phone's own
   picker opens, which is the easiest list to use one-handed. */
function Pill({
  icon,
  busy,
  children,
}: {
  icon?: React.ReactNode;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-flex items-center">
      {icon && (
        <span className="pointer-events-none absolute start-3 flex items-center">{icon}</span>
      )}
      {children}
      {busy ? (
        <Loader2
          className="text-muted pointer-events-none absolute end-2.5 h-3.5 w-3.5 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <ChevronDown
          className="text-muted pointer-events-none absolute end-2.5 h-3.5 w-3.5"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

export function LanguagePill({
  locale,
  label,
  icon,
}: {
  locale: string;
  label: string;
  icon?: React.ReactNode;
}) {
  const { busy, choose } = useLanguageChoice(locale);
  return (
    <Pill icon={icon} busy={busy !== null}>
      <select
        aria-label={label}
        value={languageValue(locale)}
        disabled={busy !== null}
        onChange={(event) => void choose(event.target.value)}
        className={`${pill} ${icon ? 'ps-9' : 'ps-3'}`}
      >
        {AUTHORED_LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {localeName(option)}
          </option>
        ))}
      </select>
    </Pill>
  );
}

/** Every currency by code and name, for a dropdown. */
export function CurrencyOptions() {
  return (
    <>
      {CURRENCIES.map((option) => (
        <option key={option.code} value={option.code}>
          {option.code} · {option.name}
        </option>
      ))}
    </>
  );
}

/*
 * The pill reads just the code ("KES"); the list it opens names each one.
 * The select sits invisible over the label, so it still takes the tap and
 * the keyboard, and screen readers hear the select.
 */
export function CurrencyPill({ label }: { label: string }) {
  const { currency } = useDisplayCurrency();
  return (
    <Pill icon={<CurrencyFlag code={currency} className="!h-3 !w-[1.125rem]" />}>
      <select
        aria-label={label}
        value={currency}
        onChange={(event) => setDisplayCurrency(event.target.value)}
        className="peer absolute inset-0 cursor-pointer opacity-0"
      >
        <CurrencyOptions />
      </select>
      <span
        aria-hidden="true"
        className={`${pill} peer-focus-visible:ring-gold pointer-events-none inline-flex items-center ps-9 peer-focus-visible:ring-2`}
      >
        {currency}
      </span>
    </Pill>
  );
}
