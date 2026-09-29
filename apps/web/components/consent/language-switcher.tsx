'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { setLocale } from '@/app/consent-actions';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/dictionaries';

/**
 * Change language, from the footer.
 *
 * The welcome card asks once and then never again, so without this a
 * visitor who tapped "Not now" — or who was on a friend's phone — has no
 * way back. A consent you cannot revisit is not really a choice.
 *
 * Each language is named in itself: somebody looking for Kiswahili is
 * looking for the word "Kiswahili", not for "Swahili" written in a
 * language they are trying to leave.
 */
export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {LOCALES.map((option) => {
        const on = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-current={on ? 'true' : undefined}
            disabled={busy || on}
            onClick={async () => {
              setBusy(true);
              await setLocale(option);
              setBusy(false);
              router.refresh();
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
              on
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink disabled:opacity-50'
            }`}
          >
            {LOCALE_NAMES[option]}
          </button>
        );
      })}
    </div>
  );
}
