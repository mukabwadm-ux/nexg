'use client';

import { Check, Globe } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { setLocale } from '@/app/consent-actions';
import { notifyPreferencesUpdated } from '@/components/consent/personalized-chrome';
import { setDisplayCurrency, useDisplayCurrency } from '@/lib/currency/client';
import { CURRENCIES } from '@/lib/currency/money';
import { AUTHORED_LOCALES, dirFor, localeName } from '@/lib/i18n/dictionaries';

export interface PreferencesLabels {
  button: string;
  language: string;
  currency: string;
  currencyNote: string;
}

/**
 * Language and currency, side by side, in the site header.
 *
 * One button — a globe and "EN · KES" — opening a small panel with both
 * lists. Language goes through the same server action as the welcome card
 * and the footer (a cookie, then a refresh). Currency is a cookie the
 * browser keeps; every <Price> on the page follows at once, and Discovery
 * listens for the change too.
 */
export function PreferencesPicker({
  locale,
  labels,
}: {
  locale: string;
  labels: PreferencesLabels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { currency } = useDisplayCurrency();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
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

  const chooseLanguage = async (option: string) => {
    if (option === locale) return;
    setBusy(option);
    await setLocale(option);
    setBusy(null);
    setOpen(false);
    document.documentElement.lang = option;
    document.documentElement.dir = dirFor(option);
    notifyPreferencesUpdated();
    if (pathname === '/' || pathname === '/localized-home') router.replace('/');
    router.refresh();
  };

  const base = locale.split('-')[0] ?? locale;

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
          {base} · {currency}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={labels.button}
          className="bg-surface text-ink absolute end-0 top-full z-[60] mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-black/10 p-4 shadow-xl dark:border-white/10"
        >
          <p className="text-muted text-[0.6875rem] font-bold uppercase tracking-wider">
            {labels.language}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1">
            {AUTHORED_LOCALES.map((option) => {
              const on = option === base;
              return (
                <li key={option}>
                  <button
                    type="button"
                    lang={option}
                    dir={dirFor(option)}
                    aria-current={on ? 'true' : undefined}
                    disabled={busy !== null}
                    onClick={() => void chooseLanguage(option)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition-colors disabled:opacity-60 ${
                      on ? 'bg-ink/[0.06] font-bold' : 'hover:bg-ink/[0.04]'
                    }`}
                  >
                    {busy === option ? '…' : localeName(option)}
                    {on && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="text-muted mt-4 text-[0.6875rem] font-bold uppercase tracking-wider">
            {labels.currency}
          </p>
          <ul className="mt-2 grid max-h-56 grid-cols-3 gap-1 overflow-y-auto">
            {CURRENCIES.map((option) => {
              const on = option.code === currency;
              return (
                <li key={option.code}>
                  <button
                    type="button"
                    title={option.name}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => {
                      setDisplayCurrency(option.code);
                      setOpen(false);
                    }}
                    className={`w-full rounded-lg px-2 py-2 text-sm transition-colors ${
                      on ? 'bg-ink/[0.06] font-bold' : 'hover:bg-ink/[0.04]'
                    }`}
                  >
                    {option.code}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-muted mt-3 text-xs leading-snug">{labels.currencyNote}</p>
        </div>
      )}
    </div>
  );
}
