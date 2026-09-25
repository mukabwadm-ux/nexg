import Link from 'next/link';

import { Logo } from './logo';

const LINKS = [
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'Cookies', href: '/legal/cookies' },
  { label: 'Contact', href: '/help' },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-border bg-bg border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo />
        <div className="flex flex-col gap-2 sm:items-end">
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            {LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-muted hover:text-ink text-sm transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-muted-light text-xs">
            © {new Date().getFullYear()} NexG Concierge. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
