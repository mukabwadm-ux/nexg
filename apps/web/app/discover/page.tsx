import type { Metadata, Viewport } from 'next';

import { DiscoveryApp, DiscoveryChrome } from '@/components/discovery/discovery-app';
import { SiteHeader } from '@/components/site-header';

/**
 * Discovery: the site's own header, without the account icon (owner, 12 Nov 2026), over the
 * Discovery app. Discovery's pages are query strings on this one address (?category=, ?q=,
 * ?merchant= …), which the app reads itself.
 *
 * Outside the (customer) group on purpose: only the header is shared. The location banner, the
 * first-visit location sheet, the cart bar (Discovery has its own basket) and the WhatsApp button
 * are not part of this page.
 */
export const metadata: Metadata = {
  title: 'Discovery',
  description: 'Explore NexG categories, merchants and their catalog.',
};

/* Discovery is dark, so a phone's browser bar matches it. */
export const viewport: Viewport = { themeColor: '#111315' };

export default function DiscoverPage() {
  return (
    <DiscoveryChrome>
      <SiteHeader account={false} />
      <DiscoveryApp />
    </DiscoveryChrome>
  );
}
