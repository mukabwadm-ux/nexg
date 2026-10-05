'use client';

import { Button } from '@nexg/ui';
import { Globe } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { markAsked, setLocale } from '@/app/consent-actions';
import {
  isAuthored,
  localeName,
  pickLocale,
  translator,
  type Locale,
} from '@/lib/i18n/dictionaries';

/**
 * The welcome card — language only.
 *
 * It used to ask for two things, location and language. Location
 * has moved to the site-wide layer in `@nexg/location`, which
 * owns the "Deliver to" chip in the header, the sheet and the
 * confirmed pin. Two components asking the same question was one
 * too many: they kept separate state, and a visitor could end up
 * with a city cookie saying one thing and a delivery pin saying
 * another.
 *
 * What is left needs no browser permission at all —
 * navigator.languages is readable by any page. We ask anyway,
 * because silently rewriting the site into another language is
 * startling, and because the answer is the visitor's to give.
 */
export function WelcomeConsent({
  locale,
  canTranslate,
}: {
  locale: Locale;
  /** Whether a machine can produce a language we have not written out. */
  canTranslate: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(false);

  /*
   * Not inside a partner's own account.
   *
   * This card exists to open the shop on somebody's city. A
   * merchant looking at their orders mid-service, or a rider
   * checking their cash before going back out, is not shopping —
   * and a card over the top of either buys them nothing while
   * costing them the thing they came for. The decision lives here
   * rather than in the layout so there is one place that knows
   * where this belongs.
   */
  const atWork = pathname.startsWith('/merchant') || pathname.startsWith('/rider');
  const [busy, setBusy] = React.useState<string | null>(null);

  /* What the browser says they read, and whether we have it. */
  const [preferred, setPreferred] = React.useState<{ label: string; locale: Locale | null }>({
    label: '',
    locale: null,
  });

  const t = translator(locale);

  React.useEffect(() => {
    const languages = navigator.languages?.length ? [...navigator.languages] : [navigator.language];
    const match = pickLocale(languages);

    /*
     * Offerable when somebody wrote it out by hand, or when a machine
     * can produce it. Without a provider there is nothing to offer for
     * anything but English and Kiswahili, and the card says so rather
     * than promising a language it cannot deliver.
     */
    const offerable = match && (isAuthored(match) || canTranslate) ? match : null;

    setPreferred({ label: localeName(languages[0] ?? 'en'), locale: offerable });
    /* Mounted at all means the server decided they have not been asked. */
    setVisible(true);
  }, [canTranslate]);

  if (!visible || atWork) return null;

  const dismiss = async () => {
    setBusy('dismiss');
    await markAsked();
    setVisible(false);
    router.refresh();
  };

  const applyLanguage = async () => {
    if (preferred.locale && preferred.locale !== locale) {
      await setLocale(preferred.locale);
      return true;
    }
    return false;
  };

  const accept = async () => {
    setBusy('both');
    const changed = await applyLanguage();
    await markAsked();
    setBusy(null);
    setVisible(false);
    router.refresh();
    if (changed) router.refresh();
  };

  const languageOnly = async () => {
    setBusy('language');
    await applyLanguage();
    await markAsked();
    setBusy(null);
    setVisible(false);
    router.refresh();
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="welcome-consent-title"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="border-border bg-surface mx-auto max-w-2xl rounded-2xl border p-5 shadow-[0_8px_40px_rgba(20,20,20,0.16)] sm:p-6">
        <h2 id="welcome-consent-title" className="text-lg font-extrabold tracking-tight">
          {t('consent.title')}
        </h2>
        <p className="text-muted mt-1.5 text-[0.875rem] leading-[1.75]">{t('consent.body')}</p>

        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="bg-bg text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            >
              <Globe className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.875rem] font-extrabold">
                {t('consent.language.title')}
              </span>
              <span className="text-muted-light block text-[0.8125rem] font-semibold leading-[1.7]">
                {/*
                 * Said differently when we do not have their language,
                 * because promising to use it and then not would be the
                 * more annoying of the two outcomes.
                 */}
                {preferred.locale
                  ? t('consent.language.body', { language: preferred.label })
                  : t('consent.language.body.unsupported', { language: preferred.label })}
              </span>
            </span>
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button loading={busy === 'both'} onClick={() => void accept()}>
            {t('consent.allow')}
          </Button>
          {preferred.locale && preferred.locale !== locale && (
            <Button
              variant="outline"
              loading={busy === 'language'}
              onClick={() => void languageOnly()}
            >
              {t('consent.allowLanguageOnly')}
            </Button>
          )}
          <Button variant="outline" loading={busy === 'dismiss'} onClick={() => void dismiss()}>
            {t('consent.decline')}
          </Button>
        </div>

        <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.6]">
          {t('consent.footnote')}
        </p>
      </div>
    </div>
  );
}
