import Link from 'next/link';

import { LanguageSwitcher } from '@/components/consent/language-switcher';
import { availableLocales, getTranslations } from '@/lib/i18n';
import { DATA_PROTECTION_POLICY_URL, NEW_TAB } from '@/lib/legal-documents';
import type { Locale, Translate } from '@/lib/i18n/dictionaries';

import { Logo } from './logo';

/**
 * The site footer: a dark rounded panel with a gold top edge, the logo and
 * where NexG is live on the left, and three link columns as cards.
 *
 * A link with no `href` is a page that does not exist yet: it is listed,
 * marked "Soon", and not clickable, rather than leading to a dead page.
 * A `document` opens in a new tab (a PDF); `external` is another NexG site.
 */
type FooterLink = {
  key: string;
  href?: string;
  document?: boolean;
  external?: boolean;
};

const COLUMNS: { key: string; links: FooterLink[] }[] = [
  {
    key: 'footer.company',
    links: [
      { key: 'footer.about' },
      { key: 'footer.howWeWork' },
      { key: 'footer.blog' },
      /* The API reference and developer console (apps/api). */
      { key: 'footer.developers', href: 'https://api.nexgapp.com', external: true },
      { key: 'footer.affiliate' },
    ],
  },
  {
    key: 'footer.partner',
    links: [
      { key: 'footer.merchants', href: '/merchants' },
      { key: 'footer.hosts', href: '/hosts' },
      { key: 'footer.riders', href: '/riders' },
      { key: 'footer.openings', href: '/careers' },
    ],
  },
  {
    key: 'footer.legal',
    links: [
      { key: 'footer.terms', href: '/legal/terms' },
      { key: 'footer.privacy', href: '/legal/privacy' },
      { key: 'footer.dataProtection', href: DATA_PROTECTION_POLICY_URL, document: true },
      { key: 'footer.cookies', href: '/legal/cookies' },
      { key: 'footer.contact', href: '/help' },
    ],
  },
];

const LINK =
  'focus-visible:ring-gold rounded text-[0.9375rem] text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 sm:text-base';

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

  return (
    <footer className="bg-bg px-4 pb-6 pt-10 sm:px-[30px] sm:pb-[30px]">
      <div className="relative mx-auto max-w-[120rem] overflow-hidden rounded-[2rem] border-t-[3px] border-[#E5B32A] bg-[#141414] text-white">
        {/* A warm glow in the top-right corner. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#E5B32A]/15 blur-3xl"
        />

        <div className="relative grid gap-10 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] lg:gap-12 lg:px-16 lg:py-[4.5rem]">
          <div className="flex flex-col items-start gap-6">
            <Link
              href="/"
              aria-label="NexG Concierge, home"
              className="focus-visible:ring-gold rounded-2xl focus-visible:outline-none focus-visible:ring-2"
            >
              <Logo onDark className="h-28 w-auto sm:h-32" />
            </Link>
            <span className="border-gold/70 text-gold rounded-full border px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.2em]">
              {t('footer.available')}
            </span>
          </div>

          <nav aria-label="Footer" className="grid gap-4 sm:grid-cols-3 sm:gap-5 lg:gap-8">
            {COLUMNS.map((column) => (
              <div
                key={column.key}
                className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.04] p-6 sm:p-8"
              >
                <h2 className="text-gold text-[0.8125rem] font-extrabold uppercase tracking-[0.2em]">
                  {t(column.key)}
                </h2>
                <ul className="mt-5 space-y-3.5">
                  {column.links.map((link) => (
                    <li key={link.key}>
                      {!link.href ? (
                        <span className="inline-flex items-center gap-2 text-[0.9375rem] text-white/45 sm:text-base">
                          {t(link.key)}
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white/60">
                            {t('footer.soon')}
                          </span>
                        </span>
                      ) : link.document ? (
                        /* A PDF, opened in a new tab rather than routed. */
                        <a href={link.href} {...NEW_TAB} className={LINK}>
                          {t(link.key)}
                        </a>
                      ) : link.external ? (
                        <a href={link.href} className={LINK}>
                          {t(link.key)}
                        </a>
                      ) : (
                        <Link href={link.href} className={LINK}>
                          {t(link.key)}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="relative flex flex-col-reverse gap-4 px-6 pb-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:pb-10 lg:px-16">
          <p className="text-sm text-white/55 sm:text-[0.9375rem]">
            © {new Date().getFullYear()} NexG Concierge. All rights reserved.
          </p>
          <LanguageSwitcher locale={locale} locales={locales} tone="dark" />
        </div>
      </div>
    </footer>
  );
}
