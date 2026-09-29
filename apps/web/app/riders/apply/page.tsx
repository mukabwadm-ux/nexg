import { redirect } from 'next/navigation';

import { riderPathForStep } from '@/components/rider-onboarding/types';
import { createClient } from '@/lib/supabase/server';

/**
 * /riders/apply is not a screen — it is "put me back where I was". A rider
 * who stopped at the documents step should land on the documents step.
 */
export const dynamic = 'force-dynamic';

export default async function RiderApplyIndex() {
  const supabase = createClient();

  const { data } = await supabase
    .from('rider')
    .select('onboarding_step, submitted_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.submitted_at) redirect('/riders/status');
  redirect(riderPathForStep(data?.onboarding_step ?? 1));
}
