import Link from 'next/link';

const LINKS = [
  { href: '/docs', label: 'Guides' },
  { href: '/docs/reference', label: 'API reference' },
  { href: '/docs/changelog', label: 'Changelog' },
  { href: '/developers', label: 'Developer console' },
];

export function SiteFooter() {
  return (
    <footer className="border-border bg-bg border-t">
      <div className="mx-auto flex max-w-[90rem] flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <p className="text-ink text-sm font-extrabold">NexG API · v1</p>
          <p className="text-muted mt-1 text-sm">
            For merchants, partners and banks building on{' '}
            <a
              href="https://nexgapp.com"
              className="text-ink decoration-gold font-semibold underline decoration-2 underline-offset-4"
            >
              nexgapp.com
            </a>
            .
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted hover:text-ink text-sm font-semibold transition-colors duration-150"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
