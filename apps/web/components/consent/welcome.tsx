'use client';

import { Globe } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { markAsked, setLocale } from '@/app/consent-actions';
import { notifyPreferencesUpdated } from '@/components/consent/personalized-chrome';
import {
  isAuthored,
  isLocaleTag,
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
  const [activeLocale, setActiveLocale] = React.useState(locale);

  const t = translator(activeLocale);

  React.useEffect(() => {
    const cookies = document.cookie.split(';').map((cookie) => cookie.trim());
    const savedLocale = cookies
      .find((cookie) => cookie.startsWith('nexg_locale='))
      ?.slice('nexg_locale='.length);
    if (savedLocale && isLocaleTag(savedLocale)) setActiveLocale(savedLocale);
    if (cookies.includes('nexg_asked=1')) return;

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
    setVisible(true);
  }, [canTranslate]);

  if (!visible || atWork) return null;

  const dismiss = async () => {
    setBusy('dismiss');
    await markAsked();
    setVisible(false);
    notifyPreferencesUpdated();
  };

  const applyLanguage = async () => {
    if (preferred.locale && preferred.locale !== activeLocale) {
      await setLocale(preferred.locale);
      document.documentElement.lang = preferred.locale;
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
    notifyPreferencesUpdated();
    if (changed) {
      if (pathname === '/' || pathname === '/localized-home') {
        router.replace('/');
      } else {
        router.refresh();
      }
    }
  };

  const languageOnly = async () => {
    setBusy('language');
    const changed = await applyLanguage();
    await markAsked();
    setBusy(null);
    setVisible(false);
    notifyPreferencesUpdated();
    if (changed) {
      if (pathname === '/' || pathname === '/localized-home') {
        router.replace('/');
      } else {
        router.refresh();
      }
    }
  };

  /* Compact, in NexG ink and gold, in the bottom-left corner so it never
     sits over the WhatsApp button on the right. */
  const action =
    'inline-flex h-8 items-center justify-center rounded-full px-3.5 text-[0.75rem] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414] disabled:opacity-60';

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="welcome-consent-title"
      aria-describedby="welcome-consent-body"
      className="fixed bottom-3 left-3 right-[5.25rem] z-50 sm:bottom-5 sm:left-5 sm:right-auto sm:w-[23rem]"
    >
      <div className="rounded-2xl border border-white/10 bg-[#141414] p-4 text-white shadow-[0_18px_48px_-12px_rgba(20,20,20,0.55)]">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="bg-gold text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          >
            <Globe className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2
              id="welcome-consent-title"
              className="text-[0.9375rem] font-extrabold leading-tight"
            >
              {t('consent.title')}
            </h2>
            <p
              id="welcome-consent-body"
              className="mt-1 text-[0.75rem] font-semibold leading-[1.55] text-white/65"
            >
              {/*
               * Said differently when we do not have their language,
               * because promising to use it and then not would be the
               * more annoying of the two outcomes.
               */}
              {preferred.locale
                ? t('consent.language.body', { language: preferred.label })
                : t('consent.language.body.unsupported', { language: preferred.label })}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 pl-11">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void accept()}
            className={`${action} bg-gold text-ink hover:bg-[#FEDD5C]`}
          >
            {busy === 'both' ? '…' : t('consent.allow')}
          </button>
          {preferred.locale && preferred.locale !== activeLocale && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void languageOnly()}
              className={`${action} border border-white/20 text-white hover:border-white/40`}
            >
              {busy === 'language' ? '…' : t('consent.allowLanguageOnly')}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void dismiss()}
            className={`${action} text-white/70 hover:text-white`}
          >
            {busy === 'dismiss' ? '…' : t('consent.decline')}
          </button>
        </div>

        <p className="mt-2.5 pl-11 text-[0.625rem] font-semibold leading-[1.5] text-white/40">
          {t('consent.footnote')}
        </p>
      </div>
    </div>
  );
}
