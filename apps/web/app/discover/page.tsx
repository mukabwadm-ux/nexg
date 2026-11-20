import type { Metadata, Viewport } from 'next';

import { DiscoveryApp, DiscoveryChrome } from '@/components/discovery/discovery-app';
import { ForYou } from '@/components/discovery/for-you';
import { SiteHeader } from '@/components/site-header';

/**
 * Discovery: the site's own header over the Discovery app. Discovery's pages are query strings on
 * this one address (?category=, ?q=, ?merchant= …), which the app reads itself.
 *
 * Customers land here after signing in or up (owner, 20 Nov 2026), so the header shows the
 * account button: "My account" opens from it. A returning customer gets a "For you" strip first,
 * built from their own orders and bookings; a new visitor sees Discovery as before.
 *
 * Outside the (customer) group on purpose: only the header is shared. The location banner, the
 * first-visit location sheet, the cart bar (Discovery has its own basket) and the WhatsApp button
 * are not part of this page.
 */
export const metadata: Metadata = {
  title: 'Discovery',
  description: 'Explore NexG categories, merchants and their catalog.',
};
export const dynamic = 'force-dynamic';

/* Discovery is dark, so a phone's browser bar matches it. */
export const viewport: Viewport = { themeColor: '#111315' };

export default function DiscoverPage() {
  return (
    <DiscoveryChrome>
      <SiteHeader />
      <ForYou />
      <DiscoveryApp />
    </DiscoveryChrome>
  );
}
