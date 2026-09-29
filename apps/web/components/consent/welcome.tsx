'use client';

import { Button, useToast } from '@nexg/ui';
import { Globe, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { markAsked, setLocale, setLocationFromCoords } from '@/app/consent-actions';
import { pickLocale, translator, type Locale } from '@/lib/i18n/dictionaries';

/**
 * The welcome card.
 *
 * It asks for two things on the first visit, and it asks in our own
 * words before the browser asks in its.
 *
 * That ordering is the whole design. Firing navigator.geolocation on
 * page load shows a permission dialog with no explanation attached, and
 * browsers treat that as abuse: Chrome degrades or auto-blocks prompts
 * that arrive without a user gesture, and a denial is permanent — the
 * site cannot ask twice. So the browser's dialog only opens after
 * somebody has read what it is for and pressed Allow. Asking well is
 * what protects the ability to ask at all.
 *
 * The language half needs no browser permission: navigator.languages is
 * readable by any page. We ask anyway, because silently rewriting the
 * site into another language is startling, and because the answer is
 * the visitor's to give.
 */
export function WelcomeConsent({ locale }: { locale: Locale }) {
  const router = useRouter();
  const { toast } = useToast();
  const [visible, setVisible] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  /* What the browser says they read, and whether we have it. */
  const [preferred, setPreferred] = React.useState<{ label: string; locale: Locale | null }>({
    label: '',
    locale: null,
  });

  /*
   * The language may change during this card's own lifetime — "Allow
   * both" applies it and then reports where we placed them. Built from
   * the applied locale rather than the prop, so the confirmation is not
   * in English on a page that has just become Swahili.
   */
  const effective = preferred.locale ?? locale;
  const t = translator(locale);
  const tAfter = translator(effective);

  React.useEffect(() => {
    const languages = navigator.languages?.length
      ? [...navigator.languages]
      : [navigator.language];
    const match = pickLocale(languages);

    let label = languages[0] ?? 'English';
    try {
      const display = new Intl.DisplayNames([languages[0] ?? 'en'], { type: 'language' });
      label = display.of(languages[0] ?? 'en') ?? label;
    } catch {
      /* Intl.DisplayNames is not everywhere. The raw tag will do. */
    }

    setPreferred({ label, locale: match });
    /* Mounted at all means the server decided they have not been asked. */
    setVisible(true);
  }, []);

  if (!visible) return null;

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


  const allowBoth = async () => {
    setBusy('both');
    const changedLanguage = await applyLanguage();

    if (!navigator.geolocation) {
      await markAsked();
      setBusy(null);
      setVisible(false);
      router.refresh();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const result = await setLocationFromCoords(
          position.coords.latitude,
          position.coords.longitude,
        );
        setBusy(null);

        /*
         * A toast, not a line inside this card.
         *
         * Writing the cookie is what makes the result true, and it also
         * re-renders the layout — which decides this card has had its
         * answer and unmounts it. The confirmation was being destroyed by
         * the very thing it was confirming. The toast lives above this
         * component and survives that.
         */
        const live = result.city?.status === 'live' || result.city?.status === 'soft_launch';
        toast({
          title: tAfter('consent.title'),
          description: result.city
            ? live
              ? tAfter('consent.located', { city: result.city.name })
              : tAfter('consent.locatedWaitlist', { city: result.city.name })
            : tAfter('consent.locatedFar'),
          tone: result.city && live ? 'success' : undefined,
        });

        setVisible(false);
        router.refresh();
      },
      async () => {
        /* Denied, dismissed, or timed out — all the same to us, and none
           of them is an error worth showing as one. */
        await markAsked();
        setBusy(null);
        toast({ title: tAfter('consent.title'), description: tAfter('consent.denied') });
        setVisible(false);
        router.refresh();
      },
      { timeout: 12000, maximumAge: 600000 },
    );

    if (changedLanguage) router.refresh();
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
              <MapPin className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.875rem] font-extrabold">
                {t('consent.location.title')}
              </span>
              <span className="text-muted-light block text-[0.8125rem] font-semibold leading-[1.7]">
                {t('consent.location.body')}
              </span>
            </span>
          </li>

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
            <Button loading={busy === 'both'} onClick={() => void allowBoth()}>
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
