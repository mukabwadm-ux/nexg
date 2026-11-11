import Link from 'next/link';

import type { NavSection } from '@/lib/reference/navigation';

import { Logo } from './logo';
import { MastheadLinks, MobileMenu } from './masthead-client';

/**
 * The masthead: the same near-black band and on-dark lockup nexgapp.com
 * opens with, so a developer arriving from the site knows where they are.
 */
export function Masthead({ nav }: { nav: NavSection[] }) {
  return (
    <header className="bg-ink sticky top-0 z-40 border-b border-white/10 text-white">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="focus-visible:ring-offset-ink flex shrink-0 items-center gap-3 rounded-md"
          aria-label="NexG Developers, home"
        >
          <Logo priority className="h-10" />
          <span aria-hidden="true" className="h-6 w-px bg-white/20" />
          <span className="text-[0.9375rem] font-extrabold tracking-tight text-white">
            Developers
          </span>
        </Link>

        <MastheadLinks />

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/developers"
            className="bg-gold text-ink hover:bg-gold/90 focus-visible:ring-offset-ink hidden h-10 items-center rounded-full px-4 text-sm font-extrabold transition-colors duration-150 sm:inline-flex"
          >
            Get an API key
          </Link>
          <MobileMenu nav={nav} />
        </div>
      </div>
    </header>
  );
}
