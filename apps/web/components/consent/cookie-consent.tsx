'use client';

import { Switch } from '@nexg/ui';
import { Cookie, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { closeCookieSettings, saveConsent, useConsentState } from '@/lib/consent/client';
import {
  ACCEPT_ALL,
  REJECT_ALL,
  isConsentBannerHidden,
  type ConsentCategory,
  type ConsentChoice,
} from '@/lib/consent/cookie';

/**
 * The cookie banner and its preferences dialog, as section 9 of the Cookie
 * Policy describes them: three equally prominent choices (Accept all,
 * Reject all, Manage preferences), nothing optional pre-ticked, and the
 * footer's "Cookie Settings" to change the choice later.
 *
 * It sits where the welcome card sits, bottom left, and comes first: the
 * welcome card waits until this has been answered, so the two never stack.
 */

const CATEGORIES: { key: ConsentCategory; label: string; description: string }[] = [
  {
    key: 'functional',
    label: 'Functional',
    description:
      'Remember your preferences and recently viewed places, and power the support chat.',
  },
  {
    key: 'analytics',
    label: 'Analytics and performance',
    description:
      'Count visits and pages viewed (Google Analytics), so we can see what works and where people get stuck.',
  },
  {
    key: 'marketing',
    label: 'Marketing and advertising',
    description: 'Measure which campaigns bring people to NexG and show you NexG offers elsewhere.',
  },
];

/* The three banner choices are deliberately identical in weight. */
const CHOICE =
  'inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full border border-white/25 bg-white/[0.08] px-3.5 text-[0.75rem] font-extrabold text-white transition-colors hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]';

export function CookieConsent() {
  const pathname = usePathname() ?? '/';
  const { ready, consent, reopened } = useConsentState();
  const [managing, setManaging] = React.useState(false);

  /* "Cookie Settings" in the footer goes straight to the preferences. */
  React.useEffect(() => {
    if (reopened) setManaging(true);
  }, [reopened]);

  if (!ready) return null;
  const needsChoice = consent === null && !isConsentBannerHidden(pathname);
  if (!needsChoice && !reopened) return null;

  const choose = (choice: ConsentChoice) => {
    saveConsent(choice);
    setManaging(false);
  };

  return (
    <>
      {needsChoice && !managing && (
        <section
          aria-labelledby="cookie-consent-title"
          className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 sm:bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:left-5 sm:right-auto sm:w-[26rem]"
        >
          <div className="rounded-2xl border border-white/10 bg-[#141414] p-4 text-white shadow-[0_18px_48px_-12px_rgba(20,20,20,0.55)]">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-gold text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              >
                <Cookie className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2
                  id="cookie-consent-title"
                  className="text-[0.9375rem] font-extrabold leading-tight"
                >
                  Cookies on NexG
                </h2>
                <p className="mt-1 text-[0.75rem] font-semibold leading-[1.55] text-white/65">
                  We use the cookies the site needs to work. With your permission we would also use
                  functional, analytics and marketing cookies. Nothing optional is on until you
                  choose.{' '}
                  <Link
                    href="/legal/cookies"
                    className="focus-visible:ring-gold rounded text-white underline underline-offset-2 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2"
                  >
                    Cookie Policy
                  </Link>
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={CHOICE} onClick={() => choose(ACCEPT_ALL)}>
                Accept all
              </button>
              <button type="button" className={CHOICE} onClick={() => choose(REJECT_ALL)}>
                Reject all
              </button>
              <button type="button" className={CHOICE} onClick={() => setManaging(true)}>
                Manage preferences
              </button>
            </div>
          </div>
        </section>
      )}

      {managing && (
        <PreferencesDialog
          initial={consent ?? REJECT_ALL}
          onSave={choose}
          onClose={() => {
            setManaging(false);
            if (reopened) closeCookieSettings();
          }}
        />
      )}
    </>
  );
}

function PreferencesDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: ConsentChoice;
  onSave: (choice: ConsentChoice) => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = React.useState<ConsentChoice>({
    functional: initial.functional,
    analytics: initial.analytics,
    marketing: initial.marketing,
  });

  /* A native modal dialog: focus is kept inside, Escape closes, the page behind is inert. */
  React.useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      opener?.focus?.();
    };
  }, []);

  const button =
    'focus-visible:ring-gold inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-[0.8125rem] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

  return (
    <dialog
      ref={ref}
      aria-labelledby="cookie-preferences-title"
      aria-describedby="cookie-preferences-body"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="bg-surface text-ink m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[32rem] overflow-y-auto rounded-2xl border-0 p-0 shadow-[0_24px_64px_-16px_rgba(20,20,20,0.6)] backdrop:bg-black/60"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2
            id="cookie-preferences-title"
            className="text-[1.125rem] font-extrabold tracking-[-0.01em]"
          >
            Cookie preferences
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close without saving"
            className="text-muted hover:text-ink focus-visible:ring-gold -m-1 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <p
          id="cookie-preferences-body"
          className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.6]"
        >
          Choose which cookies NexG may use. You can change this at any time from Cookie Settings at
          the foot of every page. Your choice is kept for 12 months. More in our{' '}
          <Link href="/legal/cookies" className="text-ink underline underline-offset-2">
            Cookie Policy
          </Link>
          .
        </p>

        <div className="mt-5 space-y-2.5">
          <Switch
            id="cookie-necessary"
            label="Strictly necessary"
            checked
            disabled
            onCheckedChange={() => undefined}
            disabledReason="Always on. They keep you signed in, keep checkout working and remember this choice."
          />
          {CATEGORIES.map((category) => (
            <Switch
              key={category.key}
              id={`cookie-${category.key}`}
              label={category.label}
              description={category.description}
              checked={choice[category.key]}
              onCheckedChange={(next) => setChoice((c) => ({ ...c, [category.key]: next }))}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSave(REJECT_ALL)}
            className={`${button} border-border text-ink hover:bg-surface-muted border`}
          >
            Reject all
          </button>
          <button
            type="button"
            onClick={() => onSave(ACCEPT_ALL)}
            className={`${button} border-border text-ink hover:bg-surface-muted border`}
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => onSave(choice)}
            className={`${button} bg-ink basis-full text-white hover:bg-black sm:basis-auto`}
          >
            Save my choices
          </button>
        </div>
      </div>
    </dialog>
  );
}
