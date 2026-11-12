import { permanentRedirect } from 'next/navigation';

import { discoverCategoryHref } from '@/lib/discover-links';

/** Explore was retired for Discovery (owner, 12 Nov 2026). Old links keep their category and search. */
export default function ExploreRedirect({
  searchParams,
}: {
  searchParams?: { category?: string; q?: string };
}) {
  permanentRedirect(discoverCategoryHref(searchParams?.category, { search: searchParams?.q }));
}
