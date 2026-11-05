import { LiveWorkWorkspace } from '@/components/merchant/work/live-workspace';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';
import { listBookingProfiles } from '@nexg/booking-config/profiles';

export const metadata = { title: 'Work' };
export const dynamic = 'force-dynamic';

export default async function WorkPage({ searchParams }: { searchParams?: { booking?: string } }) {
  const me = await requireMerchant();
  const bookingId = searchParams?.booking;
  const { data } = await createClient()
    .from('merchant')
    .select('subcategory')
    .eq('id', me.id)
    .maybeSingle();
  const profile = listBookingProfiles().find((entry) => entry.subcategoryId === data?.subcategory);
  const initialWorkflow =
    profile && profile.defaultModelId !== 'ORDER' ? 'WF_SCHEDULED_WORK' : 'WF_ORDER';
  return <LiveWorkWorkspace bookingId={bookingId} initialWorkflow={initialWorkflow} />;
}
