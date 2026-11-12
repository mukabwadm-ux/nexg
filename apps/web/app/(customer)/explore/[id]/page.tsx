import { permanentRedirect } from 'next/navigation';

import { discoverMerchantHref } from '@/lib/discover-links';

/** A merchant's Explore page now opens its store in Discovery (owner, 12 Nov 2026). */
export default function ExploreMerchantRedirect({ params }: { params: { id: string } }) {
  permanentRedirect(discoverMerchantHref(params.id));
}
