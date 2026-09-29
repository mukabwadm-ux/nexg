'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { setLocale } from '@/app/consent-actions';
import { localeName } from '@/lib/i18n/dictionaries';

/**
 * Change language, from the footer.
 *
 * The welcome card asks once and then never again, so without this a
 * visitor who tapped "Not now" — or who is on a friend's phone — has no
 * way back. A consent you cannot revisit is not really a choice.
 *
 * The list is the languages the site can actually speak today: the ones
 * written by hand plus the ones a machine has already been asked to
 * fill. Not every language in the world, because offering one we have
 * nothing for would be a button that does nothing.
 *
 * Each is named in itself — 中文, not "Chinese". Somebody looking for
 * their own language is scanning for their own word for it, not for the
 * English name of it in a language they are trying to leave.
 */
export function LanguageSwitcher({
  locale,
  locales,
}: {
  locale: string;
  locales: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  if (locales.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {locales.map((option) => {
        const on = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-current={on ? 'true' : undefined}
            disabled={busy !== null || on}
            onClick={async () => {
              setBusy(option);
              await setLocale(option);
              setBusy(null);
              router.refresh();
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
              on ? 'bg-ink text-white' : 'text-muted hover:text-ink disabled:opacity-50'
            }`}
          >
            {busy === option ? '…' : localeName(option)}
          </button>
        );
      })}
    </div>
  );
}
