import { DeliverToChip } from '@nexg/location';

import { NotificationBell } from './notifications/bell';
import { Button } from '@nexg/ui';
import { Menu } from 'lucide-react';
import Link from 'next/link';

import { getTranslations } from '@/lib/i18n';

import { Logo } from './logo';
import { SiteMenu } from './site-menu';

export interface SiteHeaderProps {
  /** The right-hand call to action, which differs per page. */
  action?: { label: string; href: string };
  /** The text link beside it. */
  signIn?: { label: string; href: string };
  /**
   * The header on a dark hero needs light text. Only the chip
   * cares — everything else already inherits.
   */
  tone?: 'light' | 'dark';
}

/**
 * The global header, and with it the "Deliver to" chip.
 *
 * The chip lives here rather than on each page on purpose. Every
 * public surface already renders this component — Home, Explore,
 * merchant pages, Experiences, Hotels, Help, Careers, Legal, the
 * QR landing — so putting it here is what makes "one chip, every
 * public page" true by construction instead of by twenty people
 * remembering. Informational pages keep it too, so the next
 * click into Explore is already placed.
 */
export async function SiteHeader({ action, signIn, tone = 'light' }: SiteHeaderProps) {
  const { locale, t } = await getTranslations();

  /* Defaulted here rather than in the signature so the fallback label is
     translated too — a hard-coded default parameter cannot be. */
  const cta = action ?? { label: t('nav.signIn'), href: '/sign-in' };

  return (
    <header className="border-border/60 bg-bg/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-16">
        <Link href="/" aria-label="NexG Concierge, home" className="shrink-0">
          <Logo />
        </Link>

        {/* Centre on wide screens, because it is the control the
            whole page depends on — not a utility tucked beside
            the menu. */}
        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <DeliverToChip tone={tone} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {signIn && (
            <Link
              href={signIn.href}
              className="text-muted hover:text-ink hidden text-sm font-semibold transition-colors sm:block"
            >
              {signIn.label}
            </Link>
          )}

          {/* Renders nothing for a signed-out visitor: a bell
              over an empty drawer is a promise we have not made. */}
          <NotificationBell tone={tone} />

          <Button variant="gold" size="sm" asChild>
            <Link href={cta.href}>{cta.label}</Link>
          </Button>

          <SiteMenu locale={locale}>
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

      {/* Below the fold of the nav on phones. Never hidden: a
          visitor on a phone is the one most likely to be
          somewhere other than home. */}
      <div className="border-border/60 border-t px-4 py-2 lg:hidden">
        <DeliverToChip tone={tone} />
      </div>
    </header>
  );
}
