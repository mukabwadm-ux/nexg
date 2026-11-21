import Link from 'next/link';

import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme/theme';

/**
 * The header on the legal pages (owner, 21 Nov 2026): the site's dark bar and
 * logo, with only the way around the legal pages and back to NexG. No
 * location, cart, notifications or account: nothing here is for sale, and
 * the shop's bars covered the text.
 */
export function LegalHeader() {
  return (
    <header className="bg-night sticky top-0 z-40 border-b border-white/10 text-white print:hidden">
      <div className="mx-auto flex h-16 max-w-[75rem] items-center gap-3 px-4 sm:gap-4 sm:px-8">
        <Link href="/" aria-label="NexG Concierge, home" className="shrink-0">
          <Logo onDark priority className="h-12 w-auto" />
        </Link>
        <span aria-hidden="true" className="h-6 w-px bg-white/15" />
        <Link
          href="/legal"
          className="hover:text-gold rounded-md text-[0.9375rem] font-bold transition-colors"
        >
          Legal
        </Link>

        <nav aria-label="Legal" className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/legal"
            className="hidden rounded-lg px-3 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:text-white md:block"
          >
            All documents
          </Link>
          <Link
            href="/help"
            className="hidden rounded-lg px-3 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:text-white md:block"
          >
            Help
          </Link>
          <ThemeToggle className="focus-visible:ring-gold flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2" />
          <Link
            href="/"
            className="ml-1 hidden rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-white/[0.06] sm:block"
          >
            Back to NexG
          </Link>
        </nav>
      </div>
    </header>
  );
}
