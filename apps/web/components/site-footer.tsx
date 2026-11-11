import Link from 'next/link';

import { LanguageSwitcher } from '@/components/consent/language-switcher';
import { availableLocales, getTranslations } from '@/lib/i18n';
import { DATA_PROTECTION_POLICY_URL, NEW_TAB } from '@/lib/legal-documents';
import type { Locale, Translate } from '@/lib/i18n/dictionaries';

import { Logo } from './logo';

const LINKS = [
  { key: 'footer.terms', href: '/legal/terms' },
  { key: 'footer.privacy', href: '/legal/privacy' },
  { key: 'footer.dataProtection', href: DATA_PROTECTION_POLICY_URL, document: true },
  { key: 'footer.cookies', href: '/legal/cookies' },
  { key: 'footer.contact', href: '/help' },
] as const;

export async function SiteFooter({
  locale: pageLocale,
  translate,
}: {
  locale?: Locale;
  translate?: Translate;
} = {}) {
  const pageTranslations =
    pageLocale && translate ? { locale: pageLocale, t: translate } : await getTranslations();
  const { locale, t } = pageTranslations;
  const locales = await availableLocales();

  /* Dark, so the logo reads at its best: the on-dark artwork, with light text. */
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto flex max-w-[120rem] flex-col items-start gap-4 px-4 py-[3.75rem] sm:flex-row sm:items-center sm:justify-between sm:px-[30px]">
        <Logo onDark className="h-28" />
        <div className="flex flex-col gap-2 sm:items-end">
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            {LINKS.map((link) =>
              'document' in link ? (
                /* A PDF, opened in a new tab rather than routed. */
                <a
                  key={link.key}
                  href={link.href}
                  {...NEW_TAB}
                  className="text-sm text-white/70 transition-colors hover:text-white"
                >
                  {t(link.key)}
                </a>
              ) : (
                <Link
                  key={link.key}
                  href={link.href}
                  className="text-sm text-white/70 transition-colors hover:text-white"
                >
                  {t(link.key)}
                </Link>
              ),
            )}
          </nav>
          <LanguageSwitcher locale={locale} locales={locales} tone="dark" />
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} NexG Concierge. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
