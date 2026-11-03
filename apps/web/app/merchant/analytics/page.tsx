import { redirect } from 'next/navigation';

export const metadata = { title: 'Insights' };
export const dynamic = 'force-dynamic';

/** Keep existing bookmarks while moving reporting into the adaptive workspace. */
export default function MerchantAnalytics({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; tab?: string };
}): import('react').ReactNode {
  const params = new URLSearchParams();
  for (const key of ['from', 'to', 'tab'] as const) {
    const value = searchParams[key];
    if (typeof value === 'string') params.set(key, value);
  }
  redirect(`/merchant/insights${params.size ? `?${params.toString()}` : ''}`);
}
