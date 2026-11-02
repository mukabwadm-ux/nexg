import { RiderPayoutStep } from '@/components/rider-onboarding/step-payout';
import type { SlotOption } from '@/components/rider-onboarding/types';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const supabase = createClient();

  /* The rider's own city, next sessions first, full ones left out. */
  const { data: rider } = await supabase
    .from('rider')
    .select('city_id')
    .is('submitted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: slots } = rider?.city_id
    ? await supabase
        .from('onboarding_slot')
        .select('id, hub_name, starts_at, capacity, booked')
        .eq('city_id', rider.city_id)
        .gt('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(5)
    : { data: null };

  return <RiderPayoutStep slots={(slots as SlotOption[] | null) ?? []} />;
}
