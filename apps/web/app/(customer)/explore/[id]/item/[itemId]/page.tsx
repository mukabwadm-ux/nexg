import { permanentRedirect } from 'next/navigation';

import { discoverMerchantHref } from '@/lib/discover-links';

/** An item's Explore page now opens the item inside the store in Discovery (owner, 12 Nov 2026). */
export default function ExploreItemRedirect({
  params,
}: {
  params: { id: string; itemId: string };
}) {
  permanentRedirect(discoverMerchantHref(params.id, params.itemId));
}
