import { redirect } from 'next/navigation';

import { riderPathForStep } from '@/components/rider-onboarding/types';
import { createClient } from '@/lib/supabase/server';

/**
 * /riders/apply is not a screen — it is "put me back where I was". A rider
 * who stopped at the documents step should land on the documents step.
 */
export const dynamic = 'force-dynamic';

export default async function RiderApplyIndex({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const supabase = createClient();

  const { data } = await supabase
    .from('rider')
    .select('onboarding_step, submitted_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.submitted_at) redirect('/riders/status');
  if (!data) {
    /* A new applicant from the /riders card: keep what they already typed. */
    const keep = new URLSearchParams();
    for (const key of ['first_name', 'phone', 'city', 'vehicle', 'invite'] as const) {
      const value = searchParams?.[key];
      if (typeof value === 'string' && value.length > 0 && value.length <= 100)
        keep.set(key, value);
    }
    const query = keep.toString();
    redirect(query ? `${riderPathForStep(1)}?${query}` : riderPathForStep(1));
  }
  redirect(riderPathForStep(data.onboarding_step ?? 1));
}
