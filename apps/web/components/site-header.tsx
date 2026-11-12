import { DeliverToChip } from '@nexg/location';

import { NotificationBell } from './notifications/bell';
import { Menu, User } from 'lucide-react';
import Link from 'next/link';

import { getTranslations } from '@/lib/i18n';

import { Logo } from './logo';
import { SiteMenu } from './site-menu';
import { ThemeToggle } from './theme/theme';

export interface SiteHeaderProps {
  /** The right-hand call to action, which differs per page. */
  action?: { label: string; href: string };
  /** Destination and accessible label for the account icon. */
  signIn?: { label: string; href: string };
  /** False leaves the account icon out: Discovery's header has none (owner, 12 Nov 2026). */
  account?: boolean;
}

/**
 * The global header, and with it the "Deliver to" chip.
 *
 * The chip lives here rather than on each page on purpose. Every
 * public surface already renders this component — Home, Explore,
 * Discovery, merchant pages, Experiences, Hotels, Help, Careers, Legal,
 * the QR landing — so putting it here is what makes "one chip, every
 * public page" true by construction instead of by twenty people
 * remembering. Informational pages keep it too, so the next
 * click into Explore is already placed.
 */
export async function SiteHeader({ action, signIn, account: showAccount = true }: SiteHeaderProps) {
  const { locale } = await getTranslations();
  /* /account sends a signed-out visitor to sign in and back again, so the
     icon needs no session check here (which would stop the header caching). */
  const account = signIn ?? { label: 'Your account', href: '/account' };

  return (
    <header className="bg-night sticky top-0 z-50 border-b border-white/10 text-white">
      <div className="mx-auto flex min-h-[3.75rem] max-w-[120rem] items-center justify-between gap-3 px-4 py-1 sm:px-[30px]">
        {/* A bigger logo (owner, 12 Nov 2026): 52px on phones and 56px from 640px, was 44px and 48px.
            It takes the bar's padding (4px above and below, was 8px), so the header stays 61px and 65px tall. */}
        <Link href="/" aria-label="NexG Concierge, home" className="shrink-0">
          <Logo onDark priority className="h-[3.25rem] w-auto sm:h-14" />
        </Link>

        {/* min-w-0 lets the Deliver to chip narrow on small phones, where at
            full width it would push the row past the screen edge. */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <DeliverToChip tone="dark" />
          <NotificationBell tone="dark" />
          {showAccount && (
            <Link
              href={account.href}
              aria-label={account.label}
              className="focus-visible:ring-gold text-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 sm:h-11 sm:w-11"
            >
              <User className="h-4 w-4" aria-hidden="true" fill="currentColor" />
            </Link>
          )}

          <ThemeToggle className="focus-visible:ring-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 sm:h-11 sm:w-11" />

          <SiteMenu locale={locale} quickLink={action}>
            <button
              type="button"
              aria-label="Open menu"
              className="focus-visible:ring-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 sm:h-11 sm:w-11"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </SiteMenu>
        </div>
      </div>
    </header>
  );
}
