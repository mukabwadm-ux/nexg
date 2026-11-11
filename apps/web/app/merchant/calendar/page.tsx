import { redirect } from 'next/navigation';

import { MerchantBookingWorkspace } from '@/components/merchant/booking/workspace';
import { legacyBookingState } from '@/lib/booking/board-data';
import { bookingEngineEnabledForMerchant } from '@/lib/booking/bridge';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function MerchantCalendarPage() {
  const merchant = await requireMerchant();
  if (!bookingEngineEnabledForMerchant(merchant.id, process.env)) redirect('/merchant/bookings');
  if (
    process.env.NODE_ENV === 'production' &&
    (await legacyBookingState(createClient(), merchant.id)) !== 'clear'
  )
    redirect('/merchant/bookings');
  return <MerchantBookingWorkspace />;
}
