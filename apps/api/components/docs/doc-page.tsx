import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { navLink, neighbours } from '@/lib/reference/navigation';

import { OnThisPage, OnThisPageCompact, type TocItem } from './on-this-page';

/**
 * One guide page: its heading and lead from the navigation (so a page's
 * name is written once), the reading column, the contents rail on wide
 * screens, and the way on to the previous and next pages.
 */
export function DocPage({
  href,
  toc = [],
  children,
}: {
  href: string;
  toc?: TocItem[];
  children: React.ReactNode;
}) {
  const link = navLink(href);
  return (
    <div className="flex gap-12 2xl:gap-16">
      <article className="min-w-0 max-w-[44rem] flex-1">
        <header className="border-border mb-10 border-b pb-8">
          <h1 className="text-ink text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            {link.title ?? link.label}
          </h1>
          <p className="text-muted mt-4 max-w-[40rem] text-lg leading-8">{link.description}</p>
        </header>
        <OnThisPageCompact items={toc} />
        {/* The header already spaces the page's first heading. */}
        <div className="[&>h2:first-child]:mt-0">{children}</div>
        <PrevNext href={href} />
      </article>
      {toc.length > 1 ? (
        <aside className="hidden w-56 shrink-0 xl:block">
          <OnThisPage items={toc} />
        </aside>
      ) : null}
    </div>
  );
}

export function PrevNext({ href }: { href: string }) {
  const { previous, next } = neighbours(href);
  if (!previous && !next) return null;
  return (
    <nav
      aria-label="More documentation"
      className="border-border mt-16 grid gap-3 border-t pt-8 sm:grid-cols-2"
    >
      {previous ? (
        <Link
          href={previous.href}
          className="border-border bg-surface hover:border-border-strong group flex min-h-[4.5rem] flex-col justify-center rounded-lg border px-4 py-3 transition-colors duration-150"
        >
          <span className="text-muted-light flex items-center gap-1.5 text-xs font-bold">
            <ArrowLeft
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            Previous
          </span>
          <span className="text-ink mt-1 text-sm font-bold">{previous.title ?? previous.label}</span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="border-border bg-surface hover:border-border-strong group flex min-h-[4.5rem] flex-col justify-center rounded-lg border px-4 py-3 text-right transition-colors duration-150"
        >
          <span className="text-muted-light flex items-center justify-end gap-1.5 text-xs font-bold">
            Next
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
          <span className="text-ink mt-1 text-sm font-bold">{next.title ?? next.label}</span>
        </Link>
      ) : null}
    </nav>
  );
}
