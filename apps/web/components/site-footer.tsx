import Link from 'next/link';

import { LanguageSwitcher } from '@/components/consent/language-switcher';
import { getTranslations } from '@/lib/i18n';

import { Logo } from './logo';

const LINKS = [
  { key: 'footer.terms', href: '/legal/terms' },
  { key: 'footer.privacy', href: '/legal/privacy' },
  { key: 'footer.cookies', href: '/legal/cookies' },
  { key: 'footer.contact', href: '/help' },
] as const;

export function SiteFooter() {
  const { locale, t } = getTranslations();

  return (
    <footer className="border-border bg-bg border-t">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-4 px-4 py-[3.75rem] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-16">
        <Logo />
        <div className="flex flex-col gap-2 sm:items-end">
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            {LINKS.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className="text-muted hover:text-ink text-sm transition-colors"
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>
          <LanguageSwitcher locale={locale} />
          <p className="text-muted-light text-xs">
            © {new Date().getFullYear()} NexG Concierge. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
