import { MessageSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CartProvider } from '@/components/cart/cart-provider';
import { SiteLocationProvider } from '@/components/location/provider';
import { WrongTurn } from '@/components/not-found/wrong-turn';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

/**
 * Every address the site does not have, and every page on the retired
 * admin.nexgapp.com (next.config.mjs sends that host here). The site's own
 * header and footer, and one way on: the concierge desk. Nothing here names
 * or links the staff console.
 *
 * The root not-found sits outside the (customer) layout, so it brings the
 * two providers the header's cart and "Deliver to" chip need.
 */
export default function NotFound() {
  return (
    <SiteLocationProvider initial={null}>
      <CartProvider>
        <SiteHeader />
        <main className="mx-auto flex min-h-[72dvh] max-w-[120rem] flex-col items-center justify-center px-4 py-20 text-center sm:px-[30px] sm:py-28">
          <WrongTurn />
          <h1 className="mt-10 max-w-[18ch] text-balance text-[clamp(1.75rem,5vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.03em] sm:mt-12">
            This road doesn’t go anywhere.
          </h1>
          <p className="text-page-muted mt-4 max-w-[44ch] text-pretty text-base font-semibold leading-[1.65]">
            The page has moved, or the link has a typo in it. Tell the concierge desk what you were
            after and a real person will point you the right way.
          </p>
          <Link
            href="/help"
            className="bg-gold text-ink hover:bg-gold-deep focus-visible:ring-gold focus-visible:ring-offset-bg mt-9 inline-flex h-12 items-center gap-2.5 rounded-lg px-6 text-[0.9375rem] font-extrabold shadow-[0_8px_24px_-12px_rgb(var(--gold-deep-rgb)/0.7)] transition-[background-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-y-0"
          >
            <MessageSquare
              className="h-[1.125rem] w-[1.125rem]"
              strokeWidth={2.25}
              aria-hidden="true"
            />
            Ask the concierge desk
          </Link>
        </main>
        <SiteFooter />
      </CartProvider>
    </SiteLocationProvider>
  );
}
