import { redirect } from 'next/navigation';

import { pathForStep } from '@/components/onboarding/types';
import { createClient } from '@/lib/supabase/server';

/**
 * /merchants/apply is not a screen — it is "put me back where I was".
 *
 * A merchant who abandoned at the documents step and came back a week later
 * should land on the documents step, not at the beginning being asked their
 * name again.
 *
 * The query string is carried through rather than dropped: the register card
 * on the marketing page collects a name and a number before sending people
 * here, and making them type it a second time would be a poor thank-you for
 * having already filled it in.
 */
export const dynamic = 'force-dynamic';

export default async function ApplyIndex({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = createClient();

  const { data } = await supabase
    .from('merchant')
    .select('onboarding_step, submitted_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.submitted_at) redirect('/merchants/status');

  const step = data?.onboarding_step ?? 1;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === 'string' && value) query.set(key, value);
  }

  /* Only step 1 has anything to prefill; a draft already holds the answers. */
  const suffix = step === 1 && query.size > 0 ? `?${query.toString()}` : '';
  redirect(`${pathForStep(step)}${suffix}`);
}
