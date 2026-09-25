import { Button } from '@nexg/ui';
import { Menu } from 'lucide-react';
import Link from 'next/link';

import { Logo } from './logo';
import { SiteMenu } from './site-menu';

export interface SiteHeaderProps {
  /** The right-hand call to action, which differs per page. */
  action?: { label: string; href: string };
  /** The text link beside it. */
  signIn?: { label: string; href: string };
}

export function SiteHeader({
  action = { label: 'Sign in', href: '/sign-in' },
  signIn,
}: SiteHeaderProps) {
  return (
    <header className="border-border/60 bg-bg/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="NexG Concierge, home">
          <Logo />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {signIn && (
            <Link
              href={signIn.href}
              className="text-muted hover:text-ink hidden text-sm font-semibold transition-colors sm:block"
            >
              {signIn.label}
            </Link>
          )}

          <Button variant="gold" size="sm" asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>

          <SiteMenu>
            <button
              type="button"
              aria-label="Open menu"
              className="border-border-strong bg-surface hover:bg-bg focus-visible:ring-gold flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
          </SiteMenu>
        </div>
      </div>
    </header>
  );
}
